import { getHandler } from "./handlers/index.ts";

// Action-routed function group. Base44 deploys one function per directory, so
// grouping related write paths behind a single `action` field keeps the
// function count (and the per-function cold start) down without merging their
// permission checks — each handler still runs its own guard().
Deno.serve(async (req) => {
  let action = "";
  try {
    const peek = await req.clone().json();
    if (peek && typeof peek.action === "string") action = peek.action;
  } catch { /* no/invalid body */ }
  const handler = getHandler(action);
  if (!handler) {
    return Response.json({ message: `permisos: acción desconocida '${action}'` }, { status: 400 });
  }
  return await handler(req);
});
