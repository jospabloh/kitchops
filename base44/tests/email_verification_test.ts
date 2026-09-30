// Detección de "correo sin verificar" (Login) y limpieza del código (paso OTP).
// Importa el JS del cliente tal cual: no tiene imports, a propósito.
//
//   deno test --allow-env base44/tests/

import { assert, assertEquals, assertFalse } from "./_assert.ts";
import { cleanOtp, mensajeDeOtp, needsEmailVerification } from "../../src/lib/emailVerification.js";

Deno.test("detecta los mensajes de Base44 por correo sin verificar", () => {
  assert(needsEmailVerification({ message: "Please verify your email" }));
  assert(needsEmailVerification({ message: "Email not verified" }));
  assert(needsEmailVerification({ data: { message: "Enter the verification code we sent" } }));
  assert(needsEmailVerification({ response: { data: { detail: "Please confirm your email address" } } }));
});

Deno.test("no confunde credenciales malas ni fallos de red con correo sin verificar", () => {
  assertFalse(needsEmailVerification({ message: "Invalid email or password" }));
  assertFalse(needsEmailVerification({ message: "Network Error" }));
  assertFalse(needsEmailVerification(undefined));
  assertFalse(needsEmailVerification({}));
});

Deno.test("cleanOtp quita espacios y guiones", () => {
  assertEquals(cleanOtp(" 123 456 "), "123456");
  assertEquals(cleanOtp("123-456"), "123456");
  assertEquals(cleanOtp(undefined), "");
});

Deno.test("mensajeDeOtp habla español y cae al fallback", () => {
  assertEquals(mensajeDeOtp({ message: "Verification code expired" }, "x").includes("venció"), true);
  assertEquals(mensajeDeOtp({ message: "Invalid code" }, "x").includes("incorrecto"), true);
  assertEquals(mensajeDeOtp({ message: "boom" }, "fallback"), "fallback");
  assertEquals(mensajeDeOtp(undefined, "fallback"), "fallback");
});
