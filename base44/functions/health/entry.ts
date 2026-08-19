import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

// Module 5: a cheap health/latency probe for a human or an external uptime
// monitor to hit directly. It is NOT what Mission Control's own polling uses —
// that's acaciaControl's HMAC-signed `ping` action; see that function's header.
//
// It measures a real round-trip to the entity store rather than returning an
// unconditional 200, because an app whose frontend is up and whose database is
// unreachable is down, and a hardcoded 200 reports it as healthy.
//
// Gated on the same INGEST_HMAC_SECRET shared with Mission Control, checked as a
// simple bearer value in the `x-health-secret` header (there is no request body
// here to sign, unlike acaciaControl's full HMAC). An unauthenticated version
// would let anyone on the internet trigger a real service-role query on demand.
Deno.serve(async (req) => {
  const startedAt = Date.now();

  const expectedSecret = Deno.env.get("INGEST_HMAC_SECRET");
  const providedSecret = req.headers.get("x-health-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return Response.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const base44 = createClientFromRequest(req);
    await base44.asServiceRole.entities.Business.list(null, 1);
    return Response.json({
      status: "ok",
      app: "kitchops",
      latency_ms: Date.now() - startedAt,
      checked_at: new Date().toISOString(),
    });
  } catch {
    // Deliberately no error.message in the response — that's an internal detail,
    // not something an external caller (even an authorized one) needs. Base44's
    // own logs still capture the real error.
    return Response.json(
      {
        status: "error",
        app: "kitchops",
        latency_ms: Date.now() - startedAt,
        checked_at: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
});
