// Detección y textos compartidos del paso "verifica tu correo" (Login y Register).
//
// Base44 responde en inglés y sin código estable, así que se detecta por el
// texto del mensaje. Es deliberadamente amplia: un falso positivo abre el paso
// del código (inofensivo, tiene "Reenviar" y "Volver"); un falso negativo deja
// a alguien con la cuenta sin activar y sin dónde escribir el código que ya le
// llegó al correo, que es justo el fallo que esto arregla (stockflow, 2026-09).
//
// Sin imports, para poder probarse con `deno test` (base44/tests/).

const NOT_VERIFIED = /verify your email|verification code|email (is )?not verified|not verified|confirm your email|verify.*(e-?mail|account)/i;

export function needsEmailVerification(error) {
  const text = [error?.message, error?.data?.message, error?.response?.data?.message, error?.response?.data?.detail]
    .filter((v) => typeof v === "string")
    .join(" ");
  return NOT_VERIFIED.test(text);
}

// Código que se escribe a mano: quita espacios y guiones (los correos suelen
// mostrarlo como "123 456") y no admite otra cosa que dígitos.
export function cleanOtp(value) {
  return String(value ?? "").replace(/[\s-]/g, "");
}

// Mensaje en español para un fallo de verifyOtp/resendOtp.
export function mensajeDeOtp(err, fallback) {
  const raw = String(err?.message || err?.data?.message || "").toLowerCase();
  if (!raw) return fallback;
  if (raw.includes("expired")) return "El código venció. Pide uno nuevo con «Reenviar código».";
  if (raw.includes("invalid") || raw.includes("incorrect") || raw.includes("wrong")) {
    return "Código incorrecto. Revísalo o pide uno nuevo.";
  }
  if (raw.includes("too many") || raw.includes("rate") || raw.includes("limit")) {
    return "Demasiados intentos. Espera un minuto antes de volver a intentar.";
  }
  if (raw.includes("network") || raw.includes("fetch") || raw.includes("timeout")) {
    return "No pudimos conectar. Revisa tu internet e inténtalo otra vez.";
  }
  return fallback;
}
