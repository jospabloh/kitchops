// The four checks every Safe function runs before it writes anything, in one
// place so no handler can forget one or reorder them.
//
// GENERATED FILE — do not edit by hand. See _permissions.ts's header; run
// `npm run generate:function-shared` to refresh every copy.
//
// Order matters and is not arbitrary:
//
//   1. AUTHENTICATED?      no token → 401, before anything touches the DB.
//   2. RIGHT TENANT?       the body's business_id must equal the caller's own.
//                          Checked before the permission lookup so a caller can
//                          never probe another tenant's permission profile by
//                          sending its id.
//   3. PERMISSION + BILLING  resolved together by hasPermission(), which folds
//                          in the billing_status gate (view_only/suspended
//                          reject every write) ahead of the role/override
//                          resolution.
//   4. …then the handler's own field validation.
//
// The Business row is read once here and handed back, so handlers don't each
// re-read it, and so the billing gate and the handler see the same snapshot.

import { hasPermission, type PermissionUser } from "./_permissions.ts";

export interface GuardOk {
  ok: true;
  user: PermissionUser & Record<string, unknown>;
  business: Record<string, unknown>;
  businessId: string;
  // deno-lint-ignore no-explicit-any
  sr: any;
}

export interface GuardFail {
  ok: false;
  response: Response;
}

export type GuardResult = GuardOk | GuardFail;

export interface GuardOptions {
  /**
   * Skip the billing_status gate for this call.
   *
   * Exactly one caller uses it today — opening a support ticket — and the
   * reason is narrow: a `suspended` tenant is the tenant MOST likely to need
   * support ("¿por qué no puedo entrar?"), so blocking their ticket would leave
   * them with no channel but the email address on the login page. Every other
   * check (auth, tenant match, permission key) still runs.
   *
   * Do not reach for this to make a feature "work while suspended" — that is
   * what view_only is for, and Module 1 wants the degrade to be visible.
   */
  ignoreBillingBlock?: boolean;
}

/**
 * @param base44   client built from the incoming request
 * @param body     already-parsed request body (handlers need it anyway)
 * @param key      permission key, e.g. "Gastos:create"
 * @param options  see GuardOptions — the escape hatch is deliberately narrow
 */
export async function guard(
  // deno-lint-ignore no-explicit-any
  base44: any,
  body: Record<string, unknown>,
  key: string,
  options: GuardOptions = {},
): Promise<GuardResult> {
  const user = await base44.auth.me().catch(() => null);
  if (!user) {
    return { ok: false, response: Response.json({ message: "Unauthorized" }, { status: 401 }) };
  }

  const sr = base44.asServiceRole;
  const callerBusinessId = user.business_id;
  const bodyBusinessId = typeof body.business_id === "string" ? body.business_id : null;

  if (!callerBusinessId) {
    return {
      ok: false,
      response: Response.json(
        { message: "Todavía no perteneces a ningún negocio." },
        { status: 403 },
      ),
    };
  }
  // The platform admin is allowed to act on a tenant it is currently in; every
  // other caller must be acting on their own. A mismatch is answered the same
  // way whether the id is another tenant's or nonsense — an outsider does not
  // get to learn which tenants exist by probing ids.
  if (bodyBusinessId && bodyBusinessId !== callerBusinessId) {
    return { ok: false, response: Response.json({ message: "No autorizado." }, { status: 403 }) };
  }

  const business = await sr.entities.Business.get(callerBusinessId).catch(() => null);
  if (!business) {
    return {
      ok: false,
      response: Response.json({ message: "Ese negocio ya no existe." }, { status: 404 }),
    };
  }

  // Passing undefined as the status is what makes hasPermission skip its
  // billing branch — the status itself is still on `business` for the handler.
  const statusForCheck = options.ignoreBillingBlock ? undefined : business.billing_status;
  const allowed = await hasPermission(sr, user, key, statusForCheck);
  if (!allowed) {
    const blocked = !options.ignoreBillingBlock &&
      (business.billing_status === "view_only" || business.billing_status === "suspended");
    return {
      ok: false,
      response: Response.json(
        blocked
          ? {
              message:
                business.billing_status === "suspended"
                  ? "Tu negocio está suspendido. Reactívalo para poder guardar cambios."
                  : "Tu negocio está en modo de solo lectura. Puedes consultar, pero no guardar cambios.",
              reason: "write_blocked",
              billing_status: business.billing_status,
            }
          : { message: "No tienes permiso para hacer esto.", reason: "forbidden", permission: key },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user, business, businessId: callerBusinessId, sr };
}
