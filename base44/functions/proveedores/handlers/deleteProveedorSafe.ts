import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";

// Suppliers are referenced BY NAME from Gasto rows (not by id), so deleting one
// does not orphan anything — the historical expenses keep the name they were
// filed under, which is the behaviour you want for a ledger.
//
// What deleting DOES cost is the contact details and the WhatsApp number. When
// the supplier has expenses on record, this handler deactivates instead of
// deleting unless the caller explicitly asks to force it: "ya no le compro" is
// almost always what someone means, and it keeps the picker clean without
// throwing away the phone number they will want in three months.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { id, force } = body;
    if (!id) return Response.json({ message: "id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Proveedores:delete");
    if (!g.ok) return g.response;

    const existing = await g.sr.entities.Proveedor.get(id).catch(() => null);
    if (!existing || existing.business_id !== g.businessId) {
      return Response.json({ message: "Proveedor no encontrado." }, { status: 404 });
    }

    const gastos = await g.sr.entities.Gasto.filter(
      { business_id: g.businessId, proveedor: existing.nombre }, null, 1,
    );
    const tieneHistorial = Boolean(gastos?.length);

    if (tieneHistorial && !force) {
      await g.sr.entities.Proveedor.update(id, { activo: false });
      await writeAudit(g.sr, {
        businessId: g.businessId,
        actorEmail: g.user.email,
        actorRole: g.user.role,
        action: "Proveedores:edit",
        entity: "Proveedor",
        entityId: id,
        summary: `Desactivó al proveedor "${existing.nombre}" (tiene gastos registrados, así que no se eliminó).`,
        changes: { activo: { antes: existing.activo ?? true, despues: false } },
      });
      return Response.json({
        success: true,
        deactivated: true,
        message: `"${existing.nombre}" tiene gastos registrados, así que lo desactivamos en vez de borrarlo. Sus gastos siguen intactos.`,
      });
    }

    await g.sr.entities.Proveedor.delete(id);
    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Proveedores:delete",
      entity: "Proveedor",
      entityId: id,
      summary: `Eliminó al proveedor "${existing.nombre}".`,
      changes: {
        eliminado: {
          antes: {
            nombre: existing.nombre,
            categoria: existing.categoria,
            contacto: existing.contacto,
            whatsapp: existing.whatsapp,
          },
          despues: null,
        },
      },
    });

    return Response.json({ success: true, deactivated: false });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
