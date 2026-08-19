#!/usr/bin/env node
// Regenerates the per-function-group copies of _permissions.ts / _guard.ts /
// _audit.ts from the canonical sources in scripts/lib/function-shared/, and
// stamps the permission defaults into _permissions.ts from the ONE client
// registry (src/lib/permissionRegistry.js).
//
// Why copies at all: Base44 deploys each directory under base44/functions/ as
// an isolated Deno function. A function cannot import a file from a sibling
// function's directory, so shared server-side logic has to physically exist
// once per group. StockFlow hit the same constraint and landed on the same
// answer (scripts/generatePermissionManifests.mjs).
//
// N identical GENERATED copies are fine. N copies that someone edited by hand
// are the bug — client and server would resolve the same permission key
// differently while both looking correct. This script is what makes the copies
// a build artifact rather than a maintenance burden.
//
// Run: npm run generate:function-shared   (wired into `npm run release`)
// CI runs it too and fails if it produces a diff — see .github/workflows/ci.yml.

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SHARED_DIR = path.join(__dirname, "lib", "function-shared");
const FUNCTIONS_DIR = path.join(ROOT, "base44", "functions");

const { PERMISSION_REGISTRY, ALL_PERMISSION_KEYS } = await import(
  path.join(ROOT, "src", "lib", "permissionRegistry.js")
);

// ── 1. Build the REGISTRY_DEFAULTS literal from the client registry ─────────
const defaultsLiteral = ALL_PERMISSION_KEYS.map((key) => {
  const roles = PERMISSION_REGISTRY[key];
  const entries = Object.entries(roles)
    .map(([role, value]) => `"${role}": ${value}`)
    .join(", ");
  return `  "${key}": { ${entries} },`;
}).join("\n");

const registryBlock = `const REGISTRY_DEFAULTS: Record<string, Record<string, boolean>> = {
${defaultsLiteral}
};

export const ALL_PERMISSION_KEYS: string[] = [
${ALL_PERMISSION_KEYS.map((k) => `  "${k}",`).join("\n")}
];`;

function stampRegistry(source) {
  const begin = "// AUTOGEN:REGISTRY:BEGIN";
  const end = "// AUTOGEN:REGISTRY:END";
  const startIdx = source.indexOf(begin);
  const endIdx = source.indexOf(end);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error("_permissions.ts is missing its AUTOGEN:REGISTRY markers.");
  }
  return (
    source.slice(0, startIdx + begin.length) +
    "\n" +
    registryBlock +
    "\n" +
    source.slice(endIdx)
  );
}

// ── 2. Read the canonical sources ───────────────────────────────────────────
const sources = {};
for (const file of readdirSync(SHARED_DIR)) {
  if (!file.endsWith(".ts")) continue;
  let content = readFileSync(path.join(SHARED_DIR, file), "utf8");
  if (file === "_permissions.ts") content = stampRegistry(content);
  sources[file] = content;
}

// ── 3. Fan them out to every function group that already has a copy ─────────
// A group opts in by containing at least one of these files (created once, by
// hand, when the group is first written). This script never invents new copies
// in groups that don't use them — a function with no permission checks (the
// public WhatsApp webhook's own entry, health) shouldn't carry dead code.
const groups = readdirSync(FUNCTIONS_DIR).filter((name) =>
  statSync(path.join(FUNCTIONS_DIR, name)).isDirectory()
);

let written = 0;
const touched = [];
const checkOnly = process.argv.includes("--check");
let drift = false;

for (const group of groups) {
  const handlersDir = path.join(FUNCTIONS_DIR, group, "handlers");
  let targetDir = null;
  try {
    if (statSync(handlersDir).isDirectory()) targetDir = handlersDir;
  } catch {
    targetDir = null;
  }
  if (!targetDir) continue;

  const existing = new Set(readdirSync(targetDir));
  for (const [file, content] of Object.entries(sources)) {
    if (!existing.has(file)) continue; // group opted out of this helper
    const dest = path.join(targetDir, file);
    const current = readFileSync(dest, "utf8");
    if (current === content) continue;
    if (checkOnly) {
      drift = true;
      console.error(`✖ out of date: base44/functions/${group}/handlers/${file}`);
      continue;
    }
    writeFileSync(dest, content);
    written++;
    touched.push(`${group}/handlers/${file}`);
  }
}

if (checkOnly) {
  if (drift) {
    console.error(
      "\ngenerate-function-shared --check: the generated helpers are stale. " +
        "Run `npm run generate:function-shared` and commit the result."
    );
    process.exit(1);
  }
  console.log(`✓ generate-function-shared --check: all copies match (${ALL_PERMISSION_KEYS.length} keys).`);
} else {
  console.log(
    `✓ generate-function-shared: ${ALL_PERMISSION_KEYS.length} permission keys, ` +
      `${written} file(s) updated${touched.length ? `:\n   ${touched.join("\n   ")}` : "."}`
  );
}
