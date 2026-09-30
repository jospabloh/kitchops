import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import {
  type JoinBusiness,
  alreadyInBusiness,
  blockCreateWhilePending,
  normalizeInviteCode,
  planJoinRequest,
} from "./_join.ts";

// Onboarding Safe function (Modules 2 & 3): the ONLY place a user's
// role/business_id are ever set. It runs the writes as service role so it can
// bypass the User entity's admin-only field lock on those two fields — but only
// after validating the request server-side, independently of whatever the
// client UI showed. That independent re-check is exactly what the StockFlow
// permission-bypass incident needed and didn't have.
//
// mode "create": the caller becomes business_admin of a brand-new Business.
//                billing_status starts "trial"; Mission Control's unified
//                lifecycle cron takes it from there and this function never
//                touches billing_status again (Module 1).
// mode "join":   the caller redeems an existing restaurant's invite_code. That
//                only files a REQUEST (User.pending_business_id): no
//                business_id, no role, no data. The restaurant's business_admin
//                approves it inside the app and picks the role
//                (manage-member: approve_request). See ./_join.ts.
// mode "status": the caller's pending request, if any (survives a reload).
// mode "cancel": the caller withdraws their pending request.

// The platform owner (role "admin") keeps that role when they join a tenant —
// they get a business_id and nothing else. Two reasons:
//
// 1. Correctness. "admin" is the ACACIA platform tier, not a tenant tier
//    (src/lib/rbac.js). Demoting the owner to business_admin because they
//    happened to create a restaurant would strip the exact tier every entity's
//    RLS service-role branch is written against.
//
// 2. It does not work anyway. The owner's User row is also the app's Base44
//    collaborator record. Writing role away from "admin" on that row never
//    returns — the request hangs until the runtime kills it, so the browser
//    sees an empty-bodied HTTP 500. Every other account onboards fine; the only
//    thing different about this one is that it owns the app.
function rolePatchFor(user: { role?: string }, tenantRole: string) {
  return user.role === "admin" ? {} : { role: tenantRole };
}

// asServiceRole writes to the built-in User entity can hang rather than throw
// (see base44/entities/User.jsonc's header). A hang gives the caller an
// empty-bodied 500 with nothing to act on, so bound it and say what happened.
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} no respondió en ${ms / 1000}s.`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function randomInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin caracteres ambiguos
  let code = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

const TRIAL_DAYS = 14;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ message: "Unauthorized" }, { status: 401 });

    const { mode, businessName, inviteCode } = await req.json();
    const sr = base44.asServiceRole;

    // A pending request is read from the STORED user row, not from auth.me():
    // it is what decides whether someone may create a business, so it must not
    // depend on a cached view of the session.
    const stored = await sr.entities.User.get(user.id).catch(() => null);
    const pendingId: string | null = stored?.pending_business_id ?? user.pending_business_id ?? null;
    const me = { ...user, pending_business_id: pendingId, business_id: stored?.business_id ?? user.business_id };

    if (mode === "status" || mode === "cancel") {
      if (mode === "cancel" && pendingId) {
        await withTimeout(
          sr.entities.User.update(user.id, { pending_business_id: null, join_requested_at: null }),
          25_000,
          "Cancelar tu solicitud",
        );
        return Response.json({ pending: false });
      }
      if (!pendingId) return Response.json({ pending: false });
      const target = await sr.entities.Business.get(pendingId).catch(() => null);
      if (!target) {
        // The business was deleted while the request was open: nothing to wait
        // for, and leaving it would block this person from ever creating one.
        await sr.entities.User.update(user.id, { pending_business_id: null, join_requested_at: null });
        return Response.json({ pending: false });
      }
      // Name only: never the invite code or anything else of the business.
      return Response.json({
        pending: true,
        businessName: target.name,
        requestedAt: stored?.join_requested_at ?? null,
      });
    }

    // One user, one tenant. A caller who already has a business_id cannot
    // create or join another: the tenant picker that used to let them move
    // between restaurants is gone, so a second one would strand the first with
    // no way back. Leaving a restaurant is manage-member's "remove", run by
    // that restaurant's own admin.
    const inBusiness = alreadyInBusiness(me);
    if (inBusiness) return Response.json({ message: inBusiness.message }, { status: inBusiness.status });

    if (mode === "create") {
      const pending = blockCreateWhilePending(me);
      if (pending) return Response.json({ message: pending.message }, { status: pending.status });
      const name = (businessName || "").trim();
      if (!name) {
        return Response.json({ message: "El nombre del negocio es obligatorio." }, { status: 400 });
      }

      const now = new Date();
      const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const business = await base44.asServiceRole.entities.Business.create({
        name,
        billing_status: "trial",
        license_plan: "start",
        trial_start_at: now.toISOString(),
        trial_end_at: trialEnd.toISOString(),
        invite_code: randomInviteCode(),
        invite_code_active: true,
      });

      try {
        await withTimeout(
          base44.asServiceRole.entities.User.update(user.id, {
            ...rolePatchFor(user, "business_admin"),
            business_id: business.id,
          }),
          25_000,
          "La asignación de tu negocio a tu cuenta",
        );
        // Seed the settings row so the alert engine has thresholds to read on
        // its very first run, instead of falling back to hardcoded numbers the
        // owner cannot see or change.
        await base44.asServiceRole.entities.AppSettings.create({ business_id: business.id });
      } catch (error) {
        // The Business landed but nobody got attached to it. Roll it back
        // rather than leaving a tenant with a live invite code and no members —
        // a stray invite code is the part of that mess with a real security
        // edge. Best-effort: if the rollback itself fails, the original error is
        // still what the caller needs to hear.
        try {
          const settings = await base44.asServiceRole.entities.AppSettings.filter(
            { business_id: business.id }, null, 10,
          );
          for (const s of settings || []) await base44.asServiceRole.entities.AppSettings.delete(s.id);
          await base44.asServiceRole.entities.Business.delete(business.id);
        } catch { /* keep reporting the original failure */ }
        throw error;
      }

      return Response.json({ business });
    }

    if (mode === "join") {
      const code = normalizeInviteCode(inviteCode);
      if (!code) {
        return Response.json({ message: "El código de invitación es obligatorio." }, { status: 400 });
      }
      const matches = await sr.entities.Business.filter({ invite_code: code }, null, 1);
      const business = matches?.[0];
      const plan = planJoinRequest(business as JoinBusiness | undefined, new Date());
      if (!plan.ok) return Response.json({ message: plan.message }, { status: plan.status });

      // Idempotent for the same business; a different code replaces the request
      // (there is only ever one). Nothing here writes business_id or role.
      if (pendingId !== business.id) {
        await withTimeout(
          sr.entities.User.update(user.id, plan.patch),
          25_000,
          "Enviar tu solicitud",
        );
        try {
          await sr.entities.AuditLog.create({
            business_id: business.id,
            actor_email: user.email || "",
            actor_role: "",
            action: "Cuenta:join_request",
            entity: "User",
            entity_id: user.id,
            summary: `${user.email || user.id} pidió unirse con el código de invitación.`,
            source: "app",
            occurred_at: new Date().toISOString(),
          });
        } catch { /* best-effort */ }
      }
      // Name only: the joiner has no access yet and must not receive the code.
      return Response.json({ pending: true, businessName: business.name });
    }

    return Response.json({ message: "mode debe ser 'create', 'join', 'status' o 'cancel'." }, { status: 400 });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
});
