// The agent's reasoning turn: build the system prompt, replay the recent
// conversation, call Claude with the tool set, run whatever tools it asks for,
// and loop until it produces a reply for the customer.
//
// Model choice. AgentKit's stack table lets the business owner pick, and points
// at Opus for agents that "reason over catalogues, schedules or complex rules" —
// which is what this one does: it writes to a restaurant's books, resolves
// permissions per sender, and reads photos of tickets. So the default here is
// claude-opus-5, overridable per tenant on WhatsAppConfig.modelo. Do NOT lower
// it on someone's behalf to save money; that is the owner's call, and a cheaper
// model that mis-reads a ticket costs more than the tokens it saved.

import Anthropic from "npm:@anthropic-ai/sdk@0.72.0";
import { TOOL_DEFINITIONS, ejecutarTool, type ToolContext } from "./_tools.ts";

export const DEFAULT_MODEL = "claude-opus-5";

// Short on purpose: this is a WhatsApp reply, not an essay. The skill's guidance
// is to keep max_tokens high unless there's a hard reason — "deliberately short
// outputs" is that reason, and a bot that answers a stock question with six
// paragraphs is a bot people stop using.
const MAX_TOKENS = 2048;

// Ten turns is enough for "registra este gasto" → tool → "¿de qué proveedor?" →
// answer → tool → confirm, with room to spare. An agent still looping after ten
// is stuck, and each extra turn costs money and keeps the customer waiting.
const MAX_TURNS = 10;

// Enough for "y el de ayer?" to resolve, without replaying a week of chatter
// into every request.
export const HISTORY_LIMIT = 12;

export interface BrainInput {
  ctx: ToolContext;
  config: Record<string, any>;
  /** Oldest first. */
  historial: Array<{ direccion: string; texto?: string }>;
  mensaje: string;
  imagen?: { base64: string; mime: string } | null;
}

export interface BrainResult {
  respuesta: string;
  acciones: Array<{ tool: string; ok: boolean; entity?: string; entity_id?: string; detalle: string }>;
}

const TONOS: Record<string, string> = {
  profesional: "Formal y preciso, sin adornos. Trata de usted.",
  amigable: "Cercano y cálido, tuteando, como un compañero de trabajo que conoce la cocina.",
  directo: "Al grano, telegráfico. Nada de rodeos ni de cortesías largas.",
};

export function construirSystemPrompt(
  config: Record<string, any>,
  business: Record<string, any>,
  remitente: { numero: string; nombre: string; rol: string },
): string {
  const nombreAgente = config.agente_nombre || "Kitch";
  const tono = TONOS[config.agente_tono as string] || TONOS.amigable;
  const hoy = new Date().toISOString().slice(0, 10);
  const rolLegible = remitente.rol === "business_admin" ? "dueño/gerente" : "personal de cocina";

  return [
    `Eres ${nombreAgente}, el asistente de operaciones de "${business.name}" por WhatsApp.`,
    `Ayudas a llevar el control del restaurante: gastos, inventario, cortes de plataformas de delivery y alertas.`,
    "",
    `Hoy es ${hoy}. La moneda es ${business.currency || "MXN"}.`,
    `Estás hablando con ${remitente.nombre || remitente.numero}, que es ${rolLegible} de este negocio.`,
    "",
    "CÓMO HABLAS",
    `- ${tono}`,
    "- Siempre en español de México, como se habla en una cocina.",
    "- Respuestas cortas: esto es WhatsApp. Dos o tres líneas casi siempre bastan.",
    "- Nada de markdown, ni tablas, ni encabezados. Texto plano. Como mucho, guiones para listar.",
    "",
    "CÓMO TRABAJAS",
    "- Cuando el usuario te pida registrar algo, hazlo con la herramienta correspondiente y confirma con los datos concretos que quedaron guardados.",
    "- Si te falta un dato esencial (el monto, el proveedor, de qué insumo hablan), PREGUNTA. No inventes ni asumas: esto son las cuentas reales del negocio.",
    "- Si una herramienta falla o te dice que falta un permiso, explícalo en una línea, sin tecnicismos, y di qué puede hacer el usuario.",
    "- Nunca digas que registraste algo si la herramienta no lo confirmó.",
    "- Si te mandan la foto de un ticket, lee el total, el comercio y la fecha, y regístralo. Si algo no se alcanza a leer, pregunta en vez de adivinar.",
    "",
    "LÍMITES",
    "- Sólo hablas de la operación de este restaurante. Si te preguntan otra cosa, dilo amablemente y ofrece ayuda con lo que sí sabes.",
    "- No das consejos fiscales ni legales.",
    "- No puedes borrar nada ni cambiar permisos desde aquí; eso se hace en la app.",
    config.instrucciones_extra ? `\nCONTEXTO DEL NEGOCIO\n${config.instrucciones_extra}` : "",
  ].filter(Boolean).join("\n");
}

export async function pensarYResponder(input: BrainInput): Promise<BrainResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no está configurada en los secretos de la app.");

  const client = new Anthropic({ apiKey });
  const { ctx, config, historial, mensaje, imagen } = input;

  const system = construirSystemPrompt(config, ctx.business, ctx.remitente);

  // Replay recent history as plain alternating turns. Tool calls from previous
  // turns are deliberately NOT replayed: the results are already reflected in
  // the data the tools read, and re-sending them invites the model to "confirm"
  // an action a second time.
  const messages: Anthropic.MessageParam[] = [];
  for (const m of historial) {
    const texto = (m.texto || "").trim();
    if (!texto) continue;
    messages.push({ role: m.direccion === "entrante" ? "user" : "assistant", content: texto });
  }

  const contenidoActual: Anthropic.ContentBlockParam[] = [];
  if (imagen) {
    contenidoActual.push({
      type: "image",
      source: {
        type: "base64",
        media_type: imagen.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: imagen.base64,
      },
    });
  }
  contenidoActual.push({
    type: "text",
    text: mensaje || (imagen ? "(El usuario mandó esta foto sin texto.)" : "(mensaje vacío)"),
  });
  messages.push({ role: "user", content: contenidoActual });

  const acciones: BrainResult["acciones"] = [];
  let respuesta = "";

  for (let turno = 0; turno < MAX_TURNS; turno++) {
    const response = await client.messages.create({
      model: config.modelo || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      // Adaptive thinking with medium effort: the reasoning here is "which tool,
      // with what arguments" rather than deep analysis, and the customer is
      // watching a WhatsApp thread waiting for a reply.
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
      messages,
    });

    // A safety decline still has to become a sentence in the thread — silence
    // reads as a broken bot.
    if (response.stop_reason === "refusal") {
      return {
        respuesta: "Perdón, no puedo ayudarte con eso por aquí. ¿Te ayudo con algo de gastos, inventario o cortes?",
        acciones,
      };
    }

    const textoDeEsteTurno = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (textoDeEsteTurno) respuesta = textoDeEsteTurno;

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });

    // All results go back in ONE user message — splitting them teaches the model
    // to stop making parallel calls.
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const outcome = await ejecutarTool(ctx, call.name, call.input as Record<string, unknown>);
      acciones.push({
        tool: call.name,
        ok: outcome.ok,
        entity: outcome.entity,
        entity_id: outcome.entityId,
        detalle: outcome.detalle,
      });
      resultados.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: outcome.detalle,
        is_error: !outcome.ok,
      });
    }
    messages.push({ role: "user", content: resultados });
  }

  if (!respuesta) {
    // Ran out of turns, or the model produced only tool calls and no prose. Say
    // something true rather than nothing.
    respuesta = acciones.some((a) => a.ok)
      ? "Listo, ya quedó registrado. ¿Te ayudo con algo más?"
      : "Perdón, no pude completar eso. ¿Me lo repites con un poco más de detalle?";
  }

  return { respuesta, acciones };
}
