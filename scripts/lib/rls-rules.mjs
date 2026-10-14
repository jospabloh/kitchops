// The rules behind scripts/validate-rls.mjs, kept import-free so the same code
// runs under Node (the validator, in `npm run lint`) and under Deno
// (base44/tests/rls_rules_test.ts). See validate-rls.mjs for why this exists.

// Entities that intentionally carry no business_id: the tenant root itself
// (scoped by its built-in `id`), the built-in User, and AppSession (scoped by
// the built-in, unspoofable `created_by_id` — see its header comment).
export const NON_TENANT_ENTITIES = new Set(["Business", "User", "AppSession"]);

// The built-in User is not a normal entity — Base44 manages it through the
// app's auth system, and an entity-level `rls` block on it silently breaks
// writes: asServiceRole.entities.User.update() hangs instead of throwing, so
// onboarding dies with an empty-bodied HTTP 500. Field-level rls on
// role/business_id is the supported — and the security-relevant — half.
export const NO_ENTITY_RLS_ENTITIES = new Set(["User"]);

// Entities whose create/update/delete must be EXACTLY the service-role
// condition: every tenant entity, plus Business. All of them are written only
// by Safe functions through base44.asServiceRole, which is where tenant,
// permission key and billing_status are checked (_guard.ts). A tenant branch on
// a write op lets any member call base44.entities.X.update() from the browser
// and skip all three — a staff without Ingresos:conciliar reconciling a cut, a
// suspended tenant still writing, a business_admin copying another
// restaurant's invite_code. AppSession is the one documented client writer
// (src/lib/SessionHeartbeat.jsx) and is not in this set.
export const SERVICE_ONLY_WRITE_EXTRA = new Set(["Business"]);

const BUILTIN_ENTITY_FIELDS = new Set([
  "id",
  "created_by_id",
  "created_by",
  "created_date",
  "updated_date",
]);
const BUILTIN_USER_VARS = new Set(["id", "email", "role"]);
const LOGICAL_OPERATORS = new Set(["$or", "$and", "$nor", "$not"]);
const ADMIN_BRANCH = '"user_condition":{"role":"admin"}';
const ADMIN_ONLY = `{${ADMIN_BRANCH}}`;

/** Minimal // and /* *​/ stripper that respects string literals. */
export function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += next;
        i++;
      } else if (c === stringChar) {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      stringChar = c;
      out += c;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

function hasAdminBranch(rule) {
  return JSON.stringify(rule).includes(ADMIN_BRANCH);
}

/** Every {{user.*}} template must be a bare built-in or start with data. */
function checkUserTemplates(value, op, errors) {
  const json = JSON.stringify(value);
  const re = /\{\{\s*user\.([a-zA-Z0-9_.]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(json)) !== null) {
    const p = m[1];
    if (p.startsWith("data.") || BUILTIN_USER_VARS.has(p)) continue;
    errors.push(
      `[${op}] user template "{{user.${p}}}" is invalid — custom user fields must be ` +
        `"{{user.data.${p}}}" (only id/email/role are bare built-ins). A non-resolving ` +
        `template matches ZERO rows: every tenant sees an empty app.`
    );
  }
}

/** Every entity-side key must be a built-in or data.-prefixed. */
function checkEntityKeys(rule, op, errors) {
  if (rule === null || typeof rule !== "object" || Array.isArray(rule)) return;
  for (const key of Object.keys(rule)) {
    if (key === "user_condition") continue;
    if (LOGICAL_OPERATORS.has(key)) {
      const branches = Array.isArray(rule[key]) ? rule[key] : [rule[key]];
      branches.forEach((b) => checkEntityKeys(b, op, errors));
      continue;
    }
    if (key.startsWith("$") || key.startsWith("data.")) continue;
    if (BUILTIN_ENTITY_FIELDS.has(key)) continue;
    errors.push(
      `[${op}] rule key "${key}" must use the "data." prefix — custom entity fields live ` +
        `under data.; a bare "${key}" names nothing and the rule matches EVERY row ` +
        `(RLS effectively disabled, cross-tenant leak).`
    );
  }
}

function checkServiceOnlyWrites(rls, errors) {
  for (const op of ["create", "update", "delete"]) {
    if (!(op in rls)) {
      errors.push(`[${op}] must define a ${op} rule.`);
      continue;
    }
    if (!hasAdminBranch(rls[op])) {
      errors.push(
        `[${op}] write rule must include {"user_condition":{"role":"admin"}}. ` +
          `Backend writes go through base44.asServiceRole (role:admin, no end-user context); ` +
          `without this branch the user template resolves to empty and EVERY write via a Safe ` +
          `function fails — a silent, app-wide write outage while reads keep working.`
      );
      continue;
    }
    if (JSON.stringify(rls[op]) !== ADMIN_ONLY) {
      errors.push(
        `[${op}] write rule must be exactly {"user_condition":{"role":"admin"}} (service role ` +
          `only). Every write goes through a Safe function, which checks tenant, permission key ` +
          `and billing_status; any other branch here lets a member skip all three by calling ` +
          `the SDK from the browser.`
      );
    }
  }
}

/**
 * Checks one parsed entity schema. Returns { errors, warnings, tenantScoped }.
 * Pure: no file access, so tests can feed it hand-written schemas.
 */
export function checkEntitySchema(entityName, schema) {
  const errors = [];
  const warnings = [];
  const rls = schema.rls || {};

  // Built-in User: entity-level rls is forbidden, field-level locks are required.
  if (NO_ENTITY_RLS_ENTITIES.has(entityName)) {
    if (Object.keys(rls).length > 0) {
      errors.push(
        'has an entity-level "rls" block. The built-in User is managed by Base44\'s auth ' +
          "system and does not support one — adding it makes asServiceRole.entities.User.update() " +
          "hang, so onboarding fails with an empty-bodied HTTP 500. Keep field-level rls on " +
          "role/business_id only (see this entity's header comment)."
      );
    }
    for (const field of ["role", "business_id", "pending_business_id", "join_requested_at"]) {
      const write = schema.properties?.[field]?.rls?.write;
      if (!write || !hasAdminBranch(write)) {
        errors.push(
          `property "${field}" is missing its field-level rls.write lock to ` +
            `{"user_condition":{"role":"admin"}} — without it ANY authenticated user can ` +
            `escalate with auth.updateMe({ ${field}: ... }).`
        );
      }
    }
    return { errors, warnings, tenantScoped: false };
  }

  for (const op of ["create", "read", "update", "delete"]) {
    if (!(op in rls)) {
      warnings.push(`no rls.${op} rule — falls back to the platform default; confirm that's intended.`);
      continue;
    }
    checkUserTemplates(rls[op], op, errors);
    checkEntityKeys(rls[op], op, errors);
  }

  const hasBusinessId = Boolean(schema.properties && "business_id" in schema.properties);
  const isTenantEntity = hasBusinessId && !NON_TENANT_ENTITIES.has(entityName);

  if (SERVICE_ONLY_WRITE_EXTRA.has(entityName)) checkServiceOnlyWrites(rls, errors);
  if (!isTenantEntity) return { errors, warnings, tenantScoped: false };

  // An entity whose read is exactly the admin condition is a service-only
  // ledger (WhatsAppEvento), not something a tenant reads — exempt by design.
  const readJson = JSON.stringify(rls.read ?? null);
  const adminOnlyRead = readJson === ADMIN_ONLY;

  if (!rls.read) {
    errors.push(`[read] tenant-scoped entity must define a read rule.`);
  } else if (!adminOnlyRead) {
    if (!readJson.includes('"data.business_id":"{{user.data.business_id}}"')) {
      errors.push(
        `[read] tenant-scoped entity (has business_id) must filter read by ` +
          `{"data.business_id":"{{user.data.business_id}}"} — otherwise it is readable ` +
          `across tenants.`
      );
    }
    // The tenant equality keeps end users isolated, but the read rule must ALSO
    // carry the service-role branch: backend Safe functions load a record via
    // base44.asServiceRole BEFORE acting on it, and asServiceRole evaluates as
    // role:admin with NO end-user context. Without this branch those reads
    // return zero rows, the function sees "not found", and the action silently
    // does nothing.
    if (!readJson.includes(ADMIN_BRANCH)) {
      errors.push(
        `[read] tenant-scoped read rule must also include {"user_condition":{"role":"admin"}}. ` +
          `Backend reads go through base44.asServiceRole (role:admin, no end-user context); ` +
          `without this branch asServiceRole.filter() returns empty and every Safe function ` +
          `that reads-then-writes fails silently.`
      );
    }
  }

  checkServiceOnlyWrites(rls, errors);
  return { errors, warnings, tenantScoped: true };
}
