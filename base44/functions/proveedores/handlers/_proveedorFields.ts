export const CATEGORIAS = ["Insumos", "Servicios", "Renta", "Equipos", "Mantenimiento", "Otros"];

export interface ValidationResult {
  ok: boolean;
  message?: string;
  fields?: Record<string, unknown>;
}

/**
 * Normalize a Mexican mobile number to E.164, which is the only form the
 * WhatsApp providers accept. Accepts what people actually type — "55 1234
 * 5678", "045 55...", "+52 1 55..." — and returns "" for anything it cannot
 * confidently interpret, so a half-parsed number never gets saved as if it
 * were valid.
 */
export function normalizeWhatsApp(raw: unknown): string {
  const digits = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return /^\+\d{10,15}$/.test(digits) ? digits : "";
  // 10 digits = a national Mexican number.
  if (/^\d{10}$/.test(digits)) return `+52${digits}`;
  // 52 + 10, or 521 + 10 (the legacy mobile prefix WhatsApp still emits).
  if (/^52\d{10}$/.test(digits)) return `+${digits}`;
  if (/^521\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{11,15}$/.test(digits)) return `+${digits}`;
  return "";
}

export function validateProveedor(
  body: Record<string, unknown>,
  { partial = false } = {},
): ValidationResult {
  const fields: Record<string, unknown> = {};

  if (body.nombre !== undefined || !partial) {
    const nombre = String(body.nombre ?? "").trim();
    if (!nombre) return { ok: false, message: "El nombre del proveedor es obligatorio." };
    fields.nombre = nombre;
  }

  if (body.categoria !== undefined) {
    const categoria = String(body.categoria);
    if (!CATEGORIAS.includes(categoria)) {
      return { ok: false, message: `Categoría inválida. Usa una de: ${CATEGORIAS.join(", ")}.` };
    }
    fields.categoria = categoria;
  }

  if (body.contacto !== undefined) fields.contacto = String(body.contacto).trim();
  if (body.notas !== undefined) fields.notas = String(body.notas).trim();
  if (body.activo !== undefined) fields.activo = Boolean(body.activo);

  if (body.whatsapp !== undefined) {
    const raw = String(body.whatsapp ?? "").trim();
    if (!raw) {
      fields.whatsapp = "";
    } else {
      const normalized = normalizeWhatsApp(raw);
      if (!normalized) {
        return {
          ok: false,
          message: "Ese número de WhatsApp no se entiende. Escríbelo a 10 dígitos (5512345678) o en formato internacional (+525512345678).",
        };
      }
      fields.whatsapp = normalized;
    }
  }

  return { ok: true, fields };
}
