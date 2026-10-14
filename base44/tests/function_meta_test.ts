// Pins the Module 26 checker (scripts/lib/function-meta.mjs, the module behind
// `npm run validate:function-meta`): the shape of a function.meta.json, the
// action list against the code, and declared callers against real call sites
// in both directions — then runs it over the repo's own metas, so a stale meta
// fails here as well as in lint.
//
//   deno test --allow-env --allow-read base44/tests/

import { assert, assertEquals } from "./_assert.ts";
import {
  collectWarnings,
  compareCallers,
  DEFAULT_ACTION,
  findCallSites,
  parseDispatchValues,
  parseRouterActions,
  renderRegistry,
  validateMeta,
} from "../../scripts/lib/function-meta.mjs";

const CTX = {
  dir: "gastos",
  dispatch: ["createGastoSafe", "deleteGastoSafe"],
  entities: new Set(["Gasto", "AuditLog", "Business"]),
  functions: new Set(["gastos", "alertas"]),
  workflows: new Set(["barrido-nocturno"]),
  files: new Set(["base44/tests/permissions_test.ts"]),
  today: "2026-10-14",
};

function meta(over: Record<string, unknown> = {}) {
  return {
    name: "gastos",
    purpose: "Router de gastos.",
    status: "active",
    created: "2026-08-19",
    triggers: ["frontend"],
    auth: "user",
    tenant_scoped: true,
    entities: { reads: ["Gasto"], writes: ["Gasto", "AuditLog"] },
    tests: ["base44/tests/permissions_test.ts"],
    actions: {
      createGastoSafe: { purpose: "Alta.", callers: ["src/pages/Gastos.jsx"] },
      deleteGastoSafe: { purpose: "Baja.", callers: ["src/pages/Gastos.jsx"] },
    },
    remove_when: null,
    ...over,
  };
}

Deno.test("un meta completo y coherente no tiene errores", () => {
  assertEquals(validateMeta(meta(), CTX), []);
});

Deno.test("faltan campos o sobran: los dos fallan", () => {
  const m = meta({ extra: 1 }) as Record<string, unknown>;
  delete m.auth;
  const errs = validateMeta(m, CTX);
  assert(errs.some((e) => e.includes('falta el campo "auth"')));
  assert(errs.some((e) => e.includes('campo desconocido "extra"')));
});

Deno.test("una acción del router sin declarar, o una declarada que el código no tiene, falla", () => {
  const errs = validateMeta(
    meta({ actions: { createGastoSafe: { purpose: "x", callers: [] }, fantasma: { purpose: "x", callers: [] } } }),
    CTX,
  );
  assert(errs.some((e) => e.includes('"deleteGastoSafe" existe en el código')));
  assert(errs.some((e) => e.includes('declara "fantasma"')));
});

Deno.test("una función sin despacho declara sólo la acción default", () => {
  const ctx = { ...CTX, dir: "health", dispatch: [] };
  const ok = meta({ name: "health", actions: { [DEFAULT_ACTION]: { purpose: "x", callers: [] } } });
  assertEquals(validateMeta(ok, ctx), []);
  const mal = meta({ name: "health", actions: { ping: { purpose: "x", callers: [] } } });
  assert(validateMeta(mal, ctx).some((e) => e.includes(`"${DEFAULT_ACTION}" existe en el código`)));
});

Deno.test("un cron: sin workflow falla; con workflow pasa", () => {
  const sin = validateMeta(meta({ triggers: ["frontend", "cron:fantasma"] }), CTX);
  assert(sin.some((e) => e.includes('no existe el workflow "fantasma"')));
  assertEquals(validateMeta(meta({ triggers: ["frontend", "cron:barrido-nocturno"] }), CTX), []);
});

Deno.test("triggers con forma inválida o que apuntan a algo inexistente fallan", () => {
  const errs = validateMeta(meta({ triggers: ["navegador", "entity:Nada", "backend:nada"] }), CTX);
  assert(errs.some((e) => e.includes('trigger inválido "navegador"')));
  assert(errs.some((e) => e.includes('no existe la entidad "Nada"')));
  assert(errs.some((e) => e.includes('no existe la función "nada"')));
});

Deno.test("one-off y deprecated exigen remove_when, y una fecha vencida falla", () => {
  assert(validateMeta(meta({ status: "one-off" }), CTX).some((e) => e.includes('exige "remove_when"')));
  assert(validateMeta(meta({ status: "deprecated" }), CTX).some((e) => e.includes('exige "remove_when"')));
  assert(validateMeta(meta({ status: "one-off", remove_when: "2026-10-01" }), CTX).some((e) => e.includes("ya pasó")));
  assertEquals(validateMeta(meta({ status: "one-off", remove_when: "2026-12-31" }), CTX), []);
  assertEquals(validateMeta(meta({ status: "deprecated", remove_when: "cuando migre el último negocio" }), CTX), []);
});

Deno.test("entidades y pruebas declaradas tienen que existir", () => {
  const errs = validateMeta(meta({ entities: { reads: ["Nada"], writes: [] }, tests: ["base44/tests/no.ts"] }), CTX);
  assert(errs.some((e) => e.includes('no existe la entidad "Nada"')));
  assert(errs.some((e) => e.includes('no existe "base44/tests/no.ts"')));
});

Deno.test("parseRouterActions lee las llaves de HANDLERS", () => {
  const src = `import { handle as a } from "./a.ts";
const HANDLERS: Record<string, Handler> = {
  createGastoSafe,
  updateGastoSafe,
  deleteGastoSafe: a,
};`;
  assertEquals(parseRouterActions(src), ["createGastoSafe", "updateGastoSafe", "deleteGastoSafe"]);
});

Deno.test("parseDispatchValues sólo cuenta action/mode leídos del cuerpo", () => {
  const cuerpo = `const { mode, x } = await req.json();
if (mode === "create") {} if (mode === "join") {}`;
  assertEquals(parseDispatchValues(cuerpo), ["create", "join"]);
  const sw = `const { action, params = {}, ts } = body ?? {};
switch (action) { case 'ping': break; case "licenses.list": break; }`;
  assertEquals(parseDispatchValues(sw), ["licenses.list", "ping"]);
  // whatsapp: hub.mode de la query de Meta no es un despacho.
  const query = `const mode = url.searchParams.get("hub.mode"); if (mode === "subscribe") {}`;
  assertEquals(parseDispatchValues(query), []);
});

Deno.test("findCallSites: literal, ternario, variable y llamada sin acción", () => {
  const files = [
    { path: "src/pages/A.jsx", text: `base44.functions.invoke("gastos", { action: "createGastoSafe", ...p });` },
    {
      path: "src/pages/B.jsx",
      text: `await base44.functions.invoke("manage-member", {
        action: ok ? "approve_request" : "reject_request", memberId: s.id,
      });`,
    },
    {
      path: "src/pages/C.jsx",
      text: `setModo("create"); base44.functions.invoke("complete-onboarding", { mode: modo, n: f(x) });`,
    },
    { path: "src/pages/D.jsx", text: `base44.functions.invoke("delete-account", { businessId: b.id });` },
  ];
  const sites = findCallSites(files, { "complete-onboarding": ["create", "join"] });
  const key = (s: { fn: string; action: string; path: string }) => `${s.fn}.${s.action}@${s.path}`;
  assertEquals(sites.map(key).sort(), [
    "complete-onboarding.create@src/pages/C.jsx",
    `delete-account.${DEFAULT_ACTION}@src/pages/D.jsx`,
    "gastos.createGastoSafe@src/pages/A.jsx",
    "manage-member.approve_request@src/pages/B.jsx",
    "manage-member.reject_request@src/pages/B.jsx",
  ]);
});

Deno.test("compareCallers falla en las dos direcciones y exige el trigger frontend", () => {
  const m = meta();
  const sites = [
    { fn: "gastos", action: "createGastoSafe", path: "src/pages/Gastos.jsx" },
    { fn: "gastos", action: "createGastoSafe", path: "src/pages/Otra.jsx" },
  ];
  const errs = compareCallers([m], sites);
  assert(errs.some((e) => e.includes("src/pages/Otra.jsx la llama y no está en callers")));
  assert(errs.some((e) => e.includes("deleteGastoSafe: declara a src/pages/Gastos.jsx como caller y ya no la llama")));

  const sinFrontend = compareCallers([meta({ triggers: [] })], [sites[0]]);
  assert(sinFrontend.some((e) => e.includes('no incluye "frontend"')));

  const desconocida = compareCallers([m], [{ fn: "gastos", action: "nope", path: "src/x.jsx" }]);
  assert(desconocida.some((e) => e.includes('la acción "nope", que no está declarada')));
});

Deno.test("los callers external: no se buscan en el repo", () => {
  const m = meta({
    triggers: ["external:mission-control"],
    actions: {
      createGastoSafe: { purpose: "x", callers: ["external:mission-control:api/x.js"] },
      deleteGastoSafe: { purpose: "x", callers: ["external:mission-control"] },
    },
  });
  assertEquals(compareCallers([m], []), []);
});

Deno.test("sin trigger y sin callers se avisa, no se falla", () => {
  const m = meta({ triggers: [], actions: { [DEFAULT_ACTION]: { purpose: "x", callers: [] } } });
  const w = collectWarnings([m]);
  assertEquals(w.length, 2);
});

Deno.test("el registro es determinista y nombra cada acción", () => {
  const a = renderRegistry([meta()], "KitchOps");
  assertEquals(a, renderRegistry([meta()], "KitchOps"));
  assert(a.includes("## gastos"));
  assert(a.includes("`deleteGastoSafe`"));
});

// ── The repo's own metas ────────────────────────────────────────────────────

const ROOT = new URL("../../", import.meta.url);
const FUNCTIONS = new URL("base44/functions/", ROOT);

async function exists(url: URL) {
  try {
    await Deno.stat(url);
    return true;
  } catch {
    return false;
  }
}

Deno.test("cada función del repo tiene un function.meta.json válido y el registro está al día", async () => {
  const entities = new Set<string>();
  for await (const e of Deno.readDir(new URL("base44/entities/", ROOT))) {
    if (e.isFile) entities.add(e.name.replace(/\.jsonc?$/, ""));
  }
  const dirs: string[] = [];
  for await (const e of Deno.readDir(FUNCTIONS)) {
    if (e.isDirectory && (await exists(new URL(`${e.name}/entry.ts`, FUNCTIONS)))) dirs.push(e.name);
  }
  dirs.sort();
  assert(dirs.length > 0, "no se encontró ninguna función");
  const workflows = new Set<string>();
  const wfDir = new URL("base44/workflows/", ROOT);
  if (await exists(wfDir)) {
    for await (const e of Deno.readDir(wfDir)) workflows.add(e.name.replace(/\.[^.]+$/, ""));
  }

  const metas = [];
  const errors: string[] = [];
  for (const dir of dirs) {
    const meta = JSON.parse(await Deno.readTextFile(new URL(`${dir}/function.meta.json`, FUNCTIONS)));
    const index = new URL(`${dir}/handlers/index.ts`, FUNCTIONS);
    const dispatch = (await exists(index))
      ? parseRouterActions(await Deno.readTextFile(index))
      : parseDispatchValues(await Deno.readTextFile(new URL(`${dir}/entry.ts`, FUNCTIONS)));
    const tests = new Set<string>();
    for (const t of meta.tests ?? []) if (await exists(new URL(t, ROOT))) tests.add(t);
    errors.push(
      ...validateMeta(meta, {
        dir,
        dispatch,
        entities,
        functions: new Set(dirs),
        workflows,
        files: tests,
        today: "2000-01-01", // dates are the Node validator's job; this pins shape and actions
      }),
    );
    metas.push(meta);
  }
  assertEquals(errors, []);

  const registry = await Deno.readTextFile(new URL("docs/FUNCTIONS_REGISTRY.md", ROOT));
  const app = JSON.parse(await Deno.readTextFile(new URL("base44.app.json", ROOT)));
  assertEquals(registry, renderRegistry(metas, app.name ?? ""));
});
