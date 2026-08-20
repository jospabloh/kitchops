// Real unit tests against the actual permission-resolution code — not a
// simulation of it.
//
// This is possible because _permissions.ts imports nothing: no SDK, no network,
// and `asServiceRole` is passed in rather than constructed. That constraint is
// deliberate and worth preserving. The moment this file needs a mocked Base44
// client to run, these stop being tests of the real logic and become tests of
// the mock — which is exactly how a permission check drifts from the thing it
// is supposed to mirror while every test stays green.
//
// Every function group carries an identical generated copy of _permissions.ts;
// importing one of them tests them all, because they are byte-identical by
// construction (scripts/generate-function-shared.mjs, verified in CI with
// --check).
//
//   deno test --allow-env base44/tests/

import { assertEquals } from "./_assert.ts";
import {
  hasPermission,
  isWriteKey,
  registryDefault,
  type PermissionUser,
} from "../functions/gastos/handlers/_permissions.ts";

// Minimal stand-in for asServiceRole: only PermissionProfile.filter is ever
// touched, so only that is provided. `calls` records what was asked for, which
// is how the cross-tenant test proves the query was scoped.
function stubServiceRole(profiles: Array<{ permissions?: Record<string, boolean> }> = []) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    entities: {
      PermissionProfile: {
        filter: (q: Record<string, unknown>) => {
          calls.push(q);
          return Promise.resolve(profiles);
        },
      },
    },
  };
}

const staff: PermissionUser = { id: "u1", email: "cocina@taqueria.mx", role: "staff", business_id: "b1" };
const owner: PermissionUser = { id: "u2", email: "dueno@taqueria.mx", role: "business_admin", business_id: "b1" };
const platform: PermissionUser = { id: "u3", email: "ops@acaciaco.com.mx", role: "admin", business_id: "b1" };

// ── The platform tier ─────────────────────────────────────────────────────
Deno.test("el admin de plataforma pasa todo, incluso lo que el registro niega", async () => {
  const sr = stubServiceRole();
  assertEquals(await hasPermission(sr, platform, "Bitacora:view"), true);
  assertEquals(await hasPermission(sr, platform, "Cuenta:danger_zone"), true);
  // …and without even reading a profile: role admin short-circuits.
  assertEquals(sr.calls.length, 0);
});

Deno.test("sin usuario, nada", async () => {
  const sr = stubServiceRole();
  assertEquals(await hasPermission(sr, null, "Gastos:view"), false);
  assertEquals(await hasPermission(sr, undefined, "Gastos:create"), false);
});

// ── Registry defaults ─────────────────────────────────────────────────────
Deno.test("los defaults del registro se respetan por rol", async () => {
  const sr = stubServiceRole();
  // Capturing expenses is the staff's daily job.
  assertEquals(await hasPermission(sr, staff, "Gastos:create"), true);
  // Deleting one silently changes a closed week — owner only.
  assertEquals(await hasPermission(sr, staff, "Gastos:delete"), false);
  assertEquals(await hasPermission(sr, owner, "Gastos:delete"), true);
  // The money roll-up is not for the line.
  assertEquals(await hasPermission(sr, staff, "Dashboard:financials"), false);
  assertEquals(await hasPermission(sr, owner, "Dashboard:financials"), true);
});

Deno.test("business_admin no consulta perfil: no es sobrescribible", async () => {
  // A profile row that tries to restrict the owner must be ignored — the owner
  // IS the tenant, and a UI that rendered such a switch would be lying.
  const sr = stubServiceRole([{ permissions: { "Gastos:delete": false } }]);
  assertEquals(await hasPermission(sr, owner, "Gastos:delete"), true);
  assertEquals(sr.calls.length, 0);
});

// ── Explicit overrides ────────────────────────────────────────────────────
Deno.test("un override explícito gana sobre el default, en ambos sentidos", async () => {
  const permisivo = stubServiceRole([{ permissions: { "Gastos:delete": true } }]);
  assertEquals(await hasPermission(permisivo, staff, "Gastos:delete"), true);

  const restrictivo = stubServiceRole([{ permissions: { "Gastos:create": false } }]);
  assertEquals(await hasPermission(restrictivo, staff, "Gastos:create"), false);
});

Deno.test("una clave ausente del perfil cae en el default, no en false", async () => {
  // The stored profile holds ONLY deliberate exceptions. Treating "absent" as
  // "denied" would silently revoke everything the admin never touched.
  const sr = stubServiceRole([{ permissions: { "Gastos:delete": true } }]);
  assertEquals(await hasPermission(sr, staff, "Gastos:create"), true);
  assertEquals(await hasPermission(sr, staff, "Inventario:edit_stock"), true);
});

Deno.test("el perfil se consulta acotado al negocio y al rol del llamante", async () => {
  const sr = stubServiceRole([]);
  await hasPermission(sr, staff, "Gastos:create");
  assertEquals(sr.calls.length, 1);
  // If this query ever stopped carrying business_id, one tenant's profile could
  // resolve another tenant's permissions.
  assertEquals(sr.calls[0], { business_id: "b1", role: "staff" });
});

Deno.test("si el perfil no se puede leer, se cae al default (no se abre el acceso)", async () => {
  const roto = {
    entities: {
      PermissionProfile: {
        filter: () => Promise.reject(new Error("backend caído")),
      },
    },
  };
  assertEquals(await hasPermission(roto, staff, "Gastos:create"), true); // default: sí
  assertEquals(await hasPermission(roto, staff, "Gastos:delete"), false); // default: no
});

// ── The billing gate ──────────────────────────────────────────────────────
Deno.test("view_only y suspended bloquean escrituras pero no lecturas", async () => {
  const sr = stubServiceRole();
  for (const estado of ["view_only", "suspended"]) {
    assertEquals(await hasPermission(sr, owner, "Gastos:create", estado), false);
    assertEquals(await hasPermission(sr, owner, "Gastos:delete", estado), false);
    // Reading its own books is the entire point of "solo lectura".
    assertEquals(await hasPermission(sr, owner, "Gastos:view", estado), true);
    assertEquals(await hasPermission(sr, owner, "Dashboard:financials", estado), true);
  }
});

Deno.test("trial y active no bloquean nada", async () => {
  const sr = stubServiceRole();
  for (const estado of ["trial", "active", undefined]) {
    assertEquals(await hasPermission(sr, owner, "Gastos:create", estado), true);
  }
});

Deno.test("el bloqueo por facturación no aplica al admin de plataforma", async () => {
  // Support has to be able to act on a suspended tenant — that is often exactly
  // why they are in there.
  const sr = stubServiceRole();
  assertEquals(await hasPermission(sr, platform, "Gastos:create", "suspended"), true);
});

Deno.test("un override permisivo no vence al bloqueo por facturación", async () => {
  const sr = stubServiceRole([{ permissions: { "Gastos:delete": true } }]);
  assertEquals(await hasPermission(sr, staff, "Gastos:delete", "view_only"), false);
});

// ── Write-key classification ──────────────────────────────────────────────
Deno.test("isWriteKey separa lecturas de escrituras", () => {
  assertEquals(isWriteKey("Gastos:view"), false);
  assertEquals(isWriteKey("Dashboard:financials"), false);
  assertEquals(isWriteKey("WhatsApp:read_inbox"), false);
  assertEquals(isWriteKey("Gastos:create"), true);
  assertEquals(isWriteKey("Gastos:delete"), true);
  assertEquals(isWriteKey("Ingresos:conciliar"), true);
  assertEquals(isWriteKey("WhatsApp:manage_numbers"), true);
});

// ── Unknown roles ─────────────────────────────────────────────────────────
Deno.test("un rol desconocido se niega por defecto", async () => {
  const sr = stubServiceRole();
  const raro: PermissionUser = { id: "u9", role: "cocinero_jefe", business_id: "b1" };
  assertEquals(await hasPermission(sr, raro, "Gastos:view"), false);
  assertEquals(await hasPermission(sr, raro, "Gastos:create"), false);
});

Deno.test("registryDefault no inventa claves", () => {
  assertEquals(registryDefault("Gastos:create", "staff"), true);
  assertEquals(registryDefault("Clave:inexistente", "staff"), false);
  assertEquals(registryDefault("Gastos:create", undefined), false);
});
