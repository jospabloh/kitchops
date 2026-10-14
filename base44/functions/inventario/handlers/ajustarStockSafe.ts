import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";

// Stock adjustment as a DELTA, not an absolute value.
//
// A delta says what happened ("saqué 3 kilos de carne"), which is the shape the
// WhatsApp agent speaks in, so both callers go through one path, and it never
// asks the caller to know the current count.
//
// It does NOT make two simultaneous adjustments safe. The server still reads
// stock_actual, adds the delta and writes the absolute result, and the SDK has
// no atomic increment or conditional update: "-3" and "-2" arriving at the
// same instant can both read 10 and land on 7 or 8 instead of 5. Rare in
// practice (the window is one round-trip), and a recount with `set` fixes it.
//
// `set` is still available for a real recount, where overwriting IS the intent —
// but it has to be asked for explicitly rather than being the default.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { id, delta, set, motivo } = body;
    if (!id) return Response.json({ message: "id es obligatorio." }, { status: 400 });

    const g = await guard(base44, body, "Inventario:edit_stock");
    if (!g.ok) return g.response;

    const existing = await g.sr.entities.InventarioItem.get(id).catch(() => null);
    if (!existing || existing.business_id !== g.businessId) {
      return Response.json({ message: "Insumo no encontrado." }, { status: 404 });
    }

    const anterior = Number(existing.stock_actual ?? 0);
    let nuevo: number;

    if (set !== undefined && set !== null && set !== "") {
      const n = Number(set);
      if (!Number.isFinite(n) || n < 0) {
        return Response.json(
          { message: "Las existencias deben ser un número mayor o igual a cero." },
          { status: 400 },
        );
      }
      nuevo = n;
    } else {
      const d = Number(delta);
      if (!Number.isFinite(d) || d === 0) {
        return Response.json(
          { message: "Indica cuánto entró o salió (delta distinto de cero), o usa 'set' para un recuento." },
          { status: 400 },
        );
      }
      nuevo = anterior + d;
      if (nuevo < 0) {
        // Refusing rather than clamping to 0: a negative result means the count
        // on record was already wrong, and silently flooring it hides that.
        return Response.json(
          {
            message: `No puedes sacar ${Math.abs(d)} ${existing.unidad || "unidades"} de "${existing.nombre}": sólo quedan ${anterior}. Si el conteo está mal, haz un recuento.`,
            stock_actual: anterior,
          },
          { status: 409 },
        );
      }
    }

    const updated = await g.sr.entities.InventarioItem.update(id, {
      stock_actual: nuevo,
      ultima_actualizacion: new Date().toISOString(),
    });

    const unidad = existing.unidad || "";
    await writeAudit(g.sr, {
      businessId: g.businessId,
      actorEmail: g.user.email,
      actorRole: g.user.role,
      action: "Inventario:edit_stock",
      entity: "InventarioItem",
      entityId: id,
      summary: `Ajustó "${existing.nombre}" de ${anterior} a ${nuevo} ${unidad}${motivo ? ` — ${String(motivo).trim()}` : ""}.`,
      changes: { stock_actual: { antes: anterior, despues: nuevo } },
    });

    return Response.json({
      item: updated,
      anterior,
      nuevo,
      // Handy for the caller (and for the bot's reply) to say "ya estás por
      // debajo del mínimo" without a second round-trip.
      // A minimum of 0 means "sin alertas" (the form says so), same as the
      // alert engine and the client's bajo().
      bajo_minimo: Number(existing.stock_minimo ?? 0) > 0 && nuevo <= Number(existing.stock_minimo),
    });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
