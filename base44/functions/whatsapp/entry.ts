import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import {
  parseZernio,
  parseMeta,
  verifyZernio,
  verifyMeta,
  sendZernio,
  sendMeta,
  fetchZernioMedia,
  fetchMetaMedia,
  type MensajeNormalizado,
} from "./handlers/_providers.ts";
import { pensarYResponder, HISTORY_LIMIT } from "./handlers/_brain.ts";
import type { ToolContext } from "./handlers/_tools.ts";

// The KitchOps WhatsApp agent's inbound webhook.
//
// This is the only PUBLIC function in the app — it is called by Zernio/Meta,
// not by a browser, so there is no user token and none of the app's normal auth
// applies. Three things carry the whole design, all of them from AgentKit's
// architecture notes, and all three are failure modes rather than features:
//
//   1. VERIFY THE SIGNATURE FIRST. The URL is public. Without HMAC verification
//      anyone who learns it can post a fake "registra un gasto de $80,000" and
//      the agent will do it.
//   2. ANSWER 2xx WITHIN ~5 SECONDS. Providers retry up to seven times when a
//      webhook is slow. A Claude round-trip plus tool calls does not fit in that
//      budget, so this handler answers immediately and does the work after,
//      outside the response cycle.
//   3. DEDUPLICATE BY EVENT ID. Delivery is at-least-once, and (2) makes
//      duplicates routine rather than rare. WhatsAppEvento is claimed BEFORE any
//      work starts; a claim that finds an existing row drops the delivery. Skip
//      this and one retried message becomes two identical expenses in the books.
//
// Tenant resolution is the other thing worth understanding: with no user token,
// the ONLY way to know which restaurant a message belongs to is to look up the
// provider account id in WhatsAppConfig. Everything downstream — permissions,
// RLS scoping, which books get written — hangs off that lookup.

const MAX_REPLY_CHARS = 3500; // WhatsApp truncates around 4096; leave headroom.

function ok(extra: Record<string, unknown> = {}) {
  // Always 200, even for messages we drop. A 4xx teaches the provider to retry
  // a delivery we have already decided not to act on.
  return Response.json({ received: true, ...extra });
}

async function resolverTenant(sr: any, msg: MensajeNormalizado) {
  const campo = msg.proveedor === "zernio" ? "provider_account_id" : "provider_phone_number_id";
  const clave = msg.accountId;
  if (!clave) return null;
  const rows = await sr.entities.WhatsAppConfig.filter({ [campo]: clave }, null, 2);
  // Two tenants claiming one account id would route a kitchen's messages into
  // someone else's books. whatsappAdmin refuses to save a duplicate, but if one
  // ever exists, refusing to guess is the only safe answer.
  if (!rows || rows.length === 0) return null;
  if (rows.length > 1) {
    console.error(`whatsapp: ${campo}=${clave} está reclamado por ${rows.length} negocios; se descarta el mensaje.`);
    return null;
  }
  return rows[0];
}

/** Match the sender against the tenant's allowlist. Returns null when absent. */
function autorizar(config: any, telefono: string) {
  const lista = Array.isArray(config.numeros_autorizados) ? config.numeros_autorizados : [];
  const normalizado = (telefono || "").replace(/[^\d]/g, "");
  if (!normalizado) return null;
  for (const entrada of lista) {
    const candidato = String(entrada?.numero || "").replace(/[^\d]/g, "");
    if (!candidato) continue;
    // Compare on the last 10 digits: the same Mexican mobile shows up as
    // +52..., +521... and bare 10 digits depending on the provider and on how
    // the owner typed it into the allowlist.
    if (candidato.slice(-10) === normalizado.slice(-10)) {
      return {
        numero: String(entrada.numero),
        nombre: String(entrada.nombre || ""),
        rol: entrada.rol === "business_admin" ? "business_admin" as const : "staff" as const,
      };
    }
  }
  return null;
}

async function responder(config: any, msg: MensajeNormalizado, texto: string) {
  const recorte = texto.length > MAX_REPLY_CHARS ? `${texto.slice(0, MAX_REPLY_CHARS)}…` : texto;
  if (config.proveedor === "meta") {
    const token = Deno.env.get("META_ACCESS_TOKEN");
    if (!token) throw new Error("META_ACCESS_TOKEN no está configurada.");
    await sendMeta(token, config.provider_phone_number_id, msg.conversationId, recorte);
  } else {
    const apiKey = Deno.env.get("ZERNIO_API_KEY");
    if (!apiKey) throw new Error("ZERNIO_API_KEY no está configurada.");
    // Idempotency-Key so a retry of OUR send doesn't double-message the user.
    await sendZernio(apiKey, config.provider_account_id, msg.conversationId, recorte, msg.eventId);
  }
}

/** Everything after the 200. Never throws into the response path. */
async function procesar(sr: any, config: any, msg: MensajeNormalizado, eventoId: string) {
  const business = await sr.entities.Business.get(config.business_id).catch(() => null);
  if (!business) {
    await sr.entities.WhatsAppEvento.update(eventoId, { estado: "fallido", detalle: "El negocio ya no existe." });
    return;
  }

  const remitente = autorizar(config, msg.telefono);

  // Conversation row first, so even a rejected message is visible in the app's
  // inbox — an owner needs to see that someone is messaging the business number,
  // not just silence.
  const convRows = await sr.entities.WhatsAppConversacion.filter(
    { business_id: config.business_id, conversation_id: msg.conversationId }, null, 1,
  );
  let conversacion = convRows?.[0] || null;
  const convPatch = {
    telefono: msg.telefono || conversacion?.telefono || "",
    nombre_contacto: msg.nombreContacto || conversacion?.nombre_contacto || "",
    // Recomputed every message, never cached: the owner removing someone from
    // the allowlist has to take effect on the next message, not eventually.
    autorizado: Boolean(remitente),
    rol_efectivo: remitente?.rol || null,
    ultimo_mensaje_at: new Date().toISOString(),
    ultimo_mensaje_texto: (msg.texto || "(adjunto)").slice(0, 200),
    mensajes_count: Number(conversacion?.mensajes_count || 0) + 1,
  };
  conversacion = conversacion
    ? await sr.entities.WhatsAppConversacion.update(conversacion.id, convPatch)
    : await sr.entities.WhatsAppConversacion.create({
        business_id: config.business_id,
        conversation_id: msg.conversationId,
        ...convPatch,
      });

  await sr.entities.WhatsAppMensaje.create({
    business_id: config.business_id,
    conversacion_id: conversacion.id,
    direccion: "entrante",
    texto: msg.texto || "",
    media_url: msg.mediaUrl || "",
    media_tipo: msg.mediaTipo || "",
    provider_event_id: msg.eventId,
    enviado_at: new Date().toISOString(),
  });

  if (!remitente) {
    // Not on the allowlist. Answer politely and do nothing else — this agent
    // writes to the books, so "whoever knows the number" is not an
    // authorization model. No hint that an allowlist exists.
    const cortesia =
      "Hola, este número es el asistente interno de la cocina y sólo atiende al equipo del negocio. " +
      "Si necesitas algo, comunícate por los canales de siempre.";
    try {
      await responder(config, msg, cortesia);
      await sr.entities.WhatsAppMensaje.create({
        business_id: config.business_id,
        conversacion_id: conversacion.id,
        direccion: "saliente",
        texto: cortesia,
        enviado_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("whatsapp: no se pudo responder al no autorizado:", (e as Error).message);
    }
    await sr.entities.WhatsAppEvento.update(eventoId, {
      estado: "descartado",
      detalle: `Número no autorizado: ${msg.telefono || "(sin número)"}`,
    });
    return;
  }

  // Media, if any. A ticket photo is the single most common way an expense gets
  // captured, so a failed download degrades to "I couldn't see the photo"
  // rather than to silence.
  let imagen: { base64: string; mime: string } | null = null;
  if (msg.mediaUrl || msg.mediaId) {
    if (config.proveedor === "meta" && msg.mediaId) {
      imagen = await fetchMetaMedia(Deno.env.get("META_ACCESS_TOKEN") || "", msg.mediaId);
    } else if (msg.mediaUrl) {
      imagen = await fetchZernioMedia(Deno.env.get("ZERNIO_API_KEY") || "", msg.mediaUrl);
    }
    // Claude's vision input accepts these four types; a PDF or an audio note is
    // not something to hand it as an image.
    if (imagen && !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(imagen.mime)) {
      imagen = null;
    }
  }

  const historialRows = await sr.entities.WhatsAppMensaje.filter(
    { business_id: config.business_id, conversacion_id: conversacion.id }, "-created_date", HISTORY_LIMIT + 1,
  );
  // Oldest first, and drop the message we just stored — it is passed separately
  // as the current turn, with its image attached.
  const historial = (historialRows || [])
    .slice(1)
    .reverse()
    .map((m: any) => ({ direccion: m.direccion, texto: m.texto }));

  const ctx: ToolContext = {
    sr,
    businessId: config.business_id,
    business,
    remitente,
  };

  let respuesta: string;
  let acciones: unknown[] = [];
  try {
    const result = await pensarYResponder({
      ctx,
      config,
      historial,
      mensaje: msg.texto || "",
      imagen: imagen && (msg.mediaUrl || msg.mediaId) ? imagen : null,
    });
    respuesta = result.respuesta;
    acciones = result.acciones;
    if (!imagen && (msg.mediaUrl || msg.mediaId)) {
      respuesta = `${respuesta}\n\n(No pude abrir el archivo que mandaste. Si es la foto de un ticket, ¿me la reenvías?)`;
    }
  } catch (e) {
    const detalle = (e as Error).message;
    console.error("whatsapp: el agente falló:", detalle);
    respuesta = "Perdón, tuve un problema para procesar tu mensaje. Inténtalo otra vez en un momento.";
    await sr.entities.WhatsAppConfig.update(config.id, {
      ultimo_error: detalle.slice(0, 500),
    }).catch(() => {});
    await sr.entities.WhatsAppEvento.update(eventoId, { estado: "fallido", detalle: detalle.slice(0, 500) });
    // Still try to say something — a user staring at an unanswered message
    // assumes the whole thing is broken.
    try {
      await responder(config, msg, respuesta);
    } catch { /* nothing more to do */ }
    return;
  }

  try {
    await responder(config, msg, respuesta);
  } catch (e) {
    const detalle = `No se pudo enviar la respuesta: ${(e as Error).message}`;
    console.error(`whatsapp: ${detalle}`);
    await sr.entities.WhatsAppEvento.update(eventoId, { estado: "fallido", detalle: detalle.slice(0, 500) });
    // The tools already ran and the writes already landed — record the outbound
    // message anyway so the app's inbox shows what the user never received.
  }

  await sr.entities.WhatsAppMensaje.create({
    business_id: config.business_id,
    conversacion_id: conversacion.id,
    direccion: "saliente",
    texto: respuesta,
    acciones,
    provider_event_id: msg.eventId,
    enviado_at: new Date().toISOString(),
  });

  await sr.entities.WhatsAppConfig.update(config.id, {
    ultimo_mensaje_at: new Date().toISOString(),
    ultimo_error: "",
  }).catch(() => {});

  await sr.entities.WhatsAppEvento.update(eventoId, { estado: "procesado" });
}

Deno.serve(async (req) => {
  // Meta's one-time webhook verification: it GETs with hub.challenge and expects
  // the raw value back as text/plain if the verify token matches.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token === expected && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // The raw body, byte for byte — the signature is over exactly these bytes, so
  // it must be read before any JSON parsing round-trip.
  const rawBody = await req.text();

  const zernioSig = req.headers.get("x-zernio-signature");
  const metaSig = req.headers.get("x-hub-signature-256");

  let msg: MensajeNormalizado | null = null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return ok({ ignored: "cuerpo no es JSON" });
  }

  if (metaSig) {
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appSecret) {
      console.error("whatsapp: llegó una firma de Meta pero META_APP_SECRET no está configurada.");
      return new Response("unauthorized", { status: 401 });
    }
    if (!(await verifyMeta(rawBody, metaSig, appSecret))) {
      return new Response("unauthorized", { status: 401 });
    }
    msg = parseMeta(payload as any);
  } else if (zernioSig) {
    const secret = Deno.env.get("ZERNIO_WEBHOOK_SECRET");
    if (!secret) {
      console.error("whatsapp: llegó una firma de Zernio pero ZERNIO_WEBHOOK_SECRET no está configurada.");
      return new Response("unauthorized", { status: 401 });
    }
    if (!(await verifyZernio(rawBody, zernioSig, secret))) {
      return new Response("unauthorized", { status: 401 });
    }
    msg = parseZernio(payload as any);
  } else {
    // No signature header at all. Never process it — this is the case that turns
    // a public URL into a write primitive against a restaurant's books.
    return new Response("unauthorized", { status: 401 });
  }

  // Not a message we act on: a delivery receipt, a read receipt, or our own
  // outbound echo. Accept it so the provider stops resending.
  if (!msg || !msg.eventId || !msg.conversationId) return ok({ ignored: "no es un mensaje entrante" });

  const base44 = createClientFromRequest(req);
  const sr = base44.asServiceRole;

  // ── Claim the event BEFORE any work ───────────────────────────────────────
  // A row in a FINAL state (procesado/fallido/descartado) means this delivery is
  // settled — drop the retry. A row still in "reclamado" means some earlier
  // attempt started and never finished; if that was long enough ago that no
  // attempt could plausibly still be running, let this retry take it over
  // instead of dropping a message forever. STALE_CLAIM_MS is generous on purpose
  // — re-processing a message that IS still in flight would double-write the
  // very expense the dedup ledger exists to protect.
  const STALE_CLAIM_MS = 3 * 60 * 1000;
  const yaVisto = await sr.entities.WhatsAppEvento.filter(
    { provider_event_id: msg.eventId }, null, 1,
  ).catch(() => []);
  const previo = yaVisto?.[0];
  if (previo) {
    const recibido = Date.parse(previo.recibido_at || previo.created_date || "") || 0;
    const stale = previo.estado === "reclamado" && Date.now() - recibido > STALE_CLAIM_MS;
    if (!stale) return ok({ duplicate: true, estado: previo.estado });
    console.error(`whatsapp: reintentando el evento ${msg.eventId}, reclamado sin terminar desde ${previo.recibido_at}.`);
    await sr.entities.WhatsAppEvento.delete(previo.id).catch(() => {});
  }

  const config = await resolverTenant(sr, msg);
  if (!config) {
    // Unknown account id — an app-level misconfiguration, or a webhook pointed
    // at the wrong deployment. Record it so it is diagnosable, and stop.
    await sr.entities.WhatsAppEvento.create({
      provider_event_id: msg.eventId,
      proveedor: msg.proveedor,
      estado: "descartado",
      detalle: `Ninguna configuración reclama la cuenta ${msg.accountId}.`,
      recibido_at: new Date().toISOString(),
    }).catch(() => {});
    return ok({ ignored: "cuenta no reconocida" });
  }

  const evento = await sr.entities.WhatsAppEvento.create({
    business_id: config.business_id,
    provider_event_id: msg.eventId,
    proveedor: msg.proveedor,
    estado: "reclamado",
    recibido_at: new Date().toISOString(),
  });

  if (config.activo === false) {
    await sr.entities.WhatsAppEvento.update(evento.id, {
      estado: "descartado",
      detalle: "El agente está apagado para este negocio.",
    });
    return ok({ ignored: "agente apagado" });
  }

  // ── Respond first, process after ──────────────────────────────────────────
  // The provider gets its 200 now; the agent keeps working past this return.
  // Failures inside procesar() land on the WhatsAppEvento row and in the app's
  // inbox, because there is no longer a response to put them in.
  const work = procesar(sr, config, msg, evento.id).catch(async (e) => {
    console.error("whatsapp: fallo no controlado:", (e as Error).message);
    await sr.entities.WhatsAppEvento.update(evento.id, {
      estado: "fallido",
      detalle: (e as Error).message.slice(0, 500),
    }).catch(() => {});
  });

  // KNOWN RESIDUAL RISK, stated rather than papered over: a serverless runtime
  // may tear the isolate down once the response resolves, which would kill the
  // work mid-flight. `waitUntil` is the supported way to say "the response is
  // done, the work is not" — use it when the platform exposes one (the global,
  // or a Cloudflare-style event.waitUntil), and otherwise let the promise float,
  // which is what keeps Deno's isolate alive in practice.
  //
  // If it IS killed anyway, the event row stays "reclamado": the message shows
  // as stuck in the app's inbox instead of vanishing, and the stale-claim
  // recovery above lets a later delivery of the same event finish the job. What
  // it cannot do is resurrect a message the provider never retried — that is the
  // price of answering fast, and answering fast is what stops the provider from
  // sending the same message seven times.
  const waitUntil = (globalThis as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
  if (typeof waitUntil === "function") waitUntil(work);

  return ok({ queued: true });
});
