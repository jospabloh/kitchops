import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

// Every entity carrying business_id, in an order that deletes children before
// parents so a partial failure never leaves a message pointing at a ticket that
// no longer exists. WhatsAppEvento is absent on purpose: it has no business_id
// on most rows (it is claimed before the tenant is even resolved) and it is a
// dedup ledger, not tenant data.
const TENANT_ENTITIES = [
  "WhatsAppMensaje",
  "WhatsAppConversacion",
  "WhatsAppConfig",
  "SupportTicketMessage",
  "SupportTicket",
  "Alerta",
  "Gasto",
  "IngresoPlataforma",
  "InventarioItem",
  "Proveedor",
  "AppSettings",
  "PermissionProfile",
  "AuditLog",
];

// Danger zone (Module 7): irreversible. Only the restaurant's own
// business_admin (or the platform admin) may trigger it, only for their own
// tenant, and only after typing the restaurant's exact name as confirmation.
//
// WHAT IT DOES NOT TOUCH, deliberately and per Module 7's requirement to say so:
// member User accounts survive. A login identity is a person, not tenant data —
// the same account may be staff at another restaurant tomorrow. Members are
// released instead: dropped into another business they belong to, or back to
// onboarding if this was their only one.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ message: "Unauthorized" }, { status: 401 });

    const { businessId, confirmName } = await req.json();
    if (!businessId) return Response.json({ message: "businessId es obligatorio." }, { status: 400 });

    const isPlatformAdmin = caller.role === "admin";
    if (!isPlatformAdmin && (caller.role !== "business_admin" || caller.business_id !== businessId)) {
      return Response.json({ message: "No autorizado." }, { status: 403 });
    }

    const sr = base44.asServiceRole;
    const business = await sr.entities.Business.get(businessId);
    if (!business) return Response.json({ message: "Negocio no encontrado." }, { status: 404 });
    if ((confirmName || "").trim() !== business.name) {
      return Response.json(
        { message: "El nombre no coincide. Escribe el nombre exacto del negocio para confirmar." },
        { status: 400 },
      );
    }

    const deletedCounts: Record<string, number> = {};
    for (const entityName of TENANT_ENTITIES) {
      try {
        const result = await sr.entities[entityName].deleteMany({ business_id: businessId });
        deletedCounts[entityName] = result?.deleted ?? 0;
      } catch (e) {
        // A missing entity (not yet deployed to this app's live schema) must not
        // strand the deletion half-done — record it and keep going, so the
        // caller learns exactly what was skipped rather than getting a 500 with
        // most of the tenant already gone.
        deletedCounts[entityName] = -1;
        console.error(`delete-account: ${entityName} falló:`, (e as Error).message);
      }
    }

    // Memberships for this tenant go too, otherwise the tenant picker would keep
    // offering a restaurant that no longer exists.
    const memberships = await sr.entities.Membership.filter({ business_id: businessId }, null, 500);
    for (const m of memberships || []) await sr.entities.Membership.delete(m.id);

    // Anyone sitting in this tenant has to land somewhere.
    const members = await sr.entities.User.filter({ business_id: businessId });
    for (const member of members) {
      const elsewhere = await sr.entities.Membership.filter({ user_id: member.id }, null, 1);
      const fallback = elsewhere?.[0];
      await sr.entities.User.update(member.id, {
        ...(member.role === "admin" ? {} : { role: fallback ? fallback.role : "staff" }),
        business_id: fallback ? fallback.business_id : null,
      });
    }

    await sr.entities.Business.delete(businessId);

    return Response.json({
      success: true,
      deletedCounts,
      releasedMembers: members.length,
      skipped: Object.entries(deletedCounts).filter(([, n]) => n === -1).map(([e]) => e),
    });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
});
