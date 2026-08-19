import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit, diffOf } from "./_audit.ts";

// Editing the restaurant's own profile (name, RFC, contact, branding).
//
// THE WHITELIST IS THE SECURITY CONTROL HERE, not a tidiness measure. The
// Business row also holds billing_status, license_plan, license_expires_at,
// licensed_user_limit and trial_end_at — all of which belong to Mission
// Control's unified lifecycle cron (Module 1). A passthrough update would let
// any business_admin grant themselves an unlimited "pro" licence that never
// expires, from the browser, with no payment involved. Only the fields below
// are ever written; everything else in the body is dropped silently.
const EDITABLE_FIELDS = [
  "name",
  "legal_name",
  "rfc",
  "phone",
  "address",
  "logo_url",
  "currency",
  "tax_rate",
  "timezone",
] as const;

export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const g = await guard(base44, body, "Cuenta:edit_profile");
    if (!g.ok) return g.response;

    const patch: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] === undefined) continue;
      patch[field] = typeof body[field] === "string" ? body[field].trim() : body[field];
    }

    if (patch.name !== undefined && !String(patch.name).trim()) {
      return Response.json({ message: "El nombre del negocio no puede quedar vacío." }, { status: 400 });
    }
    if (patch.tax_rate !== undefined) {
      const tasa = Number(patch.tax_rate);
      if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) {
        return Response.json({ message: "La tasa de IVA debe estar entre 0 y 100." }, { status: 400 });
      }
      patch.tax_rate = tasa;
    }
    if (Object.keys(patch).length === 0) {
      return Response.json({ message: "No mandaste ningún campo editable." }, { status: 400 });
    }

    const updated = await g.sr.entities.Business.update(g.businessId, patch);
    const changes = diffOf(g.business, patch);

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Cuenta:edit_profile",
      entity: "Business",
      entityId: g.businessId,
      summary: `Actualizó los datos del negocio (${Object.keys(changes).join(", ") || "sin cambios"}).`,
      changes,
    });

    return Response.json({ business: updated });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
