import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { guard } from "./_guard.ts";
import { evaluarAlertas, persistirAlertas, DEFAULT_THRESHOLDS } from "./_alertEngine.ts";

// "Recalcular alertas" from the Alertas page — same engine the nightly sweep
// runs, scoped to the caller's own restaurant.
//
// Note this is gated on Alertas:generate, NOT on a write key that billing
// blocks. Recomputing alerts is how a view_only tenant finds out what is going
// wrong while their licence is lapsed; the guard's billing gate still applies
// through isWriteKey(), and "generate" is classified as a write there — which
// is the conservative call: it does create Alerta rows. A suspended tenant sees
// the alerts already on file, which is the read they actually need.
export async function handle(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const g = await guard(base44, body, "Alertas:generate");
    if (!g.ok) return g.response;

    const settingsRows = await g.sr.entities.AppSettings.filter(
      { business_id: g.businessId }, null, 1,
    );
    const settings = settingsRows?.[0] || {};
    const thresholds = {
      gasto_alto_umbral_pct: Number(settings.gasto_alto_umbral_pct ?? DEFAULT_THRESHOLDS.gasto_alto_umbral_pct),
      gasto_alto_critico_pct: Number(settings.gasto_alto_critico_pct ?? DEFAULT_THRESHOLDS.gasto_alto_critico_pct),
      deposito_diferencia_critica: Number(
        settings.deposito_diferencia_critica ?? DEFAULT_THRESHOLDS.deposito_diferencia_critica,
      ),
    };

    const nuevas = await evaluarAlertas(g.sr, g.businessId, thresholds, settings.moneda_simbolo || "$");
    const result = await persistirAlertas(g.sr, g.businessId, nuevas);

    return Response.json({
      success: true,
      alertas_creadas: result.creadas,
      alertas_evaluadas: result.evaluadas,
      duplicadas_filtradas: result.duplicadas,
    });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
}
