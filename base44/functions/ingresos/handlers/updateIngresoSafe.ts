import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit, diffOf } from "./_audit.ts";
import { validateIngreso, derivarConciliacion, tocaConciliacion } from "./_ingresoFields.ts";

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

    // Any change that moves diferencia/conciliado is the reconciliation —
    // including editing monto_corte to match a deposit already on record.
    const touchesDeposit = tocaConciliacion(existing, validated.fields);
    if (touchesDeposit) {
      const sub = await guard(base44, body, "Ingresos:conciliar");
      if (!sub.ok) return sub.response;
    }

    // Same one-cut-per-(platform, week) rule as create: moving a cut onto a
    // pair that already has one would double that week's revenue.
    const plataforma = validated.fields.plataforma ?? existing.plataforma;
    const semana = validated.fields.semana ?? existing.semana;
    if (plataforma !== existing.plataforma || semana !== existing.semana) {
      const otros = await g.sr.entities.IngresoPlataforma.filter(
        { business_id: g.businessId, plataforma, semana }, null, 2,
      );
      const otro = (otros || []).find((r: { id?: string }) => r.id !== id);
      if (otro) {
        return Response.json(
          {
            message: `Ya existe un corte de ${plataforma} para la semana ${semana}. Edita ese en vez de mover este.`,
            existing_id: otro.id,
          },
          { status: 409 },
        );
      }
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
