import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { evaluarAlertas, persistirAlertas, DEFAULT_THRESHOLDS } from "./handlers/_alertEngine.ts";
import { verifyBearer } from "./_acaciaSign.ts";

// Nightly sweep: run the alert rules for EVERY restaurant.
//
// This replaces the original version of this function, which listed every
// Gasto/Ingreso/InventarioItem in the app and compared them to each other. That
// was correct while KitchOps held exactly one restaurant and became a
// cross-tenant data leak the moment it held two — one kitchen's supplier spend
// would have been compared against another's, and the resulting alert text
// (naming suppliers and amounts) written into whichever tenant it landed in.
// Now every tenant is evaluated in isolation, with its own thresholds.
//
// NOT a licence-lifecycle cron. It never reads or writes billing_status; that
// belongs to Mission Control's unified cron (Module 1) and must not be
// duplicated here. Skipping suspended tenants below is a cost decision, not a
// state transition.
//
// Auth: same HMAC secret the scheduler and Mission Control already share. An
// unauthenticated version would let anyone on the internet trigger a full scan
// of every tenant's books on demand.
Deno.serve(async (req) => {
  const startedAt = Date.now();
  // Compared against THIS app's derived bearer, not the bare shared secret —
  // see _acaciaSign.ts and Module 15 of jospabloh/acacia-app-standard. The old
  // `!==` was also a non-constant-time compare of a secret. While
  // ACCEPT_LEGACY_MASTER is true the bare master is still accepted, so Mission
  // Control's probe keeps working until it sends the derived value.
  const expectedSecret = Deno.env.get("INGEST_HMAC_SECRET") ?? "";
  const slug = Deno.env.get("ACACIA_APP_SLUG") ?? "";
  const providedSecret = req.headers.get("x-health-secret") || req.headers.get("x-cron-secret");
  if (!(await verifyBearer(expectedSecret, slug, providedSecret))) {
    return Response.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const businesses = await sr.entities.Business.list("-created_date", 1000);
    const resultados: Array<Record<string, unknown>> = [];

    for (const business of businesses || []) {
      // A suspended tenant is not using the app; computing and storing alerts
      // nobody will read is pure cost. They are picked up again the moment
      // Mission Control reactivates them.
      if (business.billing_status === "suspended") {
        resultados.push({ business_id: business.id, skipped: "suspended" });
        continue;
      }

      try {
        const settingsRows = await sr.entities.AppSettings.filter({ business_id: business.id }, null, 1);
        const settings = settingsRows?.[0] || {};
        const thresholds = {
          gasto_alto_umbral_pct: Number(settings.gasto_alto_umbral_pct ?? DEFAULT_THRESHOLDS.gasto_alto_umbral_pct),
          gasto_alto_critico_pct: Number(settings.gasto_alto_critico_pct ?? DEFAULT_THRESHOLDS.gasto_alto_critico_pct),
          deposito_diferencia_critica: Number(
            settings.deposito_diferencia_critica ?? DEFAULT_THRESHOLDS.deposito_diferencia_critica,
          ),
        };

        const nuevas = await evaluarAlertas(sr, business.id, thresholds, settings.moneda_simbolo || "$");
        const persisted = await persistirAlertas(sr, business.id, nuevas);
        resultados.push({ business_id: business.id, ...persisted });
      } catch (e) {
        // One tenant's bad data must not stop the sweep for everyone else.
        resultados.push({ business_id: business.id, error: (e as Error).message });
      }
    }

    return Response.json({
      success: true,
      negocios: resultados.length,
      alertas_creadas: resultados.reduce((s, r) => s + (Number(r.creadas) || 0), 0),
      duration_ms: Date.now() - startedAt,
      resultados,
    });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 500 });
  }
});
