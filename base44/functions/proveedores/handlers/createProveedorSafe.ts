import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";
import { validateProveedor } from "./_proveedorFields.ts";

export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const g = await guard(base44, body, "Proveedores:create");
    if (!g.ok) return g.response;

    const validated = validateProveedor(body);
    if (!validated.ok) return Response.json({ message: validated.message }, { status: 400 });

    // Duplicate suppliers are how a spend-by-supplier report ends up splitting
    // one vendor across two lines and under-reporting both. Compared
    // case-insensitively on the trimmed name, which is how people actually
    // retype them ("sysco" vs "Sysco").
    const nombre = String(validated.fields.nombre);
    const existing = await g.sr.entities.Proveedor.filter({ business_id: g.businessId }, null, 500);
    const clash = (existing || []).find(
      (p: { nombre?: string }) => (p.nombre || "").trim().toLowerCase() === nombre.toLowerCase(),
    );
    if (clash) {
      return Response.json(
        { message: `Ya tienes un proveedor llamado "${clash.nombre}".`, existing_id: clash.id },
        { status: 409 },
      );
    }

    const proveedor = await g.sr.entities.Proveedor.create({
      ...validated.fields,
      business_id: g.businessId,
    });

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Proveedores:create",
      entity: "Proveedor",
      entityId: proveedor.id,
      summary: `Agregó al proveedor "${nombre}".`,
    });

    return Response.json({ proveedor });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
