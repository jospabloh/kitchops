// Pure helpers the screens use (src/lib/*). Import-free JS, so Deno loads them
// as-is and this tests the real code, not a copy.
//
//   deno test --allow-env --allow-read base44/tests/

import { assertEquals } from "./_assert.ts";
import { mensajeDeError } from "../../src/lib/format.js";
import { conRegistro, sinRegistro } from "../../src/lib/registros.js";

const FALLBACK = "No pudimos guardar el gasto.";

Deno.test("mensajeDeError pasa la frase del servidor tal cual", () => {
  const err = { response: { status: 403, data: { message: "No tienes permiso para hacer esto." } } };
  assertEquals(mensajeDeError(err, FALLBACK), "No tienes permiso para hacer esto.");
  // Base44Error (entidades) trae data en la raíz.
  assertEquals(mensajeDeError({ status: 400, data: { message: "Esa fecha no existe." } }, FALLBACK), "Esa fecha no existe.");
});

Deno.test("mensajeDeError nunca muestra el inglés del transporte", () => {
  assertEquals(
    mensajeDeError({ message: "Network Error", code: "ERR_NETWORK" }, FALLBACK),
    "No pudimos conectar. Revisa tu internet e inténtalo otra vez.",
  );
  assertEquals(
    mensajeDeError({ message: "Request failed with status code 500", response: { status: 500, data: {} } }, FALLBACK),
    FALLBACK,
  );
  assertEquals(
    mensajeDeError({ message: "Unauthorized", response: { status: 401, data: { message: "Unauthorized" } } }, FALLBACK),
    "Tu sesión venció. Vuelve a entrar.",
  );
});

Deno.test("conRegistro pone primero un registro nuevo y reemplaza uno existente", () => {
  const lista = [{ id: "a", monto: 1 }, { id: "b", monto: 2 }];
  assertEquals(conRegistro(lista, { id: "c", monto: 3 }).map((r: { id: string }) => r.id), ["c", "a", "b"]);
  assertEquals(conRegistro(lista, { id: "b", monto: 20 }), [{ id: "a", monto: 1 }, { id: "b", monto: 20 }]);
  // Una respuesta sin registro no toca la lista.
  assertEquals(conRegistro(lista, undefined), lista);
});

Deno.test("sinRegistro quita sólo el id indicado", () => {
  assertEquals(sinRegistro([{ id: "a" }, { id: "b" }], "a"), [{ id: "b" }]);
  assertEquals(sinRegistro(undefined, "a"), []);
});
