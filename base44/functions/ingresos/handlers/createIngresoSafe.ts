import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";
import { validateIngreso, derivarConciliacion } from "./_ingresoFields.ts";

export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const g = await guard(base44, body, "Ingresos:create");
    if (!g.ok) return g.response;

    const validated = validateIngreso(body);
    if (!validated.ok) return Response.json({ message: validated.message }, { status: 400 });

    // One cut per (platform, week). Capturing the same week twice — easy to do
    // when two people are catching up on a backlog — would double that week's
    // revenue in every roll-up that sums these rows.
    const dupes = await g.sr.entities.IngresoPlataforma.filter({
      business_id: g.businessId,
      plataforma: validated.fields.plataforma,
      semana: validated.fields.semana,
    }, null, 1);
    if (dupes?.length) {
      return Response.json(
        {
          message: `Ya existe un corte de ${validated.fields.plataforma} para la semana ${validated.fields.semana}. Edítalo en vez de crear otro.`,
          existing_id: dupes[0].id,
        },
        { status: 409 },
      );
    }

    const ingreso = await g.sr.entities.IngresoPlataforma.create({
      ...validated.fields,
      ...derivarConciliacion(null, validated.fields),
      business_id: g.businessId,
      origen: "app",
    });

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Ingresos:create",
      entity: "IngresoPlataforma",
      entityId: ingreso.id,
      summary: `Registró el corte de ${validated.fields.plataforma} de la semana ${validated.fields.semana} por ${validated.fields.monto_corte}.`,
    });

    return Response.json({ ingreso });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
