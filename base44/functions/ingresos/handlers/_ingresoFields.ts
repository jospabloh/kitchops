// Field whitelist + validation for a platform cut (IngresoPlataforma).
//
// `diferencia` is DERIVED here, never accepted from the body. It is the number
// the whole reconciliation feature exists to surface — "the platform said
// $18,400 and the bank got $17,950" — so letting a client send its own value
// would mean the one figure an owner acts on is the one figure nobody computed.

export const PLATAFORMAS = ["Rappi", "Uber Eats", "Didi Food", "Otros"];

export interface ValidationResult {
  ok: boolean;
  message?: string;
  fields?: Record<string, unknown>;
}

function isDate(value: unknown): value is string {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const parsed = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(s);
}

export function validateIngreso(
  body: Record<string, unknown>,
  { partial = false } = {},
): ValidationResult {
  const fields: Record<string, unknown> = {};

  if (body.plataforma !== undefined || !partial) {
    const p = String(body.plataforma ?? "");
    if (!PLATAFORMAS.includes(p)) {
      return { ok: false, message: `Plataforma inválida. Usa una de: ${PLATAFORMAS.join(", ")}.` };
    }
    fields.plataforma = p;
  }

  if (body.semana !== undefined || !partial) {
    const semana = String(body.semana ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(semana)) {
      return { ok: false, message: "La semana es obligatoria y debe tener el formato AAAA-SS." };
    }
    fields.semana = semana;
  }

  if (body.monto_corte !== undefined || !partial) {
    const monto = Number(body.monto_corte);
    if (!Number.isFinite(monto) || monto < 0) {
      return { ok: false, message: "El monto del corte debe ser un número mayor o igual a cero." };
    }
    fields.monto_corte = monto;
  }

  for (const key of ["fecha_inicio", "fecha_fin", "fecha_deposito"]) {
    if (body[key] === undefined) continue;
    const raw = body[key];
    // An explicitly cleared date is a legitimate edit ("we don't know yet").
    if (raw === null || raw === "") {
      fields[key] = null;
      continue;
    }
    if (!isDate(raw)) {
      return { ok: false, message: `La ${key.replace("_", " ")} debe tener el formato AAAA-MM-DD.` };
    }
    fields[key] = String(raw).trim();
  }

  if (body.monto_depositado !== undefined) {
    if (body.monto_depositado === null || body.monto_depositado === "") {
      fields.monto_depositado = null;
    } else {
      const dep = Number(body.monto_depositado);
      if (!Number.isFinite(dep) || dep < 0) {
        return { ok: false, message: "El monto depositado debe ser un número mayor o igual a cero." };
      }
      fields.monto_depositado = dep;
    }
  }

  if (body.notas !== undefined) fields.notas = String(body.notas).trim();

  if (
    fields.fecha_inicio && fields.fecha_fin &&
    String(fields.fecha_fin) < String(fields.fecha_inicio)
  ) {
    return { ok: false, message: "La fecha final del corte no puede ser anterior a la inicial." };
  }

  return { ok: true, fields };
}

/**
 * Recompute the derived reconciliation fields from the record as it will be
 * AFTER the patch. Takes both so an update that changes only one side still
 * produces a difference consistent with the other.
 */
export function derivarConciliacion(
  existing: Record<string, unknown> | null,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const corte = Number(patch.monto_corte ?? existing?.monto_corte ?? 0);
  const depositadoRaw = patch.monto_depositado !== undefined
    ? patch.monto_depositado
    : existing?.monto_depositado;

  if (depositadoRaw === null || depositadoRaw === undefined || depositadoRaw === "") {
    // No deposit recorded yet: there is no difference to state, and writing 0
    // would read as "it matched" — the opposite of the truth.
    return { diferencia: null, conciliado: false };
  }
  const depositado = Number(depositadoRaw);
  const diferencia = Number((depositado - corte).toFixed(2));
  // Rounding to the cent, not exact equality: a $0.004 float artifact is not a
  // discrepancy anyone needs to chase.
  return { diferencia, conciliado: Math.abs(diferencia) < 0.01 };
}
