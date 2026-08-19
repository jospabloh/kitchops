import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { writeAudit } from "./_audit.ts";

// Stock adjustment as a DELTA, not an absolute value.
//
// This is the difference that matters in a kitchen: two people counting the
// walk-in at the same time both send "quedan 8 kg" and the second write silently
// erases the first. Sending "-3" and "-2" from the same starting point still
// lands at the right number. It is also the shape the WhatsApp agent speaks in
// ("saqué 3 kilos de carne"), so both callers go through one path.
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
      bajo_minimo: nuevo <= Number(existing.stock_minimo ?? 0),
    });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
