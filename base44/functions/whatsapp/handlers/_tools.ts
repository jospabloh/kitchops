// What the WhatsApp agent is allowed to DO.
//
// PERMISSION MODEL — the point of this file. Every tool resolves the same
// permission key its equivalent button in the web app is gated on, for the ROLE
// THE SENDER'S NUMBER CARRIES in WhatsAppConfig.numeros_autorizados. A cook
// whose admin revoked "Gastos:delete" cannot delete an expense by asking the bot
// nicely, and nobody outside the allowlist reaches this file at all (the webhook
// drops them earlier).
//
// The billing gate applies too: a view_only tenant's agent answers questions and
// refuses writes, with an explanation, rather than failing opaquely.
//
// These handlers deliberately re-implement the write instead of calling the
// `gastos`/`inventario` Safe functions over HTTP: the webhook has no user token
// to forward (the request came from Meta, not a browser), so an HTTP hop would
// have to run as service role anyway and would only add a failure mode. The
// VALIDATION is not re-implemented — _gastoFields/_itemFields/_ingresoFields are
// the same generated modules those Safe functions use, so the bot and the app
// cannot drift on what a valid expense is.

import { hasPermission, type PermissionUser } from "./_permissions.ts";
import { writeAudit } from "./_audit.ts";
import { validateGasto } from "./_gastoFields.ts";
import { validateItem } from "./_itemFields.ts";
import { validateIngreso, derivarConciliacion } from "./_ingresoFields.ts";

export interface ToolContext {
  // deno-lint-ignore no-explicit-any
  sr: any;
  businessId: string;
  business: Record<string, unknown>;
  /** The allowlist entry that sent this message. */
  remitente: { numero: string; nombre: string; rol: "business_admin" | "staff" };
}

export interface ToolOutcome {
  ok: boolean;
  /** Text the model sees. Written for the model, not the customer. */
  detalle: string;
  entity?: string;
  entityId?: string;
}

function asUser(ctx: ToolContext): PermissionUser {
  // The bot acts AS the person who messaged it, at the role their allowlist
  // entry grants — never as an admin, and never with more than that person has
  // in the app itself.
  return {
    id: `whatsapp:${ctx.remitente.numero}`,
    email: "",
    role: ctx.remitente.rol,
    business_id: ctx.businessId,
  };
}

async function permitido(ctx: ToolContext, key: string): Promise<string | null> {
  const billing = ctx.business.billing_status as string | undefined;
  const ok = await hasPermission(ctx.sr, asUser(ctx), key, billing);
  if (ok) return null;
  if (billing === "view_only" || billing === "suspended") {
    return `La licencia del negocio está en "${billing}", así que no se puede guardar nada. Dile al usuario que lo revise en la app, en Cuenta.`;
  }
  return `El número ${ctx.remitente.numero} (${ctx.remitente.rol}) no tiene el permiso ${key}. Dile que le pida a su administrador que se lo habilite en Permisos.`;
}

function money(n: unknown): string {
  return `$${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Tool schemas handed to Claude ─────────────────────────────────────────
// Descriptions are written for the model: they say when to use the tool and
// what the tricky arguments mean, because the model has no other source of
// truth about this restaurant's conventions.
export const TOOL_DEFINITIONS = [
  {
    name: "registrar_gasto",
    description:
      "Registra un gasto del restaurante (compra a proveedor, servicio, renta, mantenimiento). Úsalo cuando el usuario diga que gastó, compró o pagó algo, o cuando mande la foto de un ticket. Si el usuario no dice la fecha, usa hoy. Si no estás seguro del monto o del proveedor, PREGUNTA antes de registrar: es dinero real y un gasto mal capturado desajusta el corte de la semana.",
    input_schema: {
      type: "object",
      properties: {
        monto: { type: "number", description: "Monto total del gasto, en pesos" },
        proveedor: { type: "string", description: "Nombre del proveedor o del comercio" },
        fecha: { type: "string", description: "Fecha del gasto en formato AAAA-MM-DD. Si no la sabes, usa la de hoy." },
        categoria: {
          type: "string",
          enum: ["Insumos", "Servicios", "Renta", "Equipos", "Mantenimiento", "Otros"],
          description: "Insumos es lo que se cocina o se vende; Servicios es luz, agua, internet, etc.",
        },
        metodo_pago: {
          type: "string",
          enum: ["Tarjeta de crédito", "Transferencia", "Efectivo", "Otros"],
        },
        descripcion: { type: "string", description: "Qué se compró, en pocas palabras" },
      },
      required: ["monto", "proveedor"],
    },
  },
  {
    name: "consultar_gastos",
    description:
      "Consulta los gastos del negocio en un rango de fechas, opcionalmente filtrando por proveedor. Úsalo para responder '¿cuánto llevo gastado?', '¿cuánto le he comprado a X?', '¿cómo va la semana?'.",
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Fecha inicial AAAA-MM-DD" },
        hasta: { type: "string", description: "Fecha final AAAA-MM-DD" },
        proveedor: { type: "string", description: "Filtrar por proveedor (opcional)" },
      },
      required: ["desde", "hasta"],
    },
  },
  {
    name: "consultar_inventario",
    description:
      "Lista los insumos del inventario, con existencias y mínimos. Úsalo para '¿qué me falta?', '¿cuánta carne queda?', '¿qué hay que pedir?'.",
    input_schema: {
      type: "object",
      properties: {
        buscar: { type: "string", description: "Filtra por nombre de insumo (opcional)" },
        solo_bajos: { type: "boolean", description: "true = sólo los que están en o por debajo del mínimo" },
      },
    },
  },
  {
    name: "ajustar_inventario",
    description:
      "Mueve las existencias de un insumo. Usa 'delta' (negativo si salió, positivo si entró) para el uso diario, y 'set' SÓLO cuando el usuario haya hecho un recuento físico y esté dando la cantidad real que hay. Prefiere delta: si dos personas mandan mensajes al mismo tiempo, delta suma bien y set pisa el trabajo del otro.",
    input_schema: {
      type: "object",
      properties: {
        insumo: { type: "string", description: "Nombre del insumo (búsqueda aproximada)" },
        delta: { type: "number", description: "Cuánto entró (+) o salió (-)" },
        set: { type: "number", description: "Existencias reales tras un recuento físico" },
        motivo: { type: "string", description: "Por qué se movió (merma, venta, compra...)" },
      },
      required: ["insumo"],
    },
  },
  {
    name: "registrar_corte",
    description:
      "Registra el corte semanal de una plataforma de delivery (Rappi, Uber Eats, Didi Food). Si el usuario también dice cuánto le depositaron, inclúyelo: ahí es donde se ve si la plataforma pagó de menos.",
    input_schema: {
      type: "object",
      properties: {
        plataforma: { type: "string", enum: ["Rappi", "Uber Eats", "Didi Food", "Otros"] },
        semana: { type: "string", description: "Semana del corte en formato AAAA-SS (ISO). Si el usuario dice 'esta semana', calcúlala." },
        monto_corte: { type: "number", description: "Lo que reporta la plataforma" },
        monto_depositado: { type: "number", description: "Lo que realmente cayó al banco (opcional)" },
      },
      required: ["plataforma", "semana", "monto_corte"],
    },
  },
  {
    name: "consultar_alertas",
    description:
      "Lee las alertas abiertas del negocio: gastos disparados, depósitos que no llegaron, insumos por agotarse, tickets sin facturar. Úsalo para '¿hay algo que deba ver?', '¿cómo vamos?'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "resumen_negocio",
    description:
      "Resumen del mes en curso: total gastado, gastos por categoría, cuánto se depositó, insumos bajo mínimo. Úsalo para preguntas amplias tipo '¿cómo va el mes?'.",
    input_schema: { type: "object", properties: {} },
  },
] as const;

// ── Implementations ───────────────────────────────────────────────────────

type ToolFn = (ctx: ToolContext, input: Record<string, any>) => Promise<ToolOutcome>;

const registrar_gasto: ToolFn = async (ctx, input) => {
  const denied = await permitido(ctx, "Gastos:create");
  if (denied) return { ok: false, detalle: denied };

  const validated = validateGasto({ ...input, fecha: input.fecha || hoyISO() });
  if (!validated.ok) return { ok: false, detalle: `No se pudo registrar: ${validated.message}` };

  const gasto = await ctx.sr.entities.Gasto.create({
    ...validated.fields,
    business_id: ctx.businessId,
    origen: "whatsapp",
  });

  await writeAudit(ctx.sr, {
    businessId: ctx.businessId,
    actorEmail: `whatsapp:${ctx.remitente.numero}`,
    actorRole: ctx.remitente.rol,
    action: "Gastos:create",
    entity: "Gasto",
    entityId: gasto.id,
    summary: `${ctx.remitente.nombre || ctx.remitente.numero} registró por WhatsApp un gasto de ${money(validated.fields.monto)} con ${validated.fields.proveedor} (${validated.fields.fecha}).`,
    source: "whatsapp",
  });

  return {
    ok: true,
    entity: "Gasto",
    entityId: gasto.id,
    detalle: `Gasto registrado: ${money(validated.fields.monto)} con ${validated.fields.proveedor}, fecha ${validated.fields.fecha}, categoría ${validated.fields.categoria || "Insumos"}.`,
  };
};

const consultar_gastos: ToolFn = async (ctx, input) => {
  const denied = await permitido(ctx, "Gastos:view");
  if (denied) return { ok: false, detalle: denied };

  const rows = await ctx.sr.entities.Gasto.filter({ business_id: ctx.businessId }, "-fecha", 2000);
  const desde = String(input.desde || "0000-01-01");
  const hasta = String(input.hasta || "9999-12-31");
  const proveedorFiltro = String(input.proveedor || "").trim().toLowerCase();

  const filtrados = (rows || []).filter((g: any) => {
    if (!g.fecha || g.fecha < desde || g.fecha > hasta) return false;
    if (proveedorFiltro && !(g.proveedor || "").toLowerCase().includes(proveedorFiltro)) return false;
    return true;
  });

  if (filtrados.length === 0) {
    return { ok: true, detalle: `No hay gastos registrados entre ${desde} y ${hasta}${proveedorFiltro ? ` con "${input.proveedor}"` : ""}.` };
  }

  const total = filtrados.reduce((s: number, g: any) => s + Number(g.monto || 0), 0);
  const porCategoria: Record<string, number> = {};
  const porProveedor: Record<string, number> = {};
  for (const g of filtrados) {
    porCategoria[g.categoria || "Otros"] = (porCategoria[g.categoria || "Otros"] || 0) + Number(g.monto || 0);
    porProveedor[g.proveedor || "?"] = (porProveedor[g.proveedor || "?"] || 0) + Number(g.monto || 0);
  }
  const topProveedores = Object.entries(porProveedor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p, m]) => `${p}: ${money(m)}`)
    .join("; ");

  return {
    ok: true,
    detalle:
      `Entre ${desde} y ${hasta}: ${filtrados.length} gastos, total ${money(total)}. ` +
      `Por categoría — ${Object.entries(porCategoria).map(([c, m]) => `${c}: ${money(m)}`).join("; ")}. ` +
      `Top proveedores — ${topProveedores}.`,
  };
};

const consultar_inventario: ToolFn = async (ctx, input) => {
  const denied = await permitido(ctx, "Inventario:view");
  if (denied) return { ok: false, detalle: denied };

  const rows = await ctx.sr.entities.InventarioItem.filter({ business_id: ctx.businessId }, "nombre", 1000);
  const buscar = String(input.buscar || "").trim().toLowerCase();
  let items = rows || [];
  if (buscar) items = items.filter((i: any) => (i.nombre || "").toLowerCase().includes(buscar));
  if (input.solo_bajos) {
    items = items.filter((i: any) => Number(i.stock_minimo || 0) > 0 && Number(i.stock_actual || 0) <= Number(i.stock_minimo));
  }

  if (items.length === 0) {
    return { ok: true, detalle: buscar ? `No encontré ningún insumo que coincida con "${input.buscar}".` : "El inventario está vacío." };
  }

  const lineas = items.slice(0, 40).map((i: any) => {
    const bajo = Number(i.stock_minimo || 0) > 0 && Number(i.stock_actual || 0) <= Number(i.stock_minimo);
    return `${i.nombre}: ${i.stock_actual ?? 0} ${i.unidad || ""}${bajo ? ` (BAJO, mínimo ${i.stock_minimo})` : ""}`;
  });
  const extra = items.length > 40 ? ` …y ${items.length - 40} más.` : "";
  return { ok: true, detalle: lineas.join(" | ") + extra };
};

const ajustar_inventario: ToolFn = async (ctx, input) => {
  const denied = await permitido(ctx, "Inventario:edit_stock");
  if (denied) return { ok: false, detalle: denied };

  const nombre = String(input.insumo || "").trim().toLowerCase();
  if (!nombre) return { ok: false, detalle: "Falta decir qué insumo se movió." };

  const rows = await ctx.sr.entities.InventarioItem.filter({ business_id: ctx.businessId }, "nombre", 1000);
  const exactos = (rows || []).filter((i: any) => (i.nombre || "").toLowerCase() === nombre);
  const parciales = (rows || []).filter((i: any) => (i.nombre || "").toLowerCase().includes(nombre));
  const candidatos = exactos.length ? exactos : parciales;

  if (candidatos.length === 0) {
    return { ok: false, detalle: `No hay ningún insumo llamado "${input.insumo}" en el inventario. Pregúntale al usuario si quiere darlo de alta primero.` };
  }
  // Guessing between "carne molida" and "carne de res" would silently move the
  // wrong stock. Ask instead.
  if (candidatos.length > 1) {
    return {
      ok: false,
      detalle: `"${input.insumo}" coincide con varios insumos: ${candidatos.slice(0, 6).map((i: any) => i.nombre).join(", ")}. Pregúntale al usuario a cuál se refiere.`,
    };
  }

  const item = candidatos[0];
  const anterior = Number(item.stock_actual ?? 0);
  let nuevo: number;

  if (input.set !== undefined && input.set !== null) {
    const n = Number(input.set);
    if (!Number.isFinite(n) || n < 0) return { ok: false, detalle: "El recuento debe ser un número mayor o igual a cero." };
    nuevo = n;
  } else {
    const d = Number(input.delta);
    if (!Number.isFinite(d) || d === 0) {
      return { ok: false, detalle: "Falta cuánto entró o salió. Pregúntale la cantidad al usuario." };
    }
    nuevo = anterior + d;
    if (nuevo < 0) {
      return {
        ok: false,
        detalle: `No alcanza: de "${item.nombre}" sólo quedan ${anterior} ${item.unidad || ""} y se quieren sacar ${Math.abs(d)}. Dile al usuario y pregúntale si hay que hacer un recuento.`,
      };
    }
  }

  await ctx.sr.entities.InventarioItem.update(item.id, {
    stock_actual: nuevo,
    ultima_actualizacion: new Date().toISOString(),
  });

  await writeAudit(ctx.sr, {
    businessId: ctx.businessId,
    actorEmail: `whatsapp:${ctx.remitente.numero}`,
    actorRole: ctx.remitente.rol,
    action: "Inventario:edit_stock",
    entity: "InventarioItem",
    entityId: item.id,
    summary: `${ctx.remitente.nombre || ctx.remitente.numero} ajustó por WhatsApp "${item.nombre}" de ${anterior} a ${nuevo} ${item.unidad || ""}${input.motivo ? ` — ${input.motivo}` : ""}.`,
    changes: { stock_actual: { antes: anterior, despues: nuevo } },
    source: "whatsapp",
  });

  const bajo = Number(item.stock_minimo || 0) > 0 && nuevo <= Number(item.stock_minimo);
  return {
    ok: true,
    entity: "InventarioItem",
    entityId: item.id,
    detalle: `"${item.nombre}" quedó en ${nuevo} ${item.unidad || ""} (antes ${anterior}).${bajo ? ` Ojo: está en o por debajo del mínimo (${item.stock_minimo}).` : ""}`,
  };
};

const registrar_corte: ToolFn = async (ctx, input) => {
  const denied = await permitido(ctx, "Ingresos:create");
  if (denied) return { ok: false, detalle: denied };

  // Recording a deposit is the reconciliation step, which carries its own key.
  if (input.monto_depositado !== undefined && input.monto_depositado !== null) {
    const deniedConc = await permitido(ctx, "Ingresos:conciliar");
    if (deniedConc) {
      return {
        ok: false,
        detalle: `${deniedConc} Puedes registrar el corte sin el depósito si el usuario quiere.`,
      };
    }
  }

  const validated = validateIngreso(input);
  if (!validated.ok) return { ok: false, detalle: `No se pudo registrar: ${validated.message}` };

  const dupes = await ctx.sr.entities.IngresoPlataforma.filter({
    business_id: ctx.businessId,
    plataforma: validated.fields.plataforma,
    semana: validated.fields.semana,
  }, null, 1);
  if (dupes?.length) {
    return {
      ok: false,
      detalle: `Ya hay un corte de ${validated.fields.plataforma} para la semana ${validated.fields.semana}. Dile al usuario que lo edite desde la app en vez de crear otro.`,
    };
  }

  const ingreso = await ctx.sr.entities.IngresoPlataforma.create({
    ...validated.fields,
    ...derivarConciliacion(null, validated.fields),
    business_id: ctx.businessId,
    origen: "whatsapp",
  });

  await writeAudit(ctx.sr, {
    businessId: ctx.businessId,
    actorEmail: `whatsapp:${ctx.remitente.numero}`,
    actorRole: ctx.remitente.rol,
    action: "Ingresos:create",
    entity: "IngresoPlataforma",
    entityId: ingreso.id,
    summary: `${ctx.remitente.nombre || ctx.remitente.numero} registró por WhatsApp el corte de ${validated.fields.plataforma} de la semana ${validated.fields.semana} por ${money(validated.fields.monto_corte)}.`,
    source: "whatsapp",
  });

  const dif = Number(ingreso.diferencia ?? 0);
  return {
    ok: true,
    entity: "IngresoPlataforma",
    entityId: ingreso.id,
    detalle:
      `Corte registrado: ${validated.fields.plataforma}, semana ${validated.fields.semana}, ${money(validated.fields.monto_corte)}.` +
      (ingreso.monto_depositado === null || ingreso.monto_depositado === undefined
        ? " Todavía sin depósito registrado."
        : dif === 0
          ? " El depósito coincide con el corte."
          : ` Depositaron ${money(ingreso.monto_depositado)}: ${dif < 0 ? `faltan ${money(Math.abs(dif))}` : `hay ${money(dif)} de más`}.`),
  };
};

const consultar_alertas: ToolFn = async (ctx) => {
  const denied = await permitido(ctx, "Alertas:view");
  if (denied) return { ok: false, detalle: denied };

  const rows = await ctx.sr.entities.Alerta.filter(
    { business_id: ctx.businessId, leida: false }, "-fecha", 50,
  );
  if (!rows?.length) return { ok: true, detalle: "No hay alertas abiertas ahora mismo." };

  const orden = { rojo: 0, amarillo: 1, verde: 2 } as Record<string, number>;
  const ordenadas = [...rows].sort((a: any, b: any) => (orden[a.severidad] ?? 3) - (orden[b.severidad] ?? 3));
  return {
    ok: true,
    detalle: ordenadas.slice(0, 12).map((a: any) => `[${a.severidad}] ${a.titulo}: ${a.mensaje}`).join(" | "),
  };
};

const resumen_negocio: ToolFn = async (ctx) => {
  const denied = await permitido(ctx, "Dashboard:view");
  if (denied) return { ok: false, detalle: denied };

  // The money roll-up is a separate, more sensitive key. A cook asking "¿cómo
  // va el mes?" gets the operational half; the owner gets everything.
  const verFinanzas = !(await permitido(ctx, "Dashboard:financials"));

  const now = new Date();
  const inicioMes = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const hoy = hoyISO();

  const [gastos, ingresos, inventario] = await Promise.all([
    ctx.sr.entities.Gasto.filter({ business_id: ctx.businessId }, "-fecha", 2000),
    ctx.sr.entities.IngresoPlataforma.filter({ business_id: ctx.businessId }, "-created_date", 200),
    ctx.sr.entities.InventarioItem.filter({ business_id: ctx.businessId }, "nombre", 1000),
  ]);

  const delMes = (gastos || []).filter((g: any) => g.fecha >= inicioMes && g.fecha <= hoy);
  const bajos = (inventario || []).filter(
    (i: any) => Number(i.stock_minimo || 0) > 0 && Number(i.stock_actual || 0) <= Number(i.stock_minimo),
  );

  const partes: string[] = [];
  partes.push(`Del ${inicioMes} al ${hoy}: ${delMes.length} gastos registrados.`);

  if (verFinanzas) {
    const total = delMes.reduce((s: number, g: any) => s + Number(g.monto || 0), 0);
    const porCategoria: Record<string, number> = {};
    for (const g of delMes) porCategoria[g.categoria || "Otros"] = (porCategoria[g.categoria || "Otros"] || 0) + Number(g.monto || 0);
    partes.push(`Total gastado: ${money(total)}.`);
    partes.push(`Por categoría: ${Object.entries(porCategoria).map(([c, m]) => `${c} ${money(m)}`).join(", ")}.`);

    const sinDeposito = (ingresos || []).filter((i: any) => i.monto_depositado === null || i.monto_depositado === undefined);
    const cortos = (ingresos || []).filter((i: any) => Number(i.diferencia ?? 0) < -1);
    if (sinDeposito.length) partes.push(`${sinDeposito.length} cortes sin depósito registrado.`);
    if (cortos.length) {
      const faltante = cortos.reduce((s: number, i: any) => s + Math.abs(Number(i.diferencia || 0)), 0);
      partes.push(`${cortos.length} cortes con depósito menor al reportado (faltan ${money(faltante)} en total).`);
    }
  } else {
    partes.push("(Este usuario no tiene permiso para ver cifras financieras, así que no le des totales ni montos agregados.)");
  }

  partes.push(bajos.length ? `Insumos en o bajo el mínimo: ${bajos.map((i: any) => i.nombre).slice(0, 10).join(", ")}.` : "Ningún insumo bajo el mínimo.");

  return { ok: true, detalle: partes.join(" ") };
};

export const TOOL_IMPLEMENTATIONS: Record<string, ToolFn> = {
  registrar_gasto,
  consultar_gastos,
  consultar_inventario,
  ajustar_inventario,
  registrar_corte,
  consultar_alertas,
  resumen_negocio,
};

export async function ejecutarTool(
  ctx: ToolContext,
  nombre: string,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const fn = TOOL_IMPLEMENTATIONS[nombre];
  if (!fn) return { ok: false, detalle: `Herramienta desconocida: ${nombre}` };
  try {
    return await fn(ctx, input as Record<string, any>);
  } catch (e) {
    // The model needs to know the action failed so it can tell the user, rather
    // than reporting success for a write that never landed.
    return { ok: false, detalle: `La herramienta ${nombre} falló: ${(e as Error).message}` };
  }
}
