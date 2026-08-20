import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit, diffOf } from "./_audit.ts";
import { validateIngreso, derivarConciliacion } from "./_ingresoFields.ts";

// Editing a cut is Ingresos:edit — EXCEPT for the deposit fields, which are the
// reconciliation itself and carry Ingresos:conciliar. Recording "the bank paid
// us $17,950 against a $18,400 cut" is the moment someone decides whether the
// platform shorted the restaurant, and that is the owner's call, not a capture
// task. Staff can fix a typo in the cut; they cannot close the loop on it.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { id } = body;
    if (!id) return Response.json({ message: "id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Ingresos:edit");
    if (!g.ok) return g.response;

    const existing = await g.sr.entities.IngresoPlataforma.get(id).catch(() => null);
    if (!existing || existing.business_id !== g.businessId) {
      return Response.json({ message: "Corte no encontrado." }, { status: 404 });
    }

    const validated = validateIngreso(body, { partial: true });
    if (!validated.ok) return Response.json({ message: validated.message }, { status: 400 });

    const touchesDeposit =
      (body.monto_depositado !== undefined &&
        String(body.monto_depositado ?? "") !== String(existing.monto_depositado ?? "")) ||
      (body.fecha_deposito !== undefined &&
        String(body.fecha_deposito ?? "") !== String(existing.fecha_deposito ?? ""));
    if (touchesDeposit) {
      const sub = await guard(base44, body, "Ingresos:conciliar");
      if (!sub.ok) return sub.response;
    }

    const patch = { ...validated.fields, ...derivarConciliacion(existing, validated.fields) };
    const updated = await g.sr.entities.IngresoPlataforma.update(id, patch);
    const changes = diffOf(existing, patch);

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: touchesDeposit ? "Ingresos:conciliar" : "Ingresos:edit",
      entity: "IngresoPlataforma",
      entityId: id,
      summary: `Actualizó el corte de ${existing.plataforma} de la semana ${existing.semana}${
        touchesDeposit ? ` (depósito: ${patch.monto_depositado ?? "sin registrar"}, diferencia: ${patch.diferencia ?? "n/d"})` : ""
      }.`,
      changes,
    });

    return Response.json({ ingreso: updated });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
