import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";
import { validateItem, touchesCosto } from "./_itemFields.ts";

export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const g = await guard(base44, body, "Inventario:create");
    if (!g.ok) return g.response;

    const validated = validateItem(body);
    if (!validated.ok) return Response.json({ message: validated.message }, { status: 400 });

    // Setting an initial cost is still setting the cost basis.
    if (touchesCosto(body, null)) {
      const sub = await guard(base44, body, "Inventario:edit_costo");
      if (!sub.ok) return sub.response;
    }

    const item = await g.sr.entities.InventarioItem.create({
      ...validated.fields,
      business_id: g.businessId,
      ultima_actualizacion: new Date().toISOString(),
    });

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Inventario:create",
      entity: "InventarioItem",
      entityId: item.id,
      summary: `Agregó el insumo "${validated.fields.nombre}" al inventario.`,
    });

    return Response.json({ item });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
