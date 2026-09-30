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
