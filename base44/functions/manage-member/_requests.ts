// Reglas puras de las solicitudes de unión (sin imports, para `deno test`).
//
// Quien decide una solicitud (aprobar/rechazar) tiene que ser business_admin del
// negocio DESTINO, y ese negocio sale del registro guardado del propio
// solicitante (`pending_business_id`), nunca de lo que mande el cliente. El rol
// que recibe se valida contra una lista blanca: 'admin' es el nivel de
// plataforma y no lo reparte ningún restaurante (src/lib/rbac.js).

export const ASSIGNABLE_ROLES = ["business_admin", "staff"] as const;

export interface RequestUser {
  id?: string;
  role?: string;
  business_id?: string | null;
  pending_business_id?: string | null;
}

export interface Denied {
  ok: false;
  status: number;
  message: string;
}

export function isAssignableRole(role: unknown): role is typeof ASSIGNABLE_ROLES[number] {
  return typeof role === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

// El negocio sobre el que actúa quien decide: su propio negocio; el dueño de la
// plataforma puede indicar otro. Vacío = ninguno (nadie sin negocio decide nada,
// y `undefined === undefined` no debe parecer una coincidencia).
export function targetBusinessOf(caller: RequestUser, requested?: unknown): string | null {
  if (caller.role === "admin" && typeof requested === "string" && requested) return requested;
  return caller.business_id || null;
}

export function canDecideRequest(
  caller: RequestUser,
  member: RequestUser | null | undefined,
  targetBusinessId: string | null,
): Denied | { ok: true } {
  if (caller.role !== "admin" && caller.role !== "business_admin") {
    return { ok: false, status: 403, message: "No autorizado." };
  }
  if (!targetBusinessId) {
    return { ok: false, status: 403, message: "No autorizado." };
  }
  if (caller.role === "business_admin" && caller.business_id !== targetBusinessId) {
    return { ok: false, status: 403, message: "No autorizado." };
  }
  // Misma respuesta para "no existe" y "pidió otro negocio": no se explora qué
  // personas están pidiendo entrar a qué negocios.
  if (!member || member.pending_business_id !== targetBusinessId) {
    return { ok: false, status: 404, message: "Solicitud no encontrada." };
  }
  if (member.id && caller.id && member.id === caller.id) {
    return { ok: false, status: 400, message: "No puedes decidir tu propia solicitud." };
  }
  return { ok: true };
}

export function validateApproval(member: RequestUser, role: unknown): Denied | { ok: true; role: typeof ASSIGNABLE_ROLES[number] } {
  if (!isAssignableRole(role)) {
    return { ok: false, status: 400, message: "role inválido." };
  }
  // Ya está dentro de un negocio (aprobado por otro camino): no se le mueve.
  if (member.business_id) {
    return { ok: false, status: 409, message: "Esa persona ya pertenece a un negocio." };
  }
  return { ok: true, role };
}

// Lo que se escribe al aprobar. Al dueño de plataforma no se le toca `role`:
// escribirlo en esa cuenta cuelga la petición (ver complete-onboarding).
export function approvalPatch(member: RequestUser, businessId: string, role: string) {
  return {
    ...(member.role === "admin" ? {} : { role }),
    business_id: businessId,
    pending_business_id: null,
    join_requested_at: null,
  };
}

export function clearRequestPatch() {
  return { pending_business_id: null, join_requested_at: null };
}

// ---- "No existe" frente a "falló" (copia de complete-onboarding/_join.ts) -----
// Sólo un negocio confirmado como inexistente limpia la solicitud; un timeout o
// un 5xx se propaga para que la interfaz no muestre "aprobado" sin serlo.

export function isNotFoundError(error: unknown): boolean {
  // deno-lint-ignore no-explicit-any
  const e = error as any;
  const status = e?.status ?? e?.statusCode ?? e?.response?.status;
  if (status === 404) return true;
  if (status !== undefined && status !== null) return false;
  return /\b(not[\s_-]?found|no encontrado)\b/i.test(String(e?.message ?? ""));
}

export type BusinessLookup<T> = { state: "found"; business: T } | { state: "missing" };

export async function lookupBusiness<T>(get: () => Promise<T | null | undefined>): Promise<BusinessLookup<T>> {
  let found: T | null | undefined;
  try {
    found = await get();
  } catch (error) {
    if (isNotFoundError(error)) return { state: "missing" };
    throw error;
  }
  return found ? { state: "found", business: found } : { state: "missing" };
}

// ---- Last-admin guard (module 2) ------------------------------------------
// A restaurant must never be left without someone who can approve requests,
// change roles and run the danger zone. The platform owner ("admin") counts as
// present when he is a member.

// "admin" is the platform tier: a platform owner who is the only member of a
// tenant is its administrator too, so removing him leaves no one.
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "business_admin" || role === "admin";
}

export function countTenantAdmins(members: Array<{ role?: string | null }>): number {
  return members.filter((m) => isAdminRole(m.role)).length;
}

// Pre-check on a fresh read of the members, before the write. `nextRole` null
// means removal.
export function wouldLeaveNoAdmin(
  members: Array<{ role?: string | null }>,
  target: { role?: string | null },
  nextRole: string | null,
): boolean {
  if (!isAdminRole(target.role)) return false;
  if (isAdminRole(nextRole)) return false;
  return countTenantAdmins(members) <= 1;
}

// Recount after the write: two admins changed at the same moment can each pass
// the pre-check. True = undo your write. Only a write that took an admin away
// can be blamed.
export function lostAllAdmins(
  membersAfter: Array<{ role?: string | null }>,
  targetWasBusinessAdmin: boolean,
): boolean {
  return targetWasBusinessAdmin && countTenantAdmins(membersAfter) === 0;
}
