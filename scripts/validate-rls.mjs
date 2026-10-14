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
// It also enforces the write half of "every write goes through a Safe
// function": on every tenant entity (and Business) create/update/delete must be
// exactly {"user_condition":{"role":"admin"}} — the service role. A tenant
// branch there let any member skip permission keys and the billing gate by
// calling the SDK from the browser (found 2026-10-14). The rules themselves
// live in scripts/lib/rls-rules.mjs, import-free so base44/tests/ can test them.
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
import { checkEntitySchema, stripJsonComments } from "./lib/rls-rules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTITIES_DIR = path.join(__dirname, "..", "base44", "entities");

function checkEntity(fileName) {
  const entityName = fileName.replace(/\.jsonc?$/, "");
  let schema;
  try {
    schema = JSON.parse(stripJsonComments(readFileSync(path.join(ENTITIES_DIR, fileName), "utf8")));
  } catch (e) {
    return { entityName, errors: [`could not parse JSON: ${e.message}`], warnings: [], tenantScoped: false };
  }
  return { entityName, ...checkEntitySchema(entityName, schema) };
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
