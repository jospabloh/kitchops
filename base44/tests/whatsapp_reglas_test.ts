// Tests for the WhatsApp webhook's pure rules (_reglas.ts) and the brain's
// per-model request options. Each one pins a bug that shipped:
//   - the allowlist matched on the last 10 digits, so a foreign number with the
//     same ending acted as the owner;
//   - two simultaneous deliveries of one event both ran the tools;
//   - "today" was the UTC date, so evening expenses landed on tomorrow;
//   - a history window opening on an assistant turn got a 400 from the API;
//   - Haiku 4.5 got adaptive thinking + effort, which it rejects.
//
//   deno test --allow-env --allow-read base44/tests/

import { assert, assertEquals, assertFalse } from "./_assert.ts";
import {
  claveTelefono,
  fechaLocal,
  ganaElReclamo,
  mismoTelefono,
  sinAsistenteAlInicio,
} from "../functions/whatsapp/handlers/_reglas.ts";
import { construirSystemPrompt, opcionesDeRazonamiento } from "../functions/whatsapp/handlers/_brain.ts";

// ── Allowlist ────────────────────────────────────────────────────────────
Deno.test("allowlist: las formas mexicanas del mismo número coinciden", () => {
  const guardado = "+525512345678";
  assert(mismoTelefono(guardado, "+525512345678"));
  assert(mismoTelefono(guardado, "+5215512345678"));
  assert(mismoTelefono(guardado, "5512345678"));
  assert(mismoTelefono(guardado, "+52 55 1234 5678"));
});

Deno.test("allowlist: un número de otro país con la misma terminación NO coincide", () => {
  const guardado = "+525512345678";
  assertFalse(mismoTelefono(guardado, "+15512345678")); // NANP 551 (New Jersey)
  assertFalse(mismoTelefono(guardado, "+445512345678"));
  assertFalse(mismoTelefono("+527221234567", "+447221234567"));
});

Deno.test("allowlist: vacío nunca coincide con vacío", () => {
  assertFalse(mismoTelefono("", ""));
  assertFalse(mismoTelefono("+525512345678", ""));
  assertEquals(claveTelefono(undefined), "");
});

// ── Event claim ──────────────────────────────────────────────────────────
Deno.test("reclamo: sólo la fila más antigua sigue; empate por id", () => {
  const rows = [
    { id: "b", created_date: "2026-10-14T10:00:00.500Z" },
    { id: "a", created_date: "2026-10-14T10:00:00.100Z" },
  ];
  assert(ganaElReclamo(rows, "a"));
  assertFalse(ganaElReclamo(rows, "b"));

  const empate = [
    { id: "y", created_date: "2026-10-14T10:00:00.000Z" },
    { id: "x", created_date: "2026-10-14T10:00:00.000Z" },
  ];
  // Both racers compute the same winner from the same rows.
  assert(ganaElReclamo(empate, "x"));
  assertFalse(ganaElReclamo(empate, "y"));
});

Deno.test("reclamo: sin filas visibles, la propia gana", () => {
  assert(ganaElReclamo([], "a"));
});

// ── Local date ───────────────────────────────────────────────────────────
Deno.test("fecha: 19:00 del domingo en México sigue siendo domingo, no lunes", () => {
  // 2026-11-02T01:00Z = Sunday 2026-11-01 19:00 in Mexico City (UTC-6).
  const instante = new Date("2026-11-02T01:00:00Z");
  assertEquals(fechaLocal(instante, "America/Mexico_City"), "2026-11-01");
  assertEquals(fechaLocal(instante, undefined), "2026-11-01");
  // A garbage zone falls back to Mexico City rather than throwing.
  assertEquals(fechaLocal(instante, "No/Existe"), "2026-11-01");
});

Deno.test("fecha: el system prompt dice la fecha local del negocio", () => {
  const prompt = construirSystemPrompt(
    {},
    { name: "Fonda", timezone: "America/Mexico_City" },
    { numero: "+525512345678", nombre: "Ana", rol: "staff" },
  );
  assert(prompt.includes(`Hoy es ${fechaLocal(new Date(), "America/Mexico_City")}.`));
});

// ── History ──────────────────────────────────────────────────────────────
Deno.test("historial: se quitan los turnos assistant del principio", () => {
  const out = sinAsistenteAlInicio([
    { role: "assistant", content: "hola" },
    { role: "assistant", content: "¿algo más?" },
    { role: "user", content: "gasté 850" },
    { role: "assistant", content: "listo" },
  ]);
  assertEquals(out.map((m) => m.role), ["user", "assistant"]);
  assertEquals(sinAsistenteAlInicio([{ role: "assistant", content: "x" }]), []);
});

// ── Per-model request options ───────────────────────────────────────────
Deno.test("modelo: Haiku 4.5 no recibe thinking adaptativo ni effort", () => {
  assertEquals(opcionesDeRazonamiento("claude-haiku-4-5"), {});
});

Deno.test("modelo: los modelos ofrecidos sí reciben thinking adaptativo y effort", () => {
  for (const m of ["claude-opus-5", "claude-sonnet-5", "claude-haiku-5-5"]) {
    const o = opcionesDeRazonamiento(m) as { thinking?: { type: string }; output_config?: { effort: string } };
    assertEquals(o.thinking?.type, "adaptive");
    assertEquals(o.output_config?.effort, "medium");
  }
});

Deno.test("modelo: la UI y saveConfigSafe ofrecen la misma lista, y toda acepta thinking adaptativo", async () => {
  const servidor = await Deno.readTextFile(
    new URL("../functions/whatsappAdmin/handlers/saveConfigSafe.ts", import.meta.url),
  );
  const ui = await Deno.readTextFile(new URL("../../src/pages/WhatsApp.jsx", import.meta.url));
  const lista = servidor.match(/const MODELOS = \[([^\]]*)\]/)?.[1] ?? "";
  const delServidor = [...lista.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const deLaUi = [...ui.matchAll(/\{ id: "(claude-[^"]+)"/g)].map((m) => m[1]);

  assert(delServidor.length > 0, "no se encontró MODELOS en saveConfigSafe.ts");
  assertEquals([...deLaUi].sort(), [...delServidor].sort());
  for (const m of delServidor) {
    assert(Object.keys(opcionesDeRazonamiento(m)).length > 0, `${m} no acepta thinking adaptativo`);
  }
});
