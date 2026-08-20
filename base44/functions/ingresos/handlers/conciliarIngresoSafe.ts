import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";
import { derivarConciliacion } from "./_ingresoFields.ts";

// The narrow "the money landed" action, separate from the general edit path.
// It exists so the UI can offer a one-field affordance ("¿cuánto te
// depositaron?") without sending the whole record back, and so the audit trail
// carries a purpose-written line: reconciliation is the step an owner will want
// to reconstruct months later when a platform disputes a shortfall.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { id, monto_depositado, fecha_deposito, notas } = body;
    if (!id) return Response.json({ message: "id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Ingresos:conciliar");
    if (!g.ok) return g.response;

    const existing = await g.sr.entities.IngresoPlataforma.get(id).catch(() => null);
    if (!existing || existing.business_id !== g.businessId) {
      return Response.json({ message: "Corte no encontrado." }, { status: 404 });
    }

    const deposito = Number(monto_depositado);
    if (!Number.isFinite(deposito) || deposito < 0) {
      return Response.json(
        { message: "El monto depositado debe ser un número mayor o igual a cero." },
        { status: 400 },
      );
    }
    if (fecha_deposito !== undefined && fecha_deposito !== null && fecha_deposito !== "") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha_deposito))) {
        return Response.json(
          { message: "La fecha de depósito debe tener el formato AAAA-MM-DD." },
          { status: 400 },
        );
      }
    }

    const patch: Record<string, unknown> = {
      monto_depositado: deposito,
      ...derivarConciliacion(existing, { monto_depositado: deposito }),
    };
    if (fecha_deposito !== undefined) patch.fecha_deposito = fecha_deposito || null;
    if (notas !== undefined) patch.notas = String(notas).trim();

    const updated = await g.sr.entities.IngresoPlataforma.update(id, patch);

    const diferencia = Number(patch.diferencia ?? 0);
    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Ingresos:conciliar",
      entity: "IngresoPlataforma",
      entityId: id,
      summary:
        diferencia === 0
          ? `Conciliró el corte de ${existing.plataforma} (semana ${existing.semana}): el depósito coincide con el corte.`
          : `Conciliró el corte de ${existing.plataforma} (semana ${existing.semana}): corte ${existing.monto_corte}, depósito ${deposito}, diferencia ${diferencia}.`,
      changes: {
        monto_depositado: { antes: existing.monto_depositado ?? null, despues: deposito },
        diferencia: { antes: existing.diferencia ?? null, despues: patch.diferencia },
      },
    });

    return Response.json({ ingreso: updated });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
