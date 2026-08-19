// Field whitelist + validation for an inventory item.
//
// `ultimo_costo` is split out from the rest of the fields on purpose: it is
// what the kitchen paid per unit, which is the number margins are computed
// from. Its own permission key (Inventario:edit_costo) is checked by the
// handler, so a staff member can correct a name or a stock level without being
// able to quietly move the cost basis.

export const CATEGORIAS = ["Carnes", "Verduras", "Lácteos", "Bebidas", "Abarrotes", "Limpieza", "Otros"];

export interface ValidationResult {
  ok: boolean;
  message?: string;
  fields?: Record<string, unknown>;
}

export function validateItem(
  body: Record<string, unknown>,
  { partial = false } = {},
): ValidationResult {
  const fields: Record<string, unknown> = {};

  if (body.nombre !== undefined || !partial) {
    const nombre = String(body.nombre ?? "").trim();
    if (!nombre) return { ok: false, message: "El nombre del insumo es obligatorio." };
    fields.nombre = nombre;
  }

  if (body.categoria !== undefined) {
    const categoria = String(body.categoria);
    if (!CATEGORIAS.includes(categoria)) {
      return { ok: false, message: `Categoría inválida. Usa una de: ${CATEGORIAS.join(", ")}.` };
    }
    fields.categoria = categoria;
  }

  for (const key of ["stock_actual", "stock_minimo"]) {
    if (body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, message: `${key === "stock_actual" ? "Las existencias" : "El stock mínimo"} deben ser un número mayor o igual a cero.` };
    }
    fields[key] = n;
  }

  if (body.ultimo_costo !== undefined) {
    if (body.ultimo_costo === null || body.ultimo_costo === "") {
      fields.ultimo_costo = null;
    } else {
      const costo = Number(body.ultimo_costo);
      if (!Number.isFinite(costo) || costo < 0) {
        return { ok: false, message: "El costo debe ser un número mayor o igual a cero." };
      }
      fields.ultimo_costo = costo;
    }
  }

  if (body.unidad !== undefined) {
    const unidad = String(body.unidad).trim();
    if (!unidad) return { ok: false, message: "La unidad de medida no puede quedar vacía." };
    fields.unidad = unidad;
  }
  if (body.proveedor !== undefined) fields.proveedor = String(body.proveedor).trim();

  return { ok: true, fields };
}

/** Does this patch change the cost basis? Drives the extra permission check. */
export function touchesCosto(
  body: Record<string, unknown>,
  existing: Record<string, unknown> | null,
): boolean {
  if (body.ultimo_costo === undefined) return false;
  const next = body.ultimo_costo === null || body.ultimo_costo === "" ? null : Number(body.ultimo_costo);
  const prev = existing?.ultimo_costo === undefined || existing?.ultimo_costo === null
    ? null
    : Number(existing.ultimo_costo);
  return next !== prev;
}
