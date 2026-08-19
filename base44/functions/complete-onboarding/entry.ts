import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

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
// mode "join":   the caller redeems an existing restaurant's invite_code and
//                becomes staff.

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

    // No blanket "you already have a business" rejection: a user may belong to
    // several restaurants (see base44/entities/Membership.jsonc). Joining the
    // same one twice is still refused below, where we know which one.
    const { mode, businessName, inviteCode } = await req.json();

    if (mode === "create") {
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
        await base44.asServiceRole.entities.Membership.create({
          business_id: business.id,
          user_id: user.id,
          user_email: user.email,
          role: "business_admin",
        });
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
          const stale = await base44.asServiceRole.entities.Membership.filter(
            { business_id: business.id }, null, 100,
          );
          for (const m of stale || []) await base44.asServiceRole.entities.Membership.delete(m.id);
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
      const code = (inviteCode || "").trim().toUpperCase();
      if (!code) {
        return Response.json({ message: "El código de invitación es obligatorio." }, { status: 400 });
      }
      const matches = await base44.asServiceRole.entities.Business.filter({ invite_code: code }, null, 1);
      const business = matches?.[0];
      // Same answer for "no such code" and "code turned off": a wrong code
      // should not tell you whether it was ever right.
      if (!business || business.invite_code_active === false) {
        return Response.json({ message: "Código de invitación inválido." }, { status: 404 });
      }

      const already = await base44.asServiceRole.entities.Membership.filter(
        { user_id: user.id, business_id: business.id }, null, 1,
      );
      if (!already?.length) {
        await base44.asServiceRole.entities.Membership.create({
          business_id: business.id,
          user_id: user.id,
          user_email: user.email,
          role: "staff",
        });
      } else if (user.business_id === business.id) {
        return Response.json({ message: "Ya perteneces a ese negocio." }, { status: 409 });
      }

      await withTimeout(
        base44.asServiceRole.entities.User.update(user.id, {
          ...rolePatchFor(user, already?.[0]?.role || "staff"),
          business_id: business.id,
        }),
        25_000,
        "La asignación de tu negocio a tu cuenta",
      );
      return Response.json({ business });
    }

    return Response.json({ message: "mode debe ser 'create' o 'join'." }, { status: 400 });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
});
