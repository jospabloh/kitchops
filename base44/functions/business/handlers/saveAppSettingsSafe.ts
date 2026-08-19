import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit, diffOf } from "./_audit.ts";

// Create-or-update, idempotent by design: complete-onboarding seeds an
// AppSettings row, but a restaurant onboarded before that seeding existed
// won't have one, and two tabs saving at once shouldn't produce two rows. The
// handler re-reads by business_id and updates whatever it finds rather than
// trusting an id from the client.
const NUMERIC_FIELDS = [
  "gasto_alto_umbral_pct",
  "gasto_alto_critico_pct",
  "deposito_diferencia_critica",
] as const;

export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const g = await guard(base44, body, "Configuracion:edit");
    if (!g.ok) return g.response;

    const patch: Record<string, unknown> = {};

    for (const field of NUMERIC_FIELDS) {
      if (body[field] === undefined) continue;
      const n = Number(body[field]);
      if (!Number.isFinite(n) || n < 0) {
        return Response.json({ message: `"${field}" debe ser un número mayor o igual a cero.` }, { status: 400 });
      }
      patch[field] = n;
    }
    // A "critical" threshold below the warning one produces alerts that are red
    // before they are yellow — the thresholds would be silently inverted.
    const umbral = Number(patch.gasto_alto_umbral_pct ?? g.business.gasto_alto_umbral_pct ?? 20);
    const critico = Number(patch.gasto_alto_critico_pct ?? 50);
    if (patch.gasto_alto_critico_pct !== undefined && critico < umbral) {
      return Response.json(
        { message: "El umbral crítico no puede ser menor que el umbral de aviso." },
        { status: 400 },
      );
    }

    if (body.semana_inicia_lunes !== undefined) patch.semana_inicia_lunes = Boolean(body.semana_inicia_lunes);
    if (body.alertas_whatsapp_activas !== undefined) {
      patch.alertas_whatsapp_activas = Boolean(body.alertas_whatsapp_activas);
    }
    if (body.moneda_simbolo !== undefined) {
      const s = String(body.moneda_simbolo).trim();
      patch.moneda_simbolo = s.slice(0, 3) || "$";
    }
    if (body.alertas_email !== undefined) {
      const email = String(body.alertas_email).trim();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return Response.json({ message: "Ese correo no parece válido." }, { status: 400 });
      }
      patch.alertas_email = email;
    }
    if (body.alertas_whatsapp_destino !== undefined) {
      const numero = String(body.alertas_whatsapp_destino).trim();
      if (numero && !/^\+\d{10,15}$/.test(numero)) {
        return Response.json(
          { message: "El número para alertas debe ir en formato internacional, p. ej. +525512345678." },
          { status: 400 },
        );
      }
      patch.alertas_whatsapp_destino = numero;
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ message: "No mandaste ningún ajuste." }, { status: 400 });
    }

    const existingRows = await g.sr.entities.AppSettings.filter({ business_id: g.businessId }, null, 1);
    const existing = existingRows?.[0] || null;

    const saved = existing
      ? await g.sr.entities.AppSettings.update(existing.id, patch)
      : await g.sr.entities.AppSettings.create({ business_id: g.businessId, ...patch });

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Configuracion:edit",
      entity: "AppSettings",
      entityId: saved.id,
      summary: `Cambió la configuración de alertas (${Object.keys(patch).join(", ")}).`,
      changes: diffOf(existing, patch),
    });

    return Response.json({ settings: saved });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
