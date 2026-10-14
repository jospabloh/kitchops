// Pure helpers behind the cuts (IngresoPlataforma) and the alert dedup.
//
// Same rule as permissions_test.ts: these import the real generated copies,
// which are byte-identical to the canonical sources by construction
// (generate-function-shared --check in CI), so testing one copy tests them all.
//
//   deno test --allow-env --allow-read base44/tests/

import { assert, assertEquals, assertFalse } from "./_assert.ts";
import {
  isDate,
  isSemana,
  tocaConciliacion,
  validateIngreso,
} from "../functions/ingresos/handlers/_ingresoFields.ts";
import {
  type AlertaNueva,
  claveAlerta,
  persistirAlertas,
} from "../functions/alertas/handlers/_alertEngine.ts";

// ── Semana y fechas ──────────────────────────────────────────────────────────

Deno.test("isSemana acepta 01..52 y rechaza 00, 54 y 99", () => {
  assert(isSemana("2026-01"));
  assert(isSemana("2026-52"));
  assertFalse(isSemana("2026-00"));
  assertFalse(isSemana("2026-54"));
  assertFalse(isSemana("2026-99"));
  assertFalse(isSemana("2026-4"));
});

Deno.test("isSemana sólo acepta la semana 53 en los años que la tienen", () => {
  assert(isSemana("2026-53"), "2026 empieza en jueves: tiene semana 53");
  assert(isSemana("2020-53"), "2020 es bisiesto y empieza en miércoles");
  assertFalse(isSemana("2025-53"), "2025 empieza en miércoles y no es bisiesto");
  assertFalse(isSemana("2027-53"));
});

Deno.test("validateIngreso rechaza una semana que no existe", () => {
  const r = validateIngreso({ plataforma: "Rappi", semana: "2026-99", monto_corte: 100 });
  assertFalse(r.ok);
});

Deno.test("isDate rechaza una fecha con formato válido que el calendario no tiene", () => {
  assert(isDate("2026-02-28"));
  assertFalse(isDate("2026-13-45"));
  assertFalse(isDate("2026-02-31"));
});

// ── Qué cuenta como conciliar ────────────────────────────────────────────────

Deno.test("crear un corte con depósito es conciliar; sin depósito no", () => {
  assert(tocaConciliacion(null, { monto_corte: 18400, monto_depositado: 18400 }));
  assert(tocaConciliacion(null, { monto_corte: 18400, fecha_deposito: "2026-10-01" }));
  // What Ingresos.jsx sends when the deposit fields are left blank.
  assertFalse(tocaConciliacion(null, { monto_corte: 18400, monto_depositado: null, fecha_deposito: null }));
});

Deno.test("igualar monto_corte al depósito ya registrado es conciliar", () => {
  const existing = { monto_corte: 18400, monto_depositado: 17950, fecha_deposito: "2026-10-01" };
  assert(tocaConciliacion(existing, { monto_corte: 17950 }));
});

Deno.test("corregir monto_corte sin depósito registrado NO es conciliar", () => {
  const existing = { monto_corte: 18400, monto_depositado: null };
  assertFalse(tocaConciliacion(existing, { monto_corte: 18000 }));
});

Deno.test("reenviar el registro sin cambios no exige conciliar", () => {
  const existing = { monto_corte: 18400, monto_depositado: 17950, fecha_deposito: "2026-10-01" };
  assertFalse(tocaConciliacion(existing, { ...existing, notas: "typo" }));
});

// ── Dedup de alertas ─────────────────────────────────────────────────────────

function alerta(over: Partial<AlertaNueva>): AlertaNueva {
  return {
    business_id: "b1",
    tipo: "x",
    titulo: "t",
    mensaje: "m",
    severidad: "amarillo",
    fecha: "2026-10-14T00:00:00.000Z",
    leida: false,
    ...over,
  };
}

function fakeSr(existentes: Array<Record<string, unknown>>) {
  const creadas: AlertaNueva[][] = [];
  return {
    creadas,
    entities: {
      Alerta: {
        filter: () => Promise.resolve(existentes),
        bulkCreate: (rows: AlertaNueva[]) => {
          creadas.push(rows);
          return Promise.resolve(rows);
        },
      },
    },
  };
}

Deno.test("la clave de las alertas agregadas no depende de la cifra del título", () => {
  assertEquals(
    claveAlerta(alerta({ tipo: "pago_pendiente", titulo: "Tarjeta con $12,300 por pagar" })),
    claveAlerta(alerta({ tipo: "pago_pendiente", titulo: "Tarjeta con $13,150 por pagar" })),
  );
  assertEquals(
    claveAlerta(alerta({ tipo: "ticket_pendiente", titulo: "3 tickets sin facturar" })),
    claveAlerta(alerta({ tipo: "ticket_pendiente", titulo: "4 tickets sin facturar" })),
  );
});

Deno.test("un total nuevo de tarjeta no crea otra alerta si la anterior sigue sin leer", async () => {
  const sr = fakeSr([{ tipo: "pago_pendiente", titulo: "Tarjeta con $12,300 por pagar", leida: false }]);
  const r = await persistirAlertas(sr, "b1", [
    alerta({ tipo: "pago_pendiente", titulo: "Tarjeta con $13,150 por pagar" }),
  ]);
  assertEquals(r.creadas, 0);
  assertEquals(sr.creadas.length, 0);
});

Deno.test("dos semanas de Rappi sin depósito son dos alertas, aunque haya una abierta de otra semana", async () => {
  const sr = fakeSr([
    { tipo: "deposito_faltante", titulo: "Depósito pendiente de Rappi", entidad_ref: "corte-39" },
  ]);
  const r = await persistirAlertas(sr, "b1", [
    alerta({ tipo: "deposito_faltante", titulo: "Depósito pendiente de Rappi · semana 2026-39", entidad_ref: "corte-39" }),
    alerta({ tipo: "deposito_faltante", titulo: "Depósito pendiente de Rappi · semana 2026-40", entidad_ref: "corte-40" }),
    alerta({ tipo: "deposito_faltante", titulo: "Depósito pendiente de Rappi · semana 2026-41", entidad_ref: "corte-41" }),
  ]);
  assertEquals(r.creadas, 2, "la 39 ya estaba abierta; la 40 y la 41 son nuevas");
  assertEquals(sr.creadas[0].map((a) => a.entidad_ref), ["corte-40", "corte-41"]);
});

Deno.test("un depósito corto alerta aunque siga abierta la de 'pendiente' del mismo corte", async () => {
  const sr = fakeSr([
    { tipo: "deposito_faltante", titulo: "Depósito pendiente de Rappi · semana 2026-40", entidad_ref: "corte-40" },
  ]);
  const r = await persistirAlertas(sr, "b1", [
    alerta({ tipo: "deposito_faltante", titulo: "Depósito menor en Rappi · semana 2026-40", entidad_ref: "corte-40", severidad: "rojo" }),
  ]);
  assertEquals(r.creadas, 1);
});

Deno.test("un depósito corto ya abierto no se repite aunque cambie la cifra", async () => {
  const sr = fakeSr([
    { tipo: "deposito_faltante", titulo: "Depósito menor en Rappi · semana 2026-40", entidad_ref: "corte-40" },
  ]);
  const r = await persistirAlertas(sr, "b1", [
    alerta({ tipo: "deposito_faltante", titulo: "Depósito menor en Rappi · semana 2026-40", entidad_ref: "corte-40" }),
  ]);
  assertEquals(r.creadas, 0);
});

Deno.test("dentro del mismo lote una clave repetida se crea una sola vez", async () => {
  const sr = fakeSr([]);
  const r = await persistirAlertas(sr, "b1", [
    alerta({ tipo: "pago_pendiente", titulo: "Tarjeta con $1 por pagar" }),
    alerta({ tipo: "pago_pendiente", titulo: "Tarjeta con $2 por pagar" }),
  ]);
  assertEquals(r.creadas, 1);
  assertEquals(r.duplicadas, 1);
});
