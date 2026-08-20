// Tests for the WhatsApp webhook's two security-critical pure functions:
// signature verification and payload parsing.
//
// Both are in _providers.ts, which imports nothing, so these exercise the real
// code. They matter more than most tests in this repo because the webhook is
// the app's only public endpoint and it writes to a restaurant's books: a
// signature check that silently accepts anything is indistinguishable from one
// that works, right up until someone finds the URL.
//
//   deno test --allow-env base44/tests/

import { assert, assertEquals, assertFalse } from "./_assert.ts";
import {
  bytesToBase64,
  hmacHex,
  parseMeta,
  parseZernio,
  timingSafeEqual,
  verifyMeta,
  verifyZernio,
} from "../functions/whatsapp/handlers/_providers.ts";

const SECRET = "un-secreto-de-prueba";

// ── Signature verification ────────────────────────────────────────────────
Deno.test("Zernio: acepta una firma válida", async () => {
  const body = JSON.stringify({ payload: { id: "evt_1" } });
  const firma = await hmacHex(SECRET, body);
  assert(await verifyZernio(body, firma, SECRET));
});

Deno.test("Zernio: rechaza firma incorrecta, ausente y de otro cuerpo", async () => {
  const body = JSON.stringify({ payload: { id: "evt_1" } });
  const firma = await hmacHex(SECRET, body);

  assertFalse(await verifyZernio(body, null, SECRET));
  assertFalse(await verifyZernio(body, "", SECRET));
  assertFalse(await verifyZernio(body, "no-es-una-firma", SECRET));
  assertFalse(await verifyZernio(body, firma, "otro-secreto"));
  // The signature covers the RAW body — a single altered byte must fail, which
  // is the whole point: this is what stops someone replaying a real event with
  // the amount changed.
  assertFalse(await verifyZernio(body.replace("evt_1", "evt_2"), firma, SECRET));
});

Deno.test("Zernio: la firma es case-insensitive en hex, como la manda el proveedor", async () => {
  const body = "{}";
  const firma = await hmacHex(SECRET, body);
  assert(await verifyZernio(body, firma.toUpperCase(), SECRET));
  assert(await verifyZernio(body, `  ${firma}  `, SECRET));
});

Deno.test("Meta: exige el prefijo sha256=", async () => {
  const body = JSON.stringify({ entry: [] });
  const hex = await hmacHex(SECRET, body);
  assert(await verifyMeta(body, `sha256=${hex}`, SECRET));
  // Meta always sends the prefix; accepting a bare hex would mean accepting a
  // shape Meta never sends, which can only ever come from someone else.
  assertFalse(await verifyMeta(body, hex, SECRET));
  assertFalse(await verifyMeta(body, `sha1=${hex}`, SECRET));
  assertFalse(await verifyMeta(body, null, SECRET));
});

Deno.test("timingSafeEqual compara sin cortocircuitar por longitud", () => {
  assert(timingSafeEqual("abc", "abc"));
  assertFalse(timingSafeEqual("abc", "abd"));
  assertFalse(timingSafeEqual("abc", "abcd"));
  assertFalse(timingSafeEqual("", "a"));
  assert(timingSafeEqual("", ""));
});

// ── Zernio payload parsing ────────────────────────────────────────────────
Deno.test("Zernio: normaliza un mensaje entrante", () => {
  const msg = parseZernio({
    payload: {
      id: "evt_abc",
      account: { id: "acc_1" },
      message: {
        direction: "incoming",
        platform: "whatsapp",
        text: "registra 850 de verduras",
        conversationId: "conv_9",
        sender: { phoneNumber: "+5215512345678", name: "Beto" },
      },
    },
  });

  assertEquals(msg?.eventId, "evt_abc");
  assertEquals(msg?.proveedor, "zernio");
  assertEquals(msg?.conversationId, "conv_9");
  assertEquals(msg?.accountId, "acc_1");
  assertEquals(msg?.telefono, "+5215512345678");
  assertEquals(msg?.texto, "registra 850 de verduras");
});

Deno.test("Zernio: ignora los ecos de nuestras propias respuestas", () => {
  // Outbound messages come back through the same webhook. Acting on them would
  // put the agent in a conversation with itself.
  const eco = parseZernio({
    payload: {
      id: "evt_out",
      account: { id: "acc_1" },
      message: { direction: "outgoing", text: "Listo, ya quedó", conversationId: "conv_9" },
    },
  });
  assertEquals(eco, null);
});

Deno.test("Zernio: ignora eventos que no son mensajes y otras plataformas", () => {
  assertEquals(parseZernio({ payload: { id: "evt_1", account: { id: "a" } } }), null);
  assertEquals(
    parseZernio({
      payload: {
        id: "evt_1",
        account: { id: "a" },
        message: { direction: "incoming", platform: "instagram", conversationId: "c" },
      },
    }),
    null,
  );
});

Deno.test("Zernio: sobrevive sin número de teléfono", () => {
  // Meta stopped guaranteeing phoneNumber on inbound payloads in April 2026;
  // businessScopedUserId is the fallback identifier, and replies go by
  // conversationId regardless.
  const msg = parseZernio({
    payload: {
      id: "evt_1",
      account: { id: "acc_1" },
      message: {
        direction: "incoming",
        conversationId: "conv_9",
        text: "hola",
        sender: { businessScopedUserId: "bsu_77" },
      },
    },
  });
  assertEquals(msg?.telefono, "");
  assertEquals(msg?.nombreContacto, "bsu_77");
  assertEquals(msg?.conversationId, "conv_9");
});

// ── Meta payload parsing ──────────────────────────────────────────────────
Deno.test("Meta: normaliza un mensaje de texto", () => {
  const msg = parseMeta({
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: "pn_1" },
          contacts: [{ profile: { name: "Beto" } }],
          messages: [{ id: "wamid.1", from: "5215512345678", type: "text", text: { body: "hola" } }],
        },
      }],
    }],
  });

  assertEquals(msg?.eventId, "wamid.1");
  assertEquals(msg?.accountId, "pn_1");
  // Meta addresses replies by the sender's number, so it doubles as the
  // conversation key — and it arrives WITHOUT the leading +.
  assertEquals(msg?.conversationId, "5215512345678");
  assertEquals(msg?.telefono, "+5215512345678");
  assertEquals(msg?.nombreContacto, "Beto");
  assertEquals(msg?.texto, "hola");
});

Deno.test("Meta: una foto de ticket trae mediaId y usa el caption como texto", () => {
  const msg = parseMeta({
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: "pn_1" },
          messages: [{
            id: "wamid.2",
            from: "5215512345678",
            type: "image",
            image: { id: "media_9", mime_type: "image/jpeg", caption: "el ticket de hoy" },
          }],
        },
      }],
    }],
  });

  assertEquals(msg?.mediaId, "media_9");
  assertEquals(msg?.mediaTipo, "image/jpeg");
  assertEquals(msg?.texto, "el ticket de hoy");
});

Deno.test("Meta: ignora los avisos de entrega y lectura", () => {
  // Status callbacks arrive on the same webhook and carry no `messages` array.
  // They are not something to answer.
  const status = parseMeta({
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: "pn_1" },
          statuses: [{ id: "wamid.1", status: "delivered" }],
        },
      }],
    }],
  });
  assertEquals(status, null);
  assertEquals(parseMeta({}), null);
  assertEquals(parseMeta({ entry: [] }), null);
});

// ── base64 ────────────────────────────────────────────────────────────────
Deno.test("bytesToBase64 maneja payloads del tamaño de una foto", () => {
  assertEquals(bytesToBase64(new Uint8Array([104, 111, 108, 97])), "aG9sYQ==");
  // The naive btoa(String.fromCharCode(...bytes)) blows the argument limit
  // somewhere around 100 KB — which is exactly the size of a ticket photo, so
  // it would work in every test and fail on every real message.
  const grande = new Uint8Array(300_000).fill(65);
  const salida = bytesToBase64(grande);
  assertEquals(salida.length, Math.ceil(300_000 / 3) * 4);
  assert(salida.startsWith("QUFB"));
});
