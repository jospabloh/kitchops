// Reglas puras de "unirse con código = solicitud pendiente" y de su aprobación.
// Las dos funciones (complete-onboarding, manage-member) delegan en estos
// módulos sin imports, así que esto prueba la lógica real, no un doble.
//
//   deno test --allow-env base44/tests/

import { assert, assertEquals, assertFalse } from "./_assert.ts";
import {
  alreadyInBusiness,
  blockCreateWhilePending,
  normalizeInviteCode,
  planJoinRequest,
} from "../functions/complete-onboarding/_join.ts";
import {
  approvalPatch,
  canDecideRequest,
  clearRequestPatch,
  isAssignableRole,
  targetBusinessOf,
  validateApproval,
} from "../functions/manage-member/_requests.ts";

const NOW = new Date("2026-09-30T12:00:00Z");

Deno.test("el código se normaliza: mayúsculas, sin espacios ni guiones", () => {
  assertEquals(normalizeInviteCode(" ab3k-m9xz "), "AB3KM9XZ");
  assertEquals(normalizeInviteCode(undefined), "");
});

Deno.test("unirse con un código válido SOLO pide solicitud: no escribe business_id ni role", () => {
  const plan = planJoinRequest({ id: "b1", invite_code_active: true }, NOW);
  assert(plan.ok);
  if (plan.ok) {
    assertEquals(plan.patch, { pending_business_id: "b1", join_requested_at: NOW.toISOString() });
    assertFalse("business_id" in plan.patch);
    assertFalse("role" in plan.patch);
  }
});

Deno.test("código inexistente y código apagado dan la misma respuesta", () => {
  const a = planJoinRequest(undefined, NOW);
  const b = planJoinRequest({ id: "b1", invite_code_active: false }, NOW);
  assertEquals(a, b);
  assertEquals(a.ok, false);
});

Deno.test("quien ya tiene negocio no crea ni solicita otro (409)", () => {
  assertEquals(alreadyInBusiness({ business_id: "b1" })?.status, 409);
  assertEquals(alreadyInBusiness({}), null);
});

Deno.test("un solicitante pendiente no puede crear su propio negocio (409)", () => {
  assertEquals(blockCreateWhilePending({ pending_business_id: "b1" })?.status, 409);
  assertEquals(blockCreateWhilePending({ pending_business_id: null }), null);
});

Deno.test("solo business_id del negocio destino puede decidir; el rol de plataforma no se reparte", () => {
  assert(isAssignableRole("staff"));
  assert(isAssignableRole("business_admin"));
  assertFalse(isAssignableRole("admin"));
  assertFalse(isAssignableRole(undefined));
  assertFalse(isAssignableRole("owner"));
});

Deno.test("targetBusinessOf: el negocio del que decide; solo la plataforma elige otro", () => {
  assertEquals(targetBusinessOf({ role: "business_admin", business_id: "b1" }, "b2"), "b1");
  assertEquals(targetBusinessOf({ role: "admin", business_id: "b1" }, "b2"), "b2");
  assertEquals(targetBusinessOf({ role: "business_admin", business_id: null }), null);
});

Deno.test("canDecideRequest: staff no decide; otro negocio no decide; sin negocio no decide", () => {
  const applicant = { id: "u2", pending_business_id: "b1" };
  const admin = { id: "u1", role: "business_admin", business_id: "b1" };
  assert(canDecideRequest(admin, applicant, "b1").ok);
  assertEquals(canDecideRequest({ id: "u9", role: "staff", business_id: "b1" }, applicant, "b1").ok, false);
  // business_admin de OTRO negocio, aunque el cuerpo nombre b1
  assertEquals(canDecideRequest({ id: "u8", role: "business_admin", business_id: "b2" }, applicant, "b1").ok, false);
  // sin negocio: null === null no es coincidencia
  assertEquals(
    canDecideRequest({ id: "u7", role: "business_admin", business_id: null }, { id: "u3", pending_business_id: null }, null).ok,
    false,
  );
});

Deno.test("canDecideRequest: la solicitud es de OTRO negocio o no existe -> mismo 404", () => {
  const admin = { id: "u1", role: "business_admin", business_id: "b1" };
  const otro = canDecideRequest(admin, { id: "u2", pending_business_id: "b2" }, "b1");
  const nada = canDecideRequest(admin, null, "b1");
  const sinSolicitud = canDecideRequest(admin, { id: "u3" }, "b1");
  assertEquals(otro, nada);
  assertEquals(nada, sinSolicitud);
  assertEquals(nada.ok === false && nada.status, 404);
});

Deno.test("nadie decide su propia solicitud", () => {
  const yo = { id: "u1", role: "business_admin", business_id: "b1", pending_business_id: "b1" };
  const r = canDecideRequest(yo, yo, "b1");
  assertEquals(r.ok === false && r.status, 400);
});

Deno.test("validateApproval: rol fuera de la lista blanca se rechaza; quien ya está dentro no se mueve", () => {
  assertEquals(validateApproval({ id: "u2" }, "admin").ok, false);
  assertEquals(validateApproval({ id: "u2" }, undefined).ok, false);
  const dentro = validateApproval({ id: "u2", business_id: "b9" }, "staff");
  assertEquals(dentro.ok === false && dentro.status, 409);
  const ok = validateApproval({ id: "u2" }, "business_admin");
  assert(ok.ok);
});

Deno.test("approvalPatch: escribe business_id + rol elegido y limpia la solicitud", () => {
  assertEquals(approvalPatch({ role: "staff" }, "b1", "business_admin"), {
    role: "business_admin",
    business_id: "b1",
    pending_business_id: null,
    join_requested_at: null,
  });
});

Deno.test("approvalPatch: al dueño de plataforma no se le escribe role", () => {
  assertFalse("role" in approvalPatch({ role: "admin" }, "b1", "staff"));
});

Deno.test("clearRequestPatch solo limpia la solicitud", () => {
  assertEquals(clearRequestPatch(), { pending_business_id: null, join_requested_at: null });
});
