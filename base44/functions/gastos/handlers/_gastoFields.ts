// Field whitelist + validation shared by create and update.
//
// A whitelist rather than a passthrough: the client sends a form object, and
// spreading it straight into the entity would let a caller set business_id (to
// another tenant), or `origen: "whatsapp"` to make a hand-typed expense look
// like the bot registered it. Only the fields below ever reach the entity, and
// business_id/origen are set by the handler, never by the body.

export const CATEGORIAS = ["Insumos", "Servicios", "Renta", "Equipos", "Mantenimiento", "Otros"];
export const METODOS_PAGO = ["Tarjeta de crédito", "Transferencia", "Efectivo", "Otros"];

export interface GastoInput {
  monto?: unknown;
  fecha?: unknown;
  proveedor?: unknown;
  categoria?: unknown;
  metodo_pago?: unknown;
  ticket_foto_url?: unknown;
  descripcion?: unknown;
  facturado?: unknown;
  pagado?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  message?: string;
  fields?: Record<string, unknown>;
}

/** ISO week key (YYYY-WW), the grouping the weekly cut and the alerts use. */
export function semanaDe(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  // ISO 8601: week 1 is the week containing the first Thursday of the year.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

export function validateGasto(body: GastoInput, { partial = false } = {}): ValidationResult {
  const fields: Record<string, unknown> = {};

  if (body.monto !== undefined || !partial) {
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return { ok: false, message: "El monto debe ser un número mayor a cero." };
    }
    fields.monto = monto;
  }

  if (body.fecha !== undefined || !partial) {
    const fecha = String(body.fecha ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { ok: false, message: "La fecha es obligatoria y debe tener el formato AAAA-MM-DD." };
    }
    // A date the calendar doesn't have (2026-02-31) passes the regex but lands
    // in the books as a silently shifted day.
    const parsed = new Date(`${fecha}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(fecha)) {
      return { ok: false, message: "Esa fecha no existe en el calendario." };
    }
    fields.fecha = fecha;
    fields.semana = semanaDe(fecha);
  }

  if (body.proveedor !== undefined || !partial) {
    const proveedor = String(body.proveedor ?? "").trim();
    if (!proveedor) return { ok: false, message: "Indica el proveedor." };
    fields.proveedor = proveedor;
  }

  if (body.categoria !== undefined) {
    const categoria = String(body.categoria);
    if (!CATEGORIAS.includes(categoria)) {
      return { ok: false, message: `Categoría inválida. Usa una de: ${CATEGORIAS.join(", ")}.` };
    }
    fields.categoria = categoria;
  }

  if (body.metodo_pago !== undefined) {
    const metodo = String(body.metodo_pago);
    if (!METODOS_PAGO.includes(metodo)) {
      return { ok: false, message: `Método de pago inválido. Usa uno de: ${METODOS_PAGO.join(", ")}.` };
    }
    fields.metodo_pago = metodo;
  }

  if (body.descripcion !== undefined) fields.descripcion = String(body.descripcion).trim();
  if (body.ticket_foto_url !== undefined) fields.ticket_foto_url = String(body.ticket_foto_url).trim();
  if (body.facturado !== undefined) fields.facturado = Boolean(body.facturado);
  if (body.pagado !== undefined) fields.pagado = Boolean(body.pagado);

  return { ok: true, fields };
}
