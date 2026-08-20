import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";
import { sendZernio, sendMeta } from "./_providers.ts";

// "Send me a test message" — the button that turns a screen full of ids into a
// yes-or-no answer about whether the connection works.
//
// It only ever sends to a number ALREADY on the tenant's allowlist, chosen by
// index rather than supplied as a phone number. That is deliberate: an endpoint
// that sends WhatsApp messages to an arbitrary number on request is a spam relay
// wearing a "test" label, and it would be one an attacker reaches with nothing
// but a valid session in any tenant.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const g = await guard(base44, body, "WhatsApp:configure");
    if (!g.ok) return g.response;

    const rows = await g.sr.entities.WhatsAppConfig.filter({ business_id: g.businessId }, null, 1);
    const config = rows?.[0];
    if (!config) {
      return Response.json({ message: "Todavía no has configurado el agente." }, { status: 400 });
    }

    const lista = Array.isArray(config.numeros_autorizados) ? config.numeros_autorizados : [];
    if (lista.length === 0) {
      return Response.json(
        { message: "Primero autoriza al menos un número; la prueba se manda a uno de ellos." },
        { status: 400 },
      );
    }

    const indice = Number.isInteger(body.indice) ? Number(body.indice) : 0;
    const destino = lista[indice];
    if (!destino?.numero) {
      return Response.json({ message: "Ese número no está en tu lista de autorizados." }, { status: 400 });
    }

    const texto =
      `Prueba de KitchOps ✅\n\n` +
      `Soy ${config.agente_nombre || "Kitch"}, el asistente de "${g.business.name}". ` +
      `Si estás leyendo esto, la conexión de WhatsApp quedó lista.\n\n` +
      `Puedes escribirme cosas como "registra 850 de verduras con La Central" o "¿qué me falta?".`;

    try {
      if (config.proveedor === "meta") {
        const token = Deno.env.get("META_ACCESS_TOKEN");
        if (!token) throw new Error("Falta el secreto META_ACCESS_TOKEN en la app.");
        if (!config.provider_phone_number_id) throw new Error("Falta el Phone Number ID en la configuración.");
        // Meta addresses replies by phone number, without the leading '+'.
        await sendMeta(token, config.provider_phone_number_id, destino.numero.replace(/^\+/, ""), texto);
      } else {
        const apiKey = Deno.env.get("ZERNIO_API_KEY");
        if (!apiKey) throw new Error("Falta el secreto ZERNIO_API_KEY en la app.");
        if (!config.provider_account_id) throw new Error("Falta el accountId de Zernio en la configuración.");
        // Zernio needs a conversationId to send into. Outside an existing
        // conversation there is nothing to send into — which is itself the
        // honest answer, and a better one than a misleading success.
        const conv = await g.sr.entities.WhatsAppConversacion.filter(
          { business_id: g.businessId, telefono: destino.numero }, "-ultimo_mensaje_at", 1,
        );
        const conversationId = conv?.[0]?.conversation_id;
        if (!conversationId) {
          return Response.json(
            {
              message: `Zernio sólo permite escribir dentro de una conversación existente. Pídele a ${destino.nombre || destino.numero} que le mande cualquier mensaje al número del negocio y vuelve a intentar.`,
              reason: "sin_conversacion",
            },
            { status: 409 },
          );
        }
        await sendZernio(apiKey, config.provider_account_id, conversationId, texto);
      }
    } catch (e) {
      const detalle = (e as Error).message;
      await g.sr.entities.WhatsAppConfig.update(config.id, { ultimo_error: detalle.slice(0, 500) }).catch(() => {});
      return Response.json({ message: `No se pudo enviar: ${detalle}` }, { status: 502 });
    }

    await g.sr.entities.WhatsAppConfig.update(config.id, { ultimo_error: "" }).catch(() => {});
    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "WhatsApp:configure",
      entity: "WhatsAppConfig",
      entityId: config.id,
      summary: `Mandó un mensaje de prueba a ${destino.nombre || destino.numero}.`,
    });

    return Response.json({ success: true, enviado_a: destino.numero });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
