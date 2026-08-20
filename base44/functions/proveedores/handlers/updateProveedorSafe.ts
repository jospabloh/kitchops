import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit, diffOf } from "./_audit.ts";
import { validateProveedor } from "./_proveedorFields.ts";

export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { id } = body;
    if (!id) return Response.json({ message: "id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Proveedores:edit");
    if (!g.ok) return g.response;

    const existing = await g.sr.entities.Proveedor.get(id).catch(() => null);
    if (!existing || existing.business_id !== g.businessId) {
      return Response.json({ message: "Proveedor no encontrado." }, { status: 404 });
    }

    const validated = validateProveedor(body, { partial: true });
    if (!validated.ok) return Response.json({ message: validated.message }, { status: 400 });

    const updated = await g.sr.entities.Proveedor.update(id, validated.fields);
    const changes = diffOf(existing, validated.fields);

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Proveedores:edit",
      entity: "Proveedor",
      entityId: id,
      summary: `Editó al proveedor "${existing.nombre}" (${Object.keys(changes).join(", ") || "sin cambios"}).`,
      changes,
    });

    return Response.json({ proveedor: updated });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
