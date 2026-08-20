import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";

// Deleting an expense removes money from a week that may already have been
// closed and reported, with nothing left on screen to notice. The audit row is
// written with the full record embedded, so the trail answers "what was in the
// $4,200 line that disappeared" — not just that something was deleted.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { id } = body;
    if (!id) return Response.json({ message: "id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Gastos:delete");
    if (!g.ok) return g.response;

    const existing = await g.sr.entities.Gasto.get(id).catch(() => null);
    if (!existing || existing.business_id !== g.businessId) {
      return Response.json({ message: "Gasto no encontrado." }, { status: 404 });
    }

    await g.sr.entities.Gasto.delete(id);

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Gastos:delete",
      entity: "Gasto",
      entityId: id,
      summary: `Eliminó el gasto de ${existing.monto} con ${existing.proveedor} del ${existing.fecha}.`,
      changes: {
        eliminado: {
          antes: {
            monto: existing.monto,
            fecha: existing.fecha,
            proveedor: existing.proveedor,
            categoria: existing.categoria,
            metodo_pago: existing.metodo_pago,
            descripcion: existing.descripcion,
            facturado: existing.facturado,
            pagado: existing.pagado,
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
