#!/usr/bin/env node
// Function metadata check (acacia-app-standard, Module 26).
//
// Every directory under base44/functions/ with an entry.ts/entry.js carries a
// function.meta.json saying what it is for, who calls it and when it may go.
// This script holds that file to the code:
//
//   1. every endpoint has a valid function.meta.json;
//   2. every action the code dispatches on — a router's handlers/index.ts, or
//      a single function's `action ===` / `mode ===` / `switch (action)` — is
//      in `actions`, and nothing else is;
//   3. declared callers match the call sites in src/, base44/functions/,
//      base44/workflows/ and base44/agents/, in both directions;
//   4. a `cron:` trigger names a workflow that exists in base44/workflows/;
//   5. `one-off`/`deprecated` carry `remove_when`, and no date in it has passed;
//   6. docs/FUNCTIONS_REGISTRY.md is what the metas generate.
//
// Callers outside this repo (Mission Control, WhatsApp providers) are written
// `external:<system>[:<where>]` and only checked for shape — grep cannot see
// them, which is precisely why they have to be written down.
//
// A function nothing triggers, or an action nobody calls, is printed as a
// warning, not a failure: the standard does not forbid it, but the point of
// this module is that it is never invisible.
//
// The rules live in scripts/lib/function-meta.mjs, import-free so
// base44/tests/function_meta_test.ts can test them.
//
// Run:  npm run validate:function-meta        (inside `npm run lint` and CI)
//       npm run generate:function-registry    (rewrites docs/FUNCTIONS_REGISTRY.md)

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { findEndpoints } from "./validate-functions.mjs";
import {
  collectWarnings,
  compareCallers,
  findCallSites,
  parseDispatchValues,
  parseRouterActions,
  renderRegistry,
  validateMeta,
} from "./lib/function-meta.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUNCTIONS_DIR = path.join(ROOT, "base44", "functions");
const ENTITIES_DIR = path.join(ROOT, "base44", "entities");
const WORKFLOWS_DIR = path.join(ROOT, "base44", "workflows");
const REGISTRY = path.join(ROOT, "docs", "FUNCTIONS_REGISTRY.md");
const CALLER_DIRS = ["src", "base44/functions", "base44/workflows", "base44/agents"];
const CODE_EXT = /\.(m?[jt]sx?|jsonc?)$/;

const write = process.argv.includes("--write");
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function workflowNames() {
  const names = new Set();
  for (const file of walk(WORKFLOWS_DIR)) {
    names.add(path.basename(file).replace(/\.[^.]+$/, ""));
    const m = readFileSync(file, "utf8").match(/"name"\s*:\s*"([^"]+)"/);
    if (m) names.add(m[1]);
  }
  return names;
}

const errors = [];
const endpoints = findEndpoints(FUNCTIONS_DIR).map((e) => e.split(path.sep).join("/")).sort();
const ctxBase = {
  entities: new Set(
    existsSync(ENTITIES_DIR)
      ? readdirSync(ENTITIES_DIR).filter((f) => /\.jsonc?$/.test(f)).map((f) => f.replace(/\.jsonc?$/, ""))
      : [],
  ),
  functions: new Set(endpoints),
  workflows: workflowNames(),
  files: { has: (p) => existsSync(path.join(ROOT, p)) },
  today: new Date().toISOString().slice(0, 10),
};

const metas = [];
for (const endpoint of endpoints) {
  const dir = path.join(FUNCTIONS_DIR, endpoint);
  const metaFile = path.join(dir, "function.meta.json");
  if (!existsSync(metaFile)) {
    errors.push(`${endpoint}: falta function.meta.json`);
    continue;
  }
  let meta;
  try {
    meta = JSON.parse(readFileSync(metaFile, "utf8"));
  } catch (e) {
    errors.push(`${endpoint}: function.meta.json no es JSON válido (${e.message})`);
    continue;
  }

  const index = path.join(dir, "handlers", "index.ts");
  const entry = existsSync(path.join(dir, "entry.ts")) ? path.join(dir, "entry.ts") : path.join(dir, "entry.js");
  const dispatch = existsSync(index)
    ? parseRouterActions(readFileSync(index, "utf8"))
    : parseDispatchValues(readFileSync(entry, "utf8"));

  errors.push(...validateMeta(meta, { ...ctxBase, dir: endpoint, dispatch }));
  metas.push(meta);
}

const files = CALLER_DIRS.flatMap((d) => walk(path.join(ROOT, d)))
  .filter((f) => CODE_EXT.test(f) && !f.endsWith("function.meta.json"))
  .map((f) => ({ path: rel(f), text: readFileSync(f, "utf8") }));
const declaredActions = Object.fromEntries(metas.map((m) => [m.name, Object.keys(m.actions || {})]));
errors.push(...compareCallers(metas, findCallSites(files, declaredActions)));

const warnings = collectWarnings(metas);

// 6. The registry. Only meaningful once every meta parsed.
let registryNote = "";
if (metas.length === endpoints.length) {
  const appName = existsSync(path.join(ROOT, "base44.app.json"))
    ? JSON.parse(readFileSync(path.join(ROOT, "base44.app.json"), "utf8")).name || ""
    : "";
  const rendered = renderRegistry(metas, appName);
  const current = existsSync(REGISTRY) ? readFileSync(REGISTRY, "utf8") : null;
  if (write) {
    if (current !== rendered) {
      mkdirSync(path.dirname(REGISTRY), { recursive: true });
      writeFileSync(REGISTRY, rendered);
      registryNote = `escrito ${rel(REGISTRY)}`;
    } else registryNote = `${rel(REGISTRY)} ya estaba al día`;
  } else if (current !== rendered) {
    errors.push(`${rel(REGISTRY)} está desactualizado — corre \`npm run generate:function-registry\` y haz commit`);
  }
}

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n✗ ${errors.length} problema(s) en los function.meta.json (Módulo 26).`);
  process.exit(1);
}
console.log(
  `✓ ${metas.length} function.meta.json válidos, callers al día${registryNote ? `; ${registryNote}` : ", registro al día"}.` +
    (warnings.length ? ` ${warnings.length} aviso(s) arriba.` : ""),
);
