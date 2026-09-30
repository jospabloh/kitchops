// Reglas puras del onboarding (sin imports, para probarlas con `deno test`).
//
// UNIRSE CON UN CÓDIGO NO DA ACCESO. Un código es una llave que se pasa por
// WhatsApp y se reenvía: si bastara para entrar, quien lo viera entraría a los
// gastos y cortes del negocio. Ahora sólo abre una SOLICITUD: se guarda
// `pending_business_id` en el User (campo bloqueado a admin, igual que
// business_id) y el dueño la aprueba dentro de la app eligiendo el rol
// (manage-member: approve_request). Mientras tanto `business_id` sigue vacío,
// así que la RLS y _guard.ts le niegan todo.

export interface OnboardingUser {
  id?: string;
  role?: string;
  business_id?: string | null;
  pending_business_id?: string | null;
}

export interface Rejection {
  ok: false;
  status: number;
  message: string;
}

export function normalizeInviteCode(raw: unknown): string {
  return String(raw ?? "").replace(/[\s-]/g, "").toUpperCase();
}

// Una persona pertenece a un solo negocio. Quien ya tiene uno no crea ni
// solicita otro (sin selector, un segundo dejaría el primero inalcanzable).
export function alreadyInBusiness(user: OnboardingUser): Rejection | null {
  if (user.business_id) {
    return {
      ok: false,
      status: 409,
      message: "Ya perteneces a un negocio. Pide a un administrador que te dé de baja antes de unirte a otro.",
    };
  }
  return null;
}

// Un solicitante pendiente tampoco crea su propio negocio: quedaría con dos
// caminos abiertos y la aprobación pendiente se volvería una segunda pertenencia.
export function blockCreateWhilePending(user: OnboardingUser): Rejection | null {
  if (user.pending_business_id) {
    return {
      ok: false,
      status: 409,
      message: "Tienes una solicitud pendiente para unirte a un negocio. Cancélala antes de crear el tuyo.",
    };
  }
  return null;
}

export interface JoinBusiness {
  id: string;
  invite_code_active?: boolean;
}

export type JoinPlan =
  | Rejection
  | { ok: true; patch: { pending_business_id: string; join_requested_at: string } };

// Misma respuesta para "no existe ese código" y "código apagado": un código
// equivocado no debe revelar si alguna vez fue bueno.
export function planJoinRequest(business: JoinBusiness | null | undefined, now: Date): JoinPlan {
  if (!business || business.invite_code_active === false) {
    return { ok: false, status: 404, message: "Código de invitación inválido." };
  }
  return {
    ok: true,
    patch: { pending_business_id: business.id, join_requested_at: now.toISOString() },
  };
}

// ---- Lecturas que deciden: qué es "no existe" y qué es "falló" ----------------
//
// Una solicitud pendiente sólo se borra cuando se CONFIRMÓ que el negocio ya no
// existe. Un timeout o un 5xx no es "no existe": tragárselo borraba solicitudes
// válidas. (Copia idéntica en manage-member/_requests.ts: Deno aísla directorios.)

export function isNotFoundError(error: unknown): boolean {
  // deno-lint-ignore no-explicit-any
  const e = error as any;
  const status = e?.status ?? e?.statusCode ?? e?.response?.status;
  if (status === 404) return true;
  if (status !== undefined && status !== null) return false;
  return /\b(not[\s_-]?found|no encontrado)\b/i.test(String(e?.message ?? ""));
}

export type BusinessLookup<T> = { state: "found"; business: T } | { state: "missing" };

// Sólo "no encontrado" (error 404 o resultado vacío) es `missing`; cualquier otro
// error se propaga tal cual.
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

// Quién es quien llama, para decidir crear/unirse. Si la lectura fresca del User
// (service role) salió bien, manda la fila guardada, INCLUIDO un
// pending_business_id explícitamente null (si no, `??` volvía a la vista cacheada
// de auth.me() y resucitaba una solicitud ya cancelada). auth.me() sólo sirve de
// respaldo cuando la lectura falló.
export function resolveCaller(
  authUser: OnboardingUser,
  stored: OnboardingUser | null | undefined,
  readOk: boolean,
): OnboardingUser {
  if (readOk && stored) {
    return {
      ...authUser,
      pending_business_id: stored.pending_business_id ?? null,
      business_id: stored.business_id ?? null,
    };
  }
  return {
    ...authUser,
    pending_business_id: authUser.pending_business_id ?? null,
    business_id: authUser.business_id ?? null,
  };
}
