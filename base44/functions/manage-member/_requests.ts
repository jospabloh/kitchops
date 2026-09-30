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
