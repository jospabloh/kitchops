// Pins the RLS validator's rules (scripts/lib/rls-rules.mjs, the module behind
// `npm run validate:rls`) and runs them over the real entity files, so a write
// branch that lets a member skip a Safe function fails here as well as in lint.
//
//   deno test --allow-env --allow-read base44/tests/

import { assert, assertEquals, assertFalse } from "./_assert.ts";
import { checkEntitySchema, stripJsonComments } from "../../scripts/lib/rls-rules.mjs";

const ADMIN = { user_condition: { role: "admin" } };
const TENANT = { "data.business_id": "{{user.data.business_id}}" };
const READ = { $or: [TENANT, ADMIN] };

function tenantSchema(rls: Record<string, unknown>) {
  return { properties: { business_id: { type: "string" } }, rls };
}

function errorsFor(name: string, schema: unknown): string[] {
  return checkEntitySchema(name, schema).errors;
}

Deno.test("escritura sólo de servicio + lectura de inquilino es la forma válida", () => {
  const r = checkEntitySchema(
    "Gasto",
    tenantSchema({ create: ADMIN, read: READ, update: ADMIN, delete: ADMIN }),
  );
  assertEquals(r.errors, []);
  assert(r.tenantScoped);
});

Deno.test("una rama de inquilino en una escritura falla (se saltaría la función Safe)", () => {
  const conStaff = {
    $or: [{ $and: [TENANT, { user_condition: { role: "staff" } }] }, ADMIN],
  };
  const errs = errorsFor(
    "Gasto",
    tenantSchema({ create: ADMIN, read: READ, update: conStaff, delete: ADMIN }),
  );
  assertEquals(errs.length, 1);
  assert(errs[0].startsWith("[update] write rule must be exactly"));
});

Deno.test("sin rama admin en una escritura sigue fallando (caída de las funciones Safe)", () => {
  const errs = errorsFor(
    "Gasto",
    tenantSchema({ create: ADMIN, read: READ, update: ADMIN, delete: TENANT }),
  );
  assertEquals(errs.length, 1);
  assert(errs[0].includes("must include"));
});

Deno.test("read sin su mitad de inquilino falla; sin read también", () => {
  const sinTenant = errorsFor(
    "Gasto",
    tenantSchema({ create: ADMIN, read: { $or: [{ "data.x": "1" }, ADMIN] }, update: ADMIN, delete: ADMIN }),
  );
  assert(sinTenant.some((e) => e.startsWith("[read]") && e.includes("data.business_id")));

  const sinAdmin = errorsFor(
    "Gasto",
    tenantSchema({ create: ADMIN, read: TENANT, update: ADMIN, delete: ADMIN }),
  );
  assert(sinAdmin.some((e) => e.startsWith("[read]") && e.includes("must also include")));

  const sinRead = errorsFor("Gasto", tenantSchema({ create: ADMIN, update: ADMIN, delete: ADMIN }));
  assert(sinRead.some((e) => e.startsWith("[read]")));
});

Deno.test("Business: update de business_admin ya no es válido; AppSession conserva su rama propia", () => {
  const businessAdmin = {
    $or: [{ $and: [{ "data.tenant_id": "{{user.data.business_id}}" }, {
      user_condition: { role: "business_admin" },
    }] }, ADMIN],
  };
  const b = errorsFor("Business", {
    properties: {},
    rls: { create: ADMIN, read: READ, update: businessAdmin, delete: ADMIN },
  });
  assert(b.some((e) => e.startsWith("[update]")));

  // AppSession is the one documented client writer (the heartbeat): its
  // created_by_id branch on create/update stays valid.
  const own = { $or: [ADMIN, { created_by_id: "{{user.id}}" }] };
  assertEquals(
    errorsFor("AppSession", {
      properties: { business_id: { type: "string" } },
      rls: { create: own, read: own, update: own, delete: ADMIN },
    }),
    [],
  );
});

Deno.test("las entidades del repo pasan, y los candados de campo nuevos están puestos", async () => {
  const dir = new URL("../entities/", import.meta.url);
  const schemas: Record<string, any> = {};
  for await (const f of Deno.readDir(dir)) {
    if (!f.name.endsWith(".jsonc")) continue;
    const name = f.name.replace(/\.jsonc$/, "");
    schemas[name] = JSON.parse(stripJsonComments(await Deno.readTextFile(new URL(f.name, dir))));
    assertEquals(checkEntitySchema(name, schemas[name]).errors, [], name);
  }
  const adminWrite = JSON.stringify({ write: ADMIN });
  for (const field of ["invite_code", "invite_code_active", "tenant_id", "billing_status"]) {
    assertEquals(JSON.stringify(schemas.Business.properties[field].rls), adminWrite, field);
  }
  for (const field of ["revoked_at", "revoked_by"]) {
    assertEquals(JSON.stringify(schemas.AppSession.properties[field].rls), adminWrite, field);
  }
  // The heartbeat still has to be able to create and touch its own row.
  assertFalse("rls" in schemas.AppSession.properties.last_active_at);
});
