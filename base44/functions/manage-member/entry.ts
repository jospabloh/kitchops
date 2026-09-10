import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

// Safe function backing Cuenta:manage_members (Module 7 member management +
// Module 3's server-side re-check). Only a business_admin of the SAME restaurant
// (or the platform admin) may change a teammate's role or remove them —
// re-checked here independently of the client permission registry, which only
// hides the button.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ message: "Unauthorized" }, { status: 401 });

    const isPlatformAdmin = caller.role === "admin";
    if (!isPlatformAdmin && caller.role !== "business_admin") {
      return Response.json({ message: "No autorizado." }, { status: 403 });
    }

    const { action, memberId, role } = await req.json();
    if (!memberId) return Response.json({ message: "memberId es obligatorio." }, { status: 400 });

    const member = await base44.asServiceRole.entities.User.get(memberId);
    if (!member) return Response.json({ message: "Miembro no encontrado." }, { status: 404 });
    if (!isPlatformAdmin && member.business_id !== caller.business_id) {
      return Response.json({ message: "No autorizado." }, { status: 403 });
    }
    if (!isPlatformAdmin && member.id === caller.id) {
      return Response.json({ message: "No puedes modificar tu propio acceso aquí." }, { status: 400 });
    }

    const sr = base44.asServiceRole;
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
      });
      await audit(`Quitó a ${member.email || memberId} de ${business?.name || member.business_id}.`);
      return Response.json({ member: updated });
    }

    return Response.json({ message: "action debe ser 'change_role' o 'remove'." }, { status: 400 });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
});
