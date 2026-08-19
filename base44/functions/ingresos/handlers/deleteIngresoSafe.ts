import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";

export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { id } = body;
    if (!id) return Response.json({ message: "id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Ingresos:delete");
    if (!g.ok) return g.response;

    const existing = await g.sr.entities.IngresoPlataforma.get(id).catch(() => null);
    if (!existing || existing.business_id !== g.businessId) {
      return Response.json({ message: "Corte no encontrado." }, { status: 404 });
    }

    await g.sr.entities.IngresoPlataforma.delete(id);

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Ingresos:delete",
      entity: "IngresoPlataforma",
      entityId: id,
      summary: `Eliminó el corte de ${existing.plataforma} de la semana ${existing.semana} (${existing.monto_corte}).`,
      changes: {
        eliminado: {
          antes: {
            plataforma: existing.plataforma,
            semana: existing.semana,
            monto_corte: existing.monto_corte,
            monto_depositado: existing.monto_depositado,
            diferencia: existing.diferencia,
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
