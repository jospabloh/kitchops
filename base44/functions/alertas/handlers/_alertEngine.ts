// The alert rules, in one place, evaluated for exactly one business.
//
// GENERATED FILE — do not edit by hand. Canonical source lives in
// scripts/lib/function-shared/; run `npm run generate:function-shared` to
// refresh every copy. Two functions need it — the `alertas` group (an owner
// pressing "recalcular") and `generarAlertas` (the nightly sweep across every
// tenant) — and Base44/Deno cannot import across function directories.
//
// TENANT SCOPING IS THE WHOLE POINT OF THE SIGNATURE. The original version of
// this logic listed every Gasto/Ingreso/InventarioItem in the app and compared
// them to each other, which was correct only while KitchOps had exactly one
// restaurant in it. Every query below is filtered by business_id, and the
// caller passes the id in — there is no "current tenant" to fall back on
// inside a service-role context.

export interface AlertThresholds {
  gasto_alto_umbral_pct: number;
  gasto_alto_critico_pct: number;
  deposito_diferencia_critica: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  gasto_alto_umbral_pct: 20,
  gasto_alto_critico_pct: 50,
  deposito_diferencia_critica: 500,
};

export interface AlertaNueva {
  business_id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  severidad: "verde" | "amarillo" | "rojo";
  fecha: string;
  leida: boolean;
  entidad_ref?: string;
}

function money(value: number, simbolo = "$"): string {
  const n = Number(value || 0);
  return `${simbolo}${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Evaluate every rule for one business and return the alerts that should exist
 * right now. Deduplication against what's already unread happens in the caller,
 * so this function stays pure enough to reason about (and to test) on its own.
 */
export async function evaluarAlertas(
  // deno-lint-ignore no-explicit-any
  sr: any,
  businessId: string,
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS,
  simboloMoneda = "$",
): Promise<AlertaNueva[]> {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const [gastos, ingresos, inventario] = await Promise.all([
    sr.entities.Gasto.filter({ business_id: businessId }, "-fecha", 2000),
    sr.entities.IngresoPlataforma.filter({ business_id: businessId }, "-created_date", 500),
    sr.entities.InventarioItem.filter({ business_id: businessId }, "-created_date", 1000),
  ]);

  const nuevas: AlertaNueva[] = [];
  const base = { business_id: businessId, fecha: now.toISOString(), leida: false };

  // ── 1. Spend per supplier, this month vs last ────────────────────────────
  const enMes = (g: { fecha?: string }, month: number, year: number) => {
    if (!g.fecha) return false;
    const d = new Date(`${g.fecha}T00:00:00Z`);
    return d.getUTCMonth() === month && d.getUTCFullYear() === year;
  };
  const sumarPorProveedor = (rows: Array<{ proveedor?: string; monto?: number }>) => {
    const out: Record<string, number> = {};
    for (const g of rows) {
      const key = (g.proveedor || "").trim();
      if (!key) continue;
      out[key] = (out[key] || 0) + Number(g.monto || 0);
    }
    return out;
  };

  const actual = sumarPorProveedor(gastos.filter((g: { fecha?: string }) => enMes(g, currentMonth, currentYear)));
  const anterior = sumarPorProveedor(gastos.filter((g: { fecha?: string }) => enMes(g, lastMonth, lastMonthYear)));

  for (const [proveedor, montoActual] of Object.entries(actual)) {
    const montoAnterior = anterior[proveedor] || 0;
    // A supplier with no history isn't a spike, it's a new supplier. Comparing
    // against zero would flag every first purchase as a runaway increase.
    if (montoAnterior <= 0) continue;
    const incremento = ((montoActual - montoAnterior) / montoAnterior) * 100;
    if (incremento <= thresholds.gasto_alto_umbral_pct) continue;
    nuevas.push({
      ...base,
      tipo: "gasto_alto",
      titulo: `Gasto alto: ${proveedor}`,
      mensaje: `Llevas ${incremento.toFixed(0)}% más con ${proveedor} este mes que el pasado (${money(montoActual, simboloMoneda)} contra ${money(montoAnterior, simboloMoneda)}).`,
      severidad: incremento > thresholds.gasto_alto_critico_pct ? "rojo" : "amarillo",
    });
  }

  // ── 2. Platform deposits: missing, or short ──────────────────────────────
  for (const i of ingresos) {
    const corte = Number(i.monto_corte || 0);
    const depositado = i.monto_depositado;

    if (depositado === null || depositado === undefined || depositado === "") {
      nuevas.push({
        ...base,
        tipo: "deposito_faltante",
        titulo: `Depósito pendiente de ${i.plataforma}`,
        mensaje: `El corte de ${i.plataforma} de la semana ${i.semana} por ${money(corte, simboloMoneda)} todavía no tiene depósito registrado.`,
        severidad: "rojo",
        entidad_ref: i.id,
      });
      continue;
    }

    const diff = Number(depositado) - corte;
    // Only shortfalls. Being paid MORE than the cut is worth knowing but it is
    // not the thing that costs a restaurant money, and mixing both into one
    // red alert trains people to ignore the alert.
    if (diff >= -1) continue;
    nuevas.push({
      ...base,
      tipo: "deposito_faltante",
      titulo: `Depósito menor en ${i.plataforma}`,
      mensaje: `Semana ${i.semana}: te depositaron ${money(Math.abs(diff), simboloMoneda)} menos de lo reportado (corte ${money(corte, simboloMoneda)}, depósito ${money(Number(depositado), simboloMoneda)}).`,
      severidad: Math.abs(diff) > thresholds.deposito_diferencia_critica ? "rojo" : "amarillo",
      entidad_ref: i.id,
    });
  }

  // ── 3. Stock at or below the minimum ─────────────────────────────────────
  for (const item of inventario) {
    const stock = Number(item.stock_actual ?? 0);
    const minimo = Number(item.stock_minimo ?? 0);
    // A minimum of 0 means "nobody set one", not "alert me when it hits zero" —
    // otherwise every item ever added starts out alerting.
    if (minimo <= 0) continue;
    if (stock > minimo) continue;
    nuevas.push({
      ...base,
      tipo: "stock_bajo",
      titulo: `Stock bajo: ${item.nombre}`,
      mensaje: stock <= 0
        ? `Te quedaste sin ${item.nombre}.`
        : `Quedan ${stock} ${item.unidad || ""} de ${item.nombre} (mínimo: ${minimo}).`,
      severidad: stock <= 0 ? "rojo" : "amarillo",
      entidad_ref: item.id,
    });
  }

  // ── 4. Card tickets still not invoiced ───────────────────────────────────
  const sinFactura = gastos.filter(
    (g: { metodo_pago?: string; facturado?: boolean }) =>
      g.metodo_pago === "Tarjeta de crédito" && !g.facturado,
  );
  if (sinFactura.length > 0) {
    nuevas.push({
      ...base,
      tipo: "ticket_pendiente",
      titulo: `${sinFactura.length} ${sinFactura.length === 1 ? "ticket sin facturar" : "tickets sin facturar"}`,
      mensaje: `Hay ${sinFactura.length} ${sinFactura.length === 1 ? "gasto" : "gastos"} en tarjeta de crédito sin factura. Sin factura no son deducibles.`,
      severidad: sinFactura.length > 5 ? "amarillo" : "verde",
    });
  }

  // ── 5. Card spend not yet settled ────────────────────────────────────────
  const sinPagar = gastos.filter(
    (g: { metodo_pago?: string; pagado?: boolean }) =>
      g.metodo_pago === "Tarjeta de crédito" && !g.pagado,
  );
  if (sinPagar.length > 0) {
    const total = sinPagar.reduce((s: number, g: { monto?: number }) => s + Number(g.monto || 0), 0);
    nuevas.push({
      ...base,
      tipo: "pago_pendiente",
      titulo: `Tarjeta con ${money(total, simboloMoneda)} por pagar`,
      mensaje: `Hay ${money(total, simboloMoneda)} en ${sinPagar.length} ${sinPagar.length === 1 ? "gasto" : "gastos"} de tarjeta de crédito que todavía no se pagan.`,
      severidad: "amarillo",
    });
  }

  return nuevas;
}

/**
 * Persist the evaluated alerts, skipping any whose title already exists UNREAD
 * for this business.
 *
 * Title-based dedup is deliberate and it is what makes the nightly sweep safe
 * to run every night: "Stock bajo: jitomate" stays one row until someone reads
 * it, instead of accumulating one per run. The cost is that a title that stays
 * true but whose NUMBERS change (the shortfall grew) does not re-alert — the
 * body of the existing row goes stale. That trade favours an alert list people
 * still look at over one they've learned to dismiss.
 */
export async function persistirAlertas(
  // deno-lint-ignore no-explicit-any
  sr: any,
  businessId: string,
  nuevas: AlertaNueva[],
): Promise<{ creadas: number; evaluadas: number; duplicadas: number }> {
  const existentes = await sr.entities.Alerta.filter(
    { business_id: businessId, leida: false }, "-created_date", 500,
  );
  const titulosAbiertos = new Set((existentes || []).map((a: { titulo?: string }) => a.titulo));
  const aCrear = nuevas.filter((a) => !titulosAbiertos.has(a.titulo));

  let creadas = 0;
  if (aCrear.length > 0) {
    const result = await sr.entities.Alerta.bulkCreate(aCrear);
    creadas = Array.isArray(result) ? result.length : aCrear.length;
  }

  return { creadas, evaluadas: nuevas.length, duplicadas: nuevas.length - aCrear.length };
}
