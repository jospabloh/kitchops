import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";

// Mark one alert, several, or every open alert as read.
//
// Each id is re-checked against the caller's own business_id rather than
// trusting the list that came in the body — otherwise "mark these as read"
// would be an unauthenticated write primitive against any alert id someone
// could guess.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { ids, all } = body;

    const g = await guard(base44, body, "Alertas:mark_read");
    if (!g.ok) return g.response;

    let objetivo: Array<{ id: string }> = [];

    if (all === true) {
      objetivo = await g.sr.entities.Alerta.filter(
        { business_id: g.businessId, leida: false }, "-created_date", 500,
      ) || [];
    } else {
      const list = Array.isArray(ids) ? ids : [];
      if (list.length === 0) {
        return Response.json({ message: "Indica qué alertas marcar (ids) o usa all: true." }, { status: 400 });
      }
      for (const id of list.slice(0, 200)) {
        const row = await g.sr.entities.Alerta.get(id).catch(() => null);
        if (row && row.business_id === g.businessId) objetivo.push(row);
      }
    }

    let marcadas = 0;
    for (const alerta of objetivo) {
      try {
        await g.sr.entities.Alerta.update(alerta.id, { leida: true });
        marcadas++;
      } catch { /* una alerta borrada en paralelo no debe tumbar el lote */ }
    }

    return Response.json({ success: true, marcadas });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
