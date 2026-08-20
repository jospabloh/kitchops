import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit, diffOf } from "./_audit.ts";
import { validateGasto } from "./_gastoFields.ts";

// Editing an expense is gated by Gastos:edit, but two specific fields have
// their own keys because they mean something different from "fix a typo":
//
//   facturado → Gastos:mark_facturado  (this ticket is now invoiced)
//   pagado    → Gastos:mark_pagado     (the card balance for it is settled)
//
// Staff may mark invoiced (they're the ones chasing the invoice) but not paid
// (that is the owner reconciling the card). Sending both in one request means
// both keys are required — so a staff member cannot slip `pagado` through
// alongside an edit they ARE allowed to make.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { id } = body;
    if (!id) return Response.json({ message: "id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Gastos:edit");
    if (!g.ok) return g.response;

    const existing = await g.sr.entities.Gasto.get(id).catch(() => null);
    // Same answer for "no existe" and "es de otro negocio": a caller must not be
    // able to discover another tenant's record ids by probing.
    if (!existing || existing.business_id !== g.businessId) {
      return Response.json({ message: "Gasto no encontrado." }, { status: 404 });
    }

    const validated = validateGasto(body, { partial: true });
    if (!validated.ok) return Response.json({ message: validated.message }, { status: 400 });

    // Re-check the two escalated fields, but only when they actually change —
    // the client echoes the whole record back, so an unchanged `pagado: true`
    // must not demand a permission the caller doesn't need.
    const extraKeys: string[] = [];
    if (body.facturado !== undefined && Boolean(body.facturado) !== Boolean(existing.facturado)) {
      extraKeys.push("Gastos:mark_facturado");
    }
    if (body.pagado !== undefined && Boolean(body.pagado) !== Boolean(existing.pagado)) {
      extraKeys.push("Gastos:mark_pagado");
    }
    for (const key of extraKeys) {
      const sub = await guard(base44, body, key);
      if (!sub.ok) return sub.response;
    }

    const updated = await g.sr.entities.Gasto.update(id, validated.fields);
    const changes = diffOf(existing, validated.fields);

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Gastos:edit",
      entity: "Gasto",
      entityId: id,
      summary: `Editó el gasto de ${existing.proveedor} del ${existing.fecha} (${Object.keys(changes).join(", ") || "sin cambios"}).`,
      changes,
    });

    return Response.json({ gasto: updated });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
