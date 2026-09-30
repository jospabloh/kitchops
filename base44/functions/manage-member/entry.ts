import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import {
  approvalPatch,
  canDecideRequest,
  clearRequestPatch,
  targetBusinessOf,
  validateApproval,
} from "./_requests.ts";

// Safe function backing Cuenta:manage_members (Module 7 member management +
// Module 3's server-side re-check). Only a business_admin of the SAME restaurant
// (or the platform admin) may change a teammate's role or remove them —
// re-checked here independently of the client permission registry, which only
// hides the button.
//
// Also the ONLY place a join request becomes membership (list_requests,
// approve_request, reject_request). complete-onboarding "join" merely files the
// request; nothing but approve_request below writes business_id for a person
// who came in with an invite code. The approver picks the role from a whitelist
// (./_requests.ts), never 'admin' (platform tier).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ message: "Unauthorized" }, { status: 401 });

    const isPlatformAdmin = caller.role === "admin";
    if (!isPlatformAdmin && caller.role !== "business_admin") {
      return Response.json({ message: "No autorizado." }, { status: 403 });
    }

    const { action, memberId, role, businessId } = await req.json();
    const sr = base44.asServiceRole;

    if (action === "list_requests") {
      const target = targetBusinessOf(caller, businessId);
      if (!target) return Response.json({ message: "No autorizado." }, { status: 403 });
      const rows = await sr.entities.User.filter({ pending_business_id: target }, "email", 100);
      // Only what the approver needs to decide; no other field of the person.
      return Response.json({
        requests: (rows || [])
          // deno-lint-ignore no-explicit-any
          .filter((r: any) => r.id !== caller.id)
          // deno-lint-ignore no-explicit-any
          .map((r: any) => ({
            id: r.id,
            email: r.email || "",
            full_name: r.full_name || "",
            requested_at: r.join_requested_at || null,
          })),
      });
    }

    if (action === "approve_request" || action === "reject_request") {
      if (!memberId) return Response.json({ message: "memberId es obligatorio." }, { status: 400 });
      const target = targetBusinessOf(caller, businessId);
      // Re-read the STORED request; the body only names who, never where.
      const applicant = await sr.entities.User.get(memberId).catch(() => null);
      const allowed = canDecideRequest(caller, applicant, target);
      if (!allowed.ok) return Response.json({ message: allowed.message }, { status: allowed.status });

      const biz = await sr.entities.Business.get(target!).catch(() => null);
      const auditRequest = async (summary: string) => {
        try {
          await sr.entities.AuditLog.create({
            business_id: target,
            actor_email: caller.email || "",
            actor_role: caller.role || "",
            action: "Cuenta:manage_members",
            entity: "User",
            entity_id: memberId,
            summary,
            source: "app",
            occurred_at: new Date().toISOString(),
          });
        } catch { /* best-effort, see _audit.ts */ }
      };
      const label = applicant.email || memberId;

      if (action === "reject_request" || !biz) {
        // A request for a business that no longer exists can only be cleared.
        await sr.entities.User.update(memberId, clearRequestPatch());
        await auditRequest(`Rechazó la solicitud de ${label}.`);
        return Response.json({ rejected: true });
      }

      const valid = validateApproval(applicant, role);
      if (!valid.ok) {
        // Already inside another business: the request is moot, drop it.
        if (valid.status === 409) await sr.entities.User.update(memberId, clearRequestPatch());
        return Response.json({ message: valid.message }, { status: valid.status });
      }
      const updated = await Promise.race([
        sr.entities.User.update(memberId, approvalPatch(applicant, target!, valid.role)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("La aprobación no respondió en 25s.")), 25_000)
        ),
      ]);
      await auditRequest(
        `Aprobó a ${label} como ${valid.role === "business_admin" ? "dueño/gerente" : "personal"} en ${biz.name}.`,
      );
      return Response.json({ member: updated });
    }

    if (!memberId) return Response.json({ message: "memberId es obligatorio." }, { status: 400 });

    const member = await base44.asServiceRole.entities.User.get(memberId);
    if (!member) return Response.json({ message: "Miembro no encontrado." }, { status: 404 });
    // `!caller.business_id` matters: without it two people with NO business
    // would compare equal (undefined === undefined) and pass this gate.
    if (!isPlatformAdmin && (!caller.business_id || member.business_id !== caller.business_id)) {
      return Response.json({ message: "No autorizado." }, { status: 403 });
    }
    if (!isPlatformAdmin && member.role === "admin") {
      // The platform tier is not something a restaurant's admin can touch.
      return Response.json({ message: "No autorizado." }, { status: 403 });
    }
    if (!isPlatformAdmin && member.id === caller.id) {
      return Response.json({ message: "No puedes modificar tu propio acceso aquí." }, { status: 400 });
    }

    const business = await sr.entities.Business.get(member.business_id).catch(() => null);

    const audit = async (summary: string) => {
      try {
        await sr.entities.AuditLog.create({
          business_id: member.business_id,
          actor_email: caller.email || "",
          actor_role: caller.role || "",
          action: "Cuenta:manage_members",
          entity: "User",
          entity_id: memberId,
          summary,
          source: "app",
          occurred_at: new Date().toISOString(),
        });
      } catch { /* best-effort, see _audit.ts */ }
    };

    if (action === "change_role") {
      if (!["business_admin", "staff"].includes(role)) {
        return Response.json({ message: "role inválido." }, { status: 400 });
      }
      // One user, one tenant: `User.role` IS the durable record. There is no
      // second copy of it to keep in sync any more — the `Membership` entity
      // that used to hold one went away with the tenant picker.
      const updated = await sr.entities.User.update(memberId, { role });
      await audit(
        `Cambió el rol de ${member.email || memberId} a ${role === "business_admin" ? "dueño/gerente" : "personal"} en ${business?.name || member.business_id}.`,
      );
      return Response.json({ member: updated });
    }

    if (action === "remove") {
      // Clearing `business_id` IS the removal: one user, one tenant, and no
      // separate membership record that could grant a way back in. They land
      // back on onboarding and can create or join a restaurant again.
      const updated = await sr.entities.User.update(memberId, {
        // The platform owner keeps "admin" — writing role on that account fails,
        // and demoting them would be wrong anyway (see complete-onboarding).
        ...(member.role === "admin" ? {} : { role: "staff" }),
        business_id: null,
        ...clearRequestPatch(),
      });
      await audit(`Quitó a ${member.email || memberId} de ${business?.name || member.business_id}.`);
      return Response.json({ member: updated });
    }

    return Response.json({ message: "action debe ser 'change_role', 'remove', 'list_requests', 'approve_request' o 'reject_request'." }, { status: 400 });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
});
