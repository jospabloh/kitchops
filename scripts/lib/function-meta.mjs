// The rules behind scripts/validate-function-meta.mjs (acacia-app-standard,
// Module 26), kept import-free so the same code runs under Node (the validator,
// in `npm run lint`) and under Deno (base44/tests/function_meta_test.ts).
//
// Every function directory carries a function.meta.json that says what the
// function is for, who calls it, and when it may go. The point is the second
// half: StockFlow kept a function deployed and maintained for five months with
// zero callers, and five "crons" that no scheduler ever ran. The code was the
// only record and the code did not say. Here the record is checked against the
// code, so it cannot quietly go stale.
//
// Nothing in this file touches the disk. The caller hands in file contents and
// gets back plain lists of errors and warnings.

export const META_KEYS = [
  "name",
  "purpose",
  "status",
  "created",
  "triggers",
  "auth",
  "tenant_scoped",
  "entities",
  "tests",
  "actions",
  "remove_when",
];
export const STATUSES = new Set(["active", "deprecated", "one-off"]);
export const AUTHS = new Set(["user", "service_role", "cron_secret", "hmac", "public"]);
const TRIGGER_KINDS = new Set(["cron", "entity", "agent", "backend", "external"]);

// A function that does not dispatch on a body field (no router, no
// `action ===` / `mode ===`) declares exactly one action under this key, so
// every function records its callers in the same place.
export const DEFAULT_ACTION = "default";

// Callers that live outside this repo cannot be grepped. They are written as
// `external:<system>[:<where>]` and only checked for shape.
export const EXTERNAL_PREFIX = "external:";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(s) {
  return typeof s === "string" && DATE_RE.test(s);
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0);
}

/** Action names registered in a router's handlers/index.ts (the HANDLERS map). */
export function parseRouterActions(indexSource) {
  const m = indexSource.match(/const\s+HANDLERS[^=]*=\s*\{([\s\S]*?)\}/);
  if (!m) return [];
  const names = [];
  for (const line of m[1].matchAll(/^\s*["']?([A-Za-z0-9_]+)["']?\s*[,:]/gm)) names.push(line[1]);
  return names;
}

/**
 * Values a non-router entry.ts dispatches on. Only `action`/`mode` taken from
 * the request body count (`const { action, … } = await req.json()` or `= body`)
 * — whatsapp's `mode` is Meta's `hub.mode` query parameter, not a dispatch.
 * Within those: `<key> === "x"`, and `case "x":` in a file that does
 * `switch (<key>)`.
 */
export function parseDispatchValues(entrySource) {
  const keys = new Set();
  for (const m of entrySource.matchAll(/const\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*=\s*(?:await\s+req\.json\(\)|body\b)/g)) {
    for (const k of ["action", "mode"]) if (new RegExp(`(^|[\\s,])${k}([\\s,=]|$)`).test(m[1])) keys.add(k);
  }
  const found = new Set();
  for (const k of keys) {
    for (const m of entrySource.matchAll(new RegExp(`\\b${k}\\s*===\\s*["']([^"']+)["']`, "g"))) found.add(m[1]);
    if (new RegExp(`switch\\s*\\(\\s*${k}\\s*\\)`).test(entrySource)) {
      for (const m of entrySource.matchAll(/\bcase\s+["']([^"']+)["']\s*:/g)) found.add(m[1]);
    }
  }
  return [...found].sort();
}

/**
 * Checks one function.meta.json against the standard's shape and against the
 * repo it lives in.
 *
 * ctx = {
 *   dir:           directory name under base44/functions
 *   dispatch:      action names the code dispatches on (router HANDLERS keys or
 *                  entry.ts dispatch values); [] for a single-purpose function
 *   entities:      Set of entity names in base44/entities
 *   functions:     Set of function directory names
 *   workflows:     Set of workflow names in base44/workflows
 *   files:         Set of repo-relative paths that exist (for `tests`)
 *   today:         "YYYY-MM-DD"
 * }
 */
export function validateMeta(meta, ctx) {
  const errors = [];
  const err = (msg) => errors.push(`${ctx.dir}: ${msg}`);

  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    err("function.meta.json no es un objeto JSON");
    return errors;
  }

  const keys = Object.keys(meta);
  for (const k of META_KEYS) if (!keys.includes(k)) err(`falta el campo "${k}"`);
  for (const k of keys) if (!META_KEYS.includes(k)) err(`campo desconocido "${k}"`);

  if (meta.name !== ctx.dir) err(`"name" es "${meta.name}" pero el directorio es "${ctx.dir}"`);
  if (typeof meta.purpose !== "string" || !meta.purpose.trim()) err('"purpose" vacío');
  if (!STATUSES.has(meta.status)) err(`"status" debe ser uno de ${[...STATUSES].join(" | ")}`);
  if (!isDate(meta.created)) err('"created" debe ser YYYY-MM-DD');
  if (!AUTHS.has(meta.auth)) err(`"auth" debe ser uno de ${[...AUTHS].join(" | ")}`);
  if (typeof meta.tenant_scoped !== "boolean") err('"tenant_scoped" debe ser true o false');

  // triggers
  if (!Array.isArray(meta.triggers)) {
    err('"triggers" debe ser una lista');
  } else {
    for (const t of meta.triggers) {
      if (typeof t !== "string") {
        err(`trigger no es texto: ${JSON.stringify(t)}`);
        continue;
      }
      if (t === "frontend") continue;
      const i = t.indexOf(":");
      const kind = i > 0 ? t.slice(0, i) : "";
      const target = i > 0 ? t.slice(i + 1) : "";
      if (!TRIGGER_KINDS.has(kind) || !target) {
        err(`trigger inválido "${t}" (frontend | cron:<workflow> | entity:<Entidad> | agent:<agente> | backend:<función> | external:<sistema>)`);
        continue;
      }
      if (kind === "cron" && !ctx.workflows.has(target)) {
        err(`trigger "${t}": no existe el workflow "${target}" en base44/workflows/ — un cron sin programador no corre nunca`);
      }
      if (kind === "entity" && !ctx.entities.has(target)) err(`trigger "${t}": no existe la entidad "${target}"`);
      if (kind === "backend" && !ctx.functions.has(target)) err(`trigger "${t}": no existe la función "${target}"`);
    }
  }

  // entities
  const ent = meta.entities;
  if (!ent || typeof ent !== "object" || Array.isArray(ent)) {
    err('"entities" debe ser { "reads": [...], "writes": [...] }');
  } else {
    for (const k of Object.keys(ent)) if (k !== "reads" && k !== "writes") err(`entities: campo desconocido "${k}"`);
    for (const k of ["reads", "writes"]) {
      if (!isStringArray(ent[k]) && !(Array.isArray(ent[k]) && ent[k].length === 0)) {
        err(`entities.${k} debe ser una lista de nombres de entidad`);
        continue;
      }
      for (const e of ent[k]) if (!ctx.entities.has(e)) err(`entities.${k}: no existe la entidad "${e}"`);
    }
  }

  // tests
  if (!Array.isArray(meta.tests)) {
    err('"tests" debe ser una lista de rutas');
  } else {
    for (const t of meta.tests) if (!ctx.files.has(t)) err(`tests: no existe "${t}"`);
  }

  // actions
  const actions = meta.actions;
  if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
    err('"actions" debe ser un objeto');
  } else {
    const declared = Object.keys(actions);
    const expected = ctx.dispatch.length ? ctx.dispatch : [DEFAULT_ACTION];
    for (const a of expected) {
      if (!declared.includes(a)) err(`la acción "${a}" existe en el código y no está en "actions"`);
    }
    for (const a of declared) {
      if (!expected.includes(a)) {
        err(
          ctx.dispatch.length
            ? `"actions" declara "${a}", que el código no despacha`
            : `"actions" declara "${a}"; una función sin despacho declara sólo "${DEFAULT_ACTION}"`,
        );
      }
      const spec = actions[a];
      if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
        err(`actions.${a} debe ser { "purpose", "callers" }`);
        continue;
      }
      for (const k of Object.keys(spec)) if (k !== "purpose" && k !== "callers") err(`actions.${a}: campo desconocido "${k}"`);
      if (typeof spec.purpose !== "string" || !spec.purpose.trim()) err(`actions.${a}.purpose vacío`);
      if (!Array.isArray(spec.callers) || !spec.callers.every((c) => typeof c === "string" && c)) {
        err(`actions.${a}.callers debe ser una lista de rutas o "external:<sistema>"`);
      }
    }
  }

  // remove_when
  const rw = meta.remove_when;
  if (rw !== null && (typeof rw !== "string" || !rw.trim())) err('"remove_when" debe ser null, una fecha o una condición');
  if ((meta.status === "one-off" || meta.status === "deprecated") && (rw === null || rw === undefined)) {
    err(`status "${meta.status}" exige "remove_when" (fecha o condición)`);
  }
  if (isDate(rw) && rw < ctx.today) err(`"remove_when" (${rw}) ya pasó: retírala o justifica una fecha nueva`);

  return errors;
}

/** Skips a string literal starting at i (the opening quote); returns the index after it. */
function skipString(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === "\\") j += 2;
    else if (src[j] === q) return j + 1;
    else j++;
  }
  return j;
}

/** Text from `start` up to (not including) the `)` that closes the call. */
function callArgs(src, start) {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return src.slice(start, i);
      depth--;
    }
    i++;
  }
  return src.slice(start);
}

/** The expression after `key:` up to the next top-level `,` or closing brace. */
function propertyExpr(args, from) {
  let depth = 0;
  let i = from;
  while (i < args.length) {
    const c = args[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(args, i);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth--;
    } else if (c === "," && depth === 0) break;
    i++;
  }
  return args.slice(from, i);
}

function literalsIn(expr) {
  return [...expr.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
}

/**
 * Every call site of a backend function found in `files` ([{ path, text }]).
 * Returns [{ fn, action, path }]. `action` is the body's `action`/`mode`
 * value, or DEFAULT_ACTION when the call carries neither.
 *
 * `declaredActions` (fn → names) resolves a dispatch value held in a variable
 * (`mode: modo`): the file counts as calling each declared action whose name
 * appears in it as a quoted literal.
 */
export function findCallSites(files, declaredActions = {}) {
  const sites = [];
  const seen = new Set();
  const add = (fn, action, path) => {
    const k = `${fn}\u0000${action}\u0000${path}`;
    if (seen.has(k)) return;
    seen.add(k);
    sites.push({ fn, action, path });
  };

  for (const { path, text } of files) {
    for (const m of text.matchAll(/\.invoke\(\s*(["'`])([^"'`]+)\1/g)) {
      const fn = m[2];
      const args = callArgs(text, m.index + m[0].length);
      const keyMatches = [...args.matchAll(/\b(action|mode)\s*:\s*/g)];
      if (!keyMatches.length) {
        add(fn, DEFAULT_ACTION, path);
        continue;
      }
      for (const km of keyMatches) {
        const expr = propertyExpr(args, km.index + km[0].length);
        const lits = literalsIn(expr);
        if (lits.length) {
          for (const a of lits) add(fn, a, path);
        } else {
          for (const a of declaredActions[fn] || []) {
            if (new RegExp(`["'\`]${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).test(text)) add(fn, a, path);
          }
        }
      }
    }
    // Base44 agents name their tool functions in their .jsonc config.
    for (const m of text.matchAll(/"function_name"\s*:\s*"([^"]+)"/g)) add(m[1], DEFAULT_ACTION, path);
  }
  return sites;
}

/**
 * Declared callers vs. the call sites actually in the repo. Both directions
 * fail: an undeclared caller, and a declared caller that no longer calls.
 * `frontendPrefix` marks which paths count as the `frontend` trigger.
 */
export function compareCallers(metas, sites, frontendPrefix = "src/") {
  const errors = [];
  const byName = new Map(metas.map((m) => [m.name, m]));
  const real = new Map(); // fn → action → Set(path)

  for (const s of sites) {
    const meta = byName.get(s.fn);
    if (!meta) {
      errors.push(`${s.path}: invoca "${s.fn}", que no existe en base44/functions/`);
      continue;
    }
    if (!meta.actions || !Object.hasOwn(meta.actions, s.action)) {
      errors.push(`${s.fn}: ${s.path} invoca la acción "${s.action}", que no está declarada`);
      continue;
    }
    if (!real.has(s.fn)) real.set(s.fn, new Map());
    const per = real.get(s.fn);
    if (!per.has(s.action)) per.set(s.action, new Set());
    per.get(s.action).add(s.path);
  }

  for (const meta of metas) {
    const per = real.get(meta.name) || new Map();
    let fromFrontend = false;
    for (const [action, spec] of Object.entries(meta.actions || {})) {
      const declared = new Set((spec?.callers || []).filter((c) => !c.startsWith(EXTERNAL_PREFIX)));
      const found = per.get(action) || new Set();
      for (const p of found) {
        if (p.startsWith(frontendPrefix)) fromFrontend = true;
        if (!declared.has(p)) errors.push(`${meta.name}.${action}: ${p} la llama y no está en callers`);
      }
      for (const p of declared) {
        if (!found.has(p)) errors.push(`${meta.name}.${action}: declara a ${p} como caller y ya no la llama`);
      }
    }
    const triggers = Array.isArray(meta.triggers) ? meta.triggers : [];
    if (fromFrontend && !triggers.includes("frontend")) {
      errors.push(`${meta.name}: la llama ${frontendPrefix} y "triggers" no incluye "frontend"`);
    }
    if (!fromFrontend && triggers.includes("frontend")) {
      errors.push(`${meta.name}: "triggers" incluye "frontend" y nada en ${frontendPrefix} la llama`);
    }
  }
  return errors;
}

/**
 * Not failures — the standard's checks do not forbid them — but exactly what
 * this module exists to make visible: a function nothing triggers, and an
 * action nobody calls.
 */
export function collectWarnings(metas) {
  const warnings = [];
  for (const meta of metas) {
    if (meta.status === "active" && Array.isArray(meta.triggers) && meta.triggers.length === 0) {
      warnings.push(`${meta.name}: activa y sin ningún trigger — nada la llama (ver "purpose")`);
    }
    for (const [action, spec] of Object.entries(meta.actions || {})) {
      if (Array.isArray(spec?.callers) && spec.callers.length === 0) {
        warnings.push(`${meta.name}.${action}: sin callers`);
      }
    }
  }
  return warnings;
}

function cell(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function list(xs) {
  return xs && xs.length ? xs.map((x) => `\`${x}\``).join(", ") : "—";
}

/** docs/FUNCTIONS_REGISTRY.md, generated from the metas. Deterministic: no dates of its own. */
export function renderRegistry(metas, appName = "") {
  const sorted = [...metas].sort((a, b) => a.name.localeCompare(b.name));
  const out = [];
  out.push(`# Registro de funciones${appName ? ` — ${appName}` : ""}`);
  out.push("");
  out.push("<!-- GENERADO por `npm run generate:function-registry` desde base44/functions/*/function.meta.json.");
  out.push("     No lo edites a mano: edita el function.meta.json y regenera. CI falla si está desactualizado. -->");
  out.push("");
  out.push(
    "Módulo 26 del estándar ACACIA: cada función dice para qué existe, quién la llama y cuándo se puede retirar.",
  );
  out.push("");
  out.push(`${sorted.length} funciones.`);
  out.push("");
  out.push("| función | estado | triggers | auth | inquilino | propósito |");
  out.push("|---|---|---|---|---|---|");
  for (const m of sorted) {
    out.push(
      `| [\`${m.name}\`](#${m.name.toLowerCase()}) | ${m.status} | ${
        m.triggers?.length ? m.triggers.map((t) => `\`${t}\``).join("<br>") : "**ninguno**"
      } | ${m.auth} | ${m.tenant_scoped ? "sí" : "no"} | ${cell(m.purpose)} |`,
    );
  }
  for (const m of sorted) {
    out.push("");
    out.push(`## ${m.name}`);
    out.push("");
    out.push(cell(m.purpose));
    out.push("");
    out.push(`- **Estado:** ${m.status} · **creada:** ${m.created} · **retirar cuando:** ${m.remove_when ?? "—"}`);
    out.push(`- **Triggers:** ${m.triggers?.length ? list(m.triggers) : "**ninguno**"}`);
    out.push(`- **Auth:** ${m.auth} · **filtra por inquilino:** ${m.tenant_scoped ? "sí" : "no"}`);
    out.push(`- **Lee:** ${list(m.entities?.reads)}`);
    out.push(`- **Escribe:** ${list(m.entities?.writes)}`);
    out.push(`- **Pruebas:** ${list(m.tests)}`);
    out.push("");
    out.push("| acción | propósito | callers |");
    out.push("|---|---|---|");
    for (const [a, spec] of Object.entries(m.actions || {}).sort(([x], [y]) => x.localeCompare(y))) {
      const callers = spec.callers?.length ? spec.callers.map((c) => `\`${c}\``).join("<br>") : "**ninguno**";
      out.push(`| \`${a}\` | ${cell(spec.purpose)} | ${callers} |`);
    }
  }
  out.push("");
  return out.join("\n");
}
