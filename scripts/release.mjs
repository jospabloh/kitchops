#!/usr/bin/env node
// The release step. Stamps src/lib/appConfig.js's APP_VERSION and RELEASE_DATE,
// after regenerating the function helpers and running every check.
//
// WHY THIS IS A SEPARATE SCRIPT AND NOT PART OF `npm run build`:
// "build validates, release generates" (acacia-app-standard, Module 6). A
// generator that stamps a date into a git-TRACKED file on every build produces
// a spurious local diff on every build, which then fights the next `git pull`
// the moment main carries someone else's real release. FlowFin shipped exactly
// that and spent weeks resolving conflicts in a file nobody had edited. So the
// only thing that writes appConfig.js is a human running this, deliberately.
//
//   npm run release -- patch     0.1.0 → 0.1.1   (default)
//   npm run release -- minor     0.1.0 → 0.2.0
//   npm run release -- major     0.1.0 → 1.0.0
//   npm run release -- 1.4.2     explicit
//   npm run release -- patch --dry-run

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CONFIG = path.join(ROOT, "src", "lib", "appConfig.js");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bump = args.find((a) => !a.startsWith("--")) || "patch";

function run(cmd, label) {
  process.stdout.write(`  ${label}… `);
  try {
    execSync(cmd, { cwd: ROOT, stdio: "pipe" });
    console.log("ok");
  } catch (e) {
    console.log("FALLÓ\n");
    console.error(e.stdout?.toString() || e.message);
    process.exit(1);
  }
}

const source = readFileSync(CONFIG, "utf8");
const actual = source.match(/export const APP_VERSION = "([^"]+)"/)?.[1];
if (!actual) {
  console.error("✖ No pude leer APP_VERSION de src/lib/appConfig.js.");
  process.exit(1);
}

function siguiente(version, tipo) {
  if (/^\d+\.\d+\.\d+$/.test(tipo)) return tipo;
  const [ma, mi, pa] = version.split(".").map(Number);
  if (tipo === "major") return `${ma + 1}.0.0`;
  if (tipo === "minor") return `${ma}.${mi + 1}.0`;
  if (tipo === "patch") return `${ma}.${mi}.${pa + 1}`;
  console.error(`✖ "${tipo}" no es major, minor, patch ni una versión x.y.z.`);
  process.exit(1);
}

const nueva = siguiente(actual, bump);
const hoy = new Date().toISOString().slice(0, 10);

console.log(`\nKitchOps  ${actual} → ${nueva}  (${hoy})\n`);

// Every check runs BEFORE the version is written. A release that stamps a
// version and then fails lint leaves the repo claiming a version that was never
// actually validated.
console.log("Revisando:");
run("npm run generate:function-shared -- --check", "helpers de funciones al día");
run("npm run validate:rls", "reglas RLS");
run("npm run lint", "lint");
run("npm run build", "build");

// The changelog is written by a person. An auto-generated "Actualización a la
// versión x.y.z" entry is worse than no entry: it fills the Novedades tab with
// noise that teaches users the tab isn't worth opening.
if (!source.includes(`version: "${nueva}"`)) {
  console.log(
    `\n⚠  CHANGELOG no tiene una entrada para ${nueva}.\n` +
      `   Agrégala en src/lib/appConfig.js antes de publicar — se muestra en\n` +
      `   Cuenta → Novedades, y una entrada automática del tipo "actualización\n` +
      `   a la versión x.y.z" sólo le enseña al usuario a no abrir esa pestaña.\n`,
  );
}

if (dryRun) {
  console.log("\n--dry-run: no escribí nada.\n");
  process.exit(0);
}

const actualizado = source
  .replace(/export const APP_VERSION = "[^"]+"/, `export const APP_VERSION = "${nueva}"`)
  .replace(/export const RELEASE_DATE = "[^"]+"/, `export const RELEASE_DATE = "${hoy}"`);

writeFileSync(CONFIG, actualizado);

console.log(`\n✓ src/lib/appConfig.js actualizado a ${nueva} (${hoy}).\n`);
console.log("Siguiente:");
console.log(`  git add src/lib/appConfig.js && git commit -m "release: v${nueva}"`);
console.log("  …y despliega el esquema de entidades a Base44 si cambió alguna.\n");
