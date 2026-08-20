import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit, diffOf } from "./_audit.ts";
import { validateItem, touchesCosto } from "./_itemFields.ts";

export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { id } = body;
    if (!id) return Response.json({ message: "id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Inventario:edit_item");
    if (!g.ok) return g.response;

    const existing = await g.sr.entities.InventarioItem.get(id).catch(() => null);
    if (!existing || existing.business_id !== g.businessId) {
      return Response.json({ message: "Insumo no encontrado." }, { status: 404 });
    }

    const validated = validateItem(body, { partial: true });
    if (!validated.ok) return Response.json({ message: validated.message }, { status: 400 });

    if (touchesCosto(body, existing)) {
      const sub = await guard(base44, body, "Inventario:edit_costo");
      if (!sub.ok) return sub.response;
    }
    // Moving stock through this path (rather than ajustarStockSafe) still needs
    // the stock key — the form and the +/- buttons write the same field.
    if (
      validated.fields.stock_actual !== undefined &&
      Number(validated.fields.stock_actual) !== Number(existing.stock_actual)
    ) {
      const sub = await guard(base44, body, "Inventario:edit_stock");
      if (!sub.ok) return sub.response;
    }

    const patch = { ...validated.fields, ultima_actualizacion: new Date().toISOString() };
    const updated = await g.sr.entities.InventarioItem.update(id, patch);
    const changes = diffOf(existing, validated.fields);

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Inventario:edit_item",
      entity: "InventarioItem",
      entityId: id,
      summary: `Editó el insumo "${existing.nombre}" (${Object.keys(changes).join(", ") || "sin cambios"}).`,
      changes,
    });

    return Response.json({ item: updated });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
