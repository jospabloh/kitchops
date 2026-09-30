#!/usr/bin/env node
// Static RLS checker (acacia-app-standard, Module 4). Parses every
// base44/entities/*.jsonc and fails the build on a malformed rule shape.
//
// It exists because both halves of a Base44 RLS comparison fail SILENTLY when
// they are wrong, in opposite and equally invisible directions:
//
//   - entity side: custom fields live under `data.`. A bare "business_id" names
//     a field that does not exist, so the rule matches EVERY row — RLS
//     effectively off, cross-tenant leak.
//   - user side: custom user fields resolve as `{{user.data.business_id}}`. A
//     bare `{{user.business_id}}` resolves to nothing, so the rule matches ZERO
//     rows — every tenant sees an empty app.
//
// Neither raises an error at runtime. StockFlow shipped both, in production,
// three days apart (2026-06-16 / 06-17) — see acacia-app-standard
// docs/incidents.md. This script is the cheap guard against repeating that.
//
// What it CANNOT catch: an over-restrictive but syntactically valid rule (the
// FlowFin family_id incident — a rule that simply forgot non-admin members
// existed, undetected for 9 days). A clean run means "no obvious mistakes", not
// "definitely correct".
//
// Run: npm run validate:rls  (also wired into `npm run lint` and CI)

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTITIES_DIR = path.join(__dirname, "..", "base44", "entities");

// Entities that intentionally carry no business_id: the tenant root itself
// (scoped by its built-in `id`), the built-in User, and AppSession (scoped by
// the built-in, unspoofable `created_by_id` — see its header comment).
const NON_TENANT_ENTITIES = new Set(["Business", "User", "AppSession"]);

// The built-in User is not a normal entity — Base44 manages it through the
// app's auth system, and an entity-level `rls` block on it silently breaks
// writes: asServiceRole.entities.User.update() hangs instead of throwing, so
// onboarding dies with an empty-bodied HTTP 500. Field-level rls on
// role/business_id is the supported — and the security-relevant — half.
const NO_ENTITY_RLS_ENTITIES = new Set(["User"]);

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

/** Minimal // and /* *​/ stripper that respects string literals. */
function stripJsonComments(text) {
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
function checkUserTemplates(value, entity, op, errors) {
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
function checkEntityKeys(rule, entity, op, errors) {
  if (rule === null || typeof rule !== "object" || Array.isArray(rule)) return;
  for (const key of Object.keys(rule)) {
    if (key === "user_condition") continue;
    if (LOGICAL_OPERATORS.has(key)) {
      const branches = Array.isArray(rule[key]) ? rule[key] : [rule[key]];
      branches.forEach((b) => checkEntityKeys(b, entity, op, errors));
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

function checkEntity(fileName) {
  const entityName = fileName.replace(/\.jsonc?$/, "");
  const errors = [];
  const warnings = [];

  let schema;
  try {
    schema = JSON.parse(stripJsonComments(readFileSync(path.join(ENTITIES_DIR, fileName), "utf8")));
  } catch (e) {
    errors.push(`could not parse JSON: ${e.message}`);
    return { entityName, errors, warnings, tenantScoped: false };
  }

  const rls = schema.rls || {};
  const ops = ["create", "read", "update", "delete"];

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
    return { entityName, errors, warnings, tenantScoped: false };
  }

  for (const op of ops) {
    if (!(op in rls)) {
      warnings.push(`no rls.${op} rule — falls back to the platform default; confirm that's intended.`);
      continue;
    }
    checkUserTemplates(rls[op], entityName, op, errors);
    checkEntityKeys(rls[op], entityName, op, errors);
  }

  const hasBusinessId = Boolean(schema.properties && "business_id" in schema.properties);
  const isTenantEntity = hasBusinessId && !NON_TENANT_ENTITIES.has(entityName);
  if (!isTenantEntity) return { entityName, errors, warnings, tenantScoped: false };

  // An entity whose read is exactly the admin condition is a service-only
  // ledger (WhatsAppEvento), not something a tenant reads — exempt by design.
  const readJson = JSON.stringify(rls.read ?? null);
  const adminOnlyRead = readJson === `{${ADMIN_BRANCH}}`;

  if (rls.read && !adminOnlyRead) {
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

  for (const op of ["create", "update", "delete"]) {
    if (!(op in rls)) {
      errors.push(`[${op}] tenant-scoped entity must define a ${op} rule.`);
      continue;
    }
    if (!hasAdminBranch(rls[op])) {
      errors.push(
        `[${op}] tenant-scoped write rule must include {"user_condition":{"role":"admin"}}. ` +
          `Backend writes go through base44.asServiceRole (role:admin, no end-user context); ` +
          `without this branch the user template resolves to empty and EVERY write via a Safe ` +
          `function fails — a silent, app-wide write outage while reads keep working.`
      );
    }
  }

  return { entityName, errors, warnings, tenantScoped: true };
}

function main() {
  const files = readdirSync(ENTITIES_DIR).filter((f) => f.endsWith(".jsonc") || f.endsWith(".json"));
  let hasErrors = false;
  let tenantScoped = 0;

  for (const file of files.sort()) {
    const result = checkEntity(file);
    if (result.tenantScoped) tenantScoped++;
    for (const e of result.errors) {
      hasErrors = true;
      console.error(`✖ ${result.entityName}: ${e}`);
    }
    for (const w of result.warnings) {
      console.warn(`⚠ ${result.entityName}: ${w}`);
    }
  }

  if (hasErrors) {
    console.error("\nvalidate-rls: failing build — malformed RLS rule(s) above.");
    process.exit(1);
  }
  console.log(`✓ validate-rls: ${files.length} entities checked, ${tenantScoped} tenant-scoped, no issues found.`);
}

main();
