import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";

export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { id } = body;
    if (!id) return Response.json({ message: "id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Inventario:delete");
    if (!g.ok) return g.response;

    const existing = await g.sr.entities.InventarioItem.get(id).catch(() => null);
    if (!existing || existing.business_id !== g.businessId) {
      return Response.json({ message: "Insumo no encontrado." }, { status: 404 });
    }

    await g.sr.entities.InventarioItem.delete(id);

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Inventario:delete",
      entity: "InventarioItem",
      entityId: id,
      summary: `Eliminó el insumo "${existing.nombre}" (tenía ${existing.stock_actual} ${existing.unidad || ""}).`,
      changes: {
        eliminado: {
          antes: {
            nombre: existing.nombre,
            categoria: existing.categoria,
            stock_actual: existing.stock_actual,
            stock_minimo: existing.stock_minimo,
            unidad: existing.unidad,
            ultimo_costo: existing.ultimo_costo,
          },
          despues: null,
        },
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
