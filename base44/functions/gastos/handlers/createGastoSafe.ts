import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";
import { validateGasto } from "./_gastoFields.ts";

// Registers an expense. Called from the app's Gastos page and, with the same
// checks, by the WhatsApp agent's registrarGasto tool — which is why the
// permission and billing gates live here rather than in the page.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const g = await guard(base44, body, "Gastos:create");
    if (!g.ok) return g.response;

    const validated = validateGasto(body);
    if (!validated.ok) return Response.json({ message: validated.message }, { status: 400 });

    // Born invoiced or born paid is the same decision as marking it later, so
    // it carries the same key updateGastoSafe demands. Without this, a staff
    // member without Gastos:mark_pagado could skip the edit path's check by
    // creating the expense already settled.
    const extraKeys: string[] = [];
    if (validated.fields.facturado === true) extraKeys.push("Gastos:mark_facturado");
    if (validated.fields.pagado === true) extraKeys.push("Gastos:mark_pagado");
    for (const key of extraKeys) {
      const sub = await guard(base44, body, key);
      if (!sub.ok) return sub.response;
    }

    const gasto = await g.sr.entities.Gasto.create({
      ...validated.fields,
      business_id: g.businessId,
      // Never from the body: an expense typed into the web form must not be
      // able to claim it came from WhatsApp (or the reverse).
      origen: "app",
    });

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Gastos:create",
      entity: "Gasto",
      entityId: gasto.id,
      summary: `Registró un gasto de ${validated.fields.monto} con ${validated.fields.proveedor} (${validated.fields.fecha}).`,
    });

    return Response.json({ gasto });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
