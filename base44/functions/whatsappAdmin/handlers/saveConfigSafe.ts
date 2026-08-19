import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit, diffOf } from "./_audit.ts";

const PROVEEDORES = ["zernio", "meta"];
const TONOS = ["profesional", "amigable", "directo"];
// Kept in step with the model table the agent's brain documents. An unknown id
// would only surface as a 404 from the API, hours later, in a background job
// nobody is watching.
const MODELOS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"];

// Creates or updates this restaurant's agent configuration.
//
// THE UNIQUENESS CHECK IS THE IMPORTANT PART. `provider_account_id` /
// `provider_phone_number_id` is how the webhook decides which restaurant an
// inbound message belongs to — there is no user token to tell it. If two
// businesses claimed the same id, one kitchen's WhatsApp messages would write
// into the other's books, and the webhook (which refuses to guess) would drop
// both. So a value already claimed by a different tenant is rejected here,
// where a human is present to read the error.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const g = await guard(base44, body, "WhatsApp:configure");
    if (!g.ok) return g.response;

    const patch: Record<string, unknown> = {};

    if (body.proveedor !== undefined) {
      const p = String(body.proveedor);
      if (!PROVEEDORES.includes(p)) {
        return Response.json({ message: "Proveedor inválido. Usa 'zernio' o 'meta'." }, { status: 400 });
      }
      patch.proveedor = p;
    }
    if (body.agente_nombre !== undefined) {
      const nombre = String(body.agente_nombre).trim();
      if (!nombre) return Response.json({ message: "El agente necesita un nombre." }, { status: 400 });
      patch.agente_nombre = nombre.slice(0, 40);
    }
    if (body.agente_tono !== undefined) {
      const t = String(body.agente_tono);
      if (!TONOS.includes(t)) {
        return Response.json({ message: `Tono inválido. Usa uno de: ${TONOS.join(", ")}.` }, { status: 400 });
      }
      patch.agente_tono = t;
    }
    if (body.modelo !== undefined) {
      const m = String(body.modelo);
      if (!MODELOS.includes(m)) {
        return Response.json({ message: `Modelo inválido. Usa uno de: ${MODELOS.join(", ")}.` }, { status: 400 });
      }
      patch.modelo = m;
    }
    if (body.instrucciones_extra !== undefined) {
      // Bounded because it goes into the system prompt of every single message:
      // an unbounded field here is an unbounded per-message bill.
      patch.instrucciones_extra = String(body.instrucciones_extra).trim().slice(0, 4000);
    }
    if (body.activo !== undefined) patch.activo = Boolean(body.activo);
    if (body.empujar_alertas !== undefined) patch.empujar_alertas = Boolean(body.empujar_alertas);
    if (body.numero_visible !== undefined) {
      const numero = String(body.numero_visible).trim();
      if (numero && !/^\+\d{10,15}$/.test(numero)) {
        return Response.json(
          { message: "El número debe ir en formato internacional, p. ej. +525512345678." },
          { status: 400 },
        );
      }
      patch.numero_visible = numero;
    }

    for (const campo of ["provider_account_id", "provider_phone_number_id"]) {
      if (body[campo] === undefined) continue;
      const valor = String(body[campo]).trim();
      if (valor) {
        const claimed = await g.sr.entities.WhatsAppConfig.filter({ [campo]: valor }, null, 5);
        const ajeno = (claimed || []).find(
          (c: { business_id?: string }) => c.business_id && c.business_id !== g.businessId,
        );
        if (ajeno) {
          // Deliberately does not name the other business.
          return Response.json(
            {
              message: `Ese identificador de WhatsApp ya está conectado a otra cuenta de KitchOps. Si es tuyo, desconéctalo allá primero o escríbenos a soporte.`,
            },
            { status: 409 },
          );
        }
      }
      patch[campo] = valor;
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ message: "No mandaste ningún cambio." }, { status: 400 });
    }

    const existingRows = await g.sr.entities.WhatsAppConfig.filter({ business_id: g.businessId }, null, 1);
    const existing = existingRows?.[0] || null;

    // Turning the agent on without a way to receive messages produces a
    // configuration that looks live and answers nothing.
    const proveedorFinal = String(patch.proveedor ?? existing?.proveedor ?? "zernio");
    const idFinal = proveedorFinal === "meta"
      ? String(patch.provider_phone_number_id ?? existing?.provider_phone_number_id ?? "")
      : String(patch.provider_account_id ?? existing?.provider_account_id ?? "");
    if (patch.activo === true && !idFinal) {
      return Response.json(
        {
          message: proveedorFinal === "meta"
            ? "Antes de encender el agente, captura el Phone Number ID de tu app de Meta."
            : "Antes de encender el agente, captura el accountId de tu cuenta de Zernio.",
        },
        { status: 400 },
      );
    }

    const saved = existing
      ? await g.sr.entities.WhatsAppConfig.update(existing.id, patch)
      : await g.sr.entities.WhatsAppConfig.create({ business_id: g.businessId, ...patch });

    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "WhatsApp:configure",
      entity: "WhatsAppConfig",
      entityId: saved.id,
      summary: patch.activo === true
        ? "Encendió el agente de WhatsApp."
        : patch.activo === false
          ? "Apagó el agente de WhatsApp."
          : `Cambió la configuración del agente de WhatsApp (${Object.keys(patch).join(", ")}).`,
      changes: diffOf(existing, patch),
    });

    return Response.json({ config: saved });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
