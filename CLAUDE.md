# KitchOps — Project Notes

Back-office control for independent restaurants: gastos, cortes de plataformas
de delivery, inventario, alertas, and a WhatsApp agent that captures all of it
from a phone. Base44 backend + Vite/React frontend, part of the ACACIA
portfolio.

See `AGENTS.md` for the Base44 CLI workflow.

## Commands

```bash
npm run dev                       # frontend against the hosted Base44 backend
npm run lint                      # eslint + validate:rls  (this is the gate)
npm run validate:rls              # both halves of every RLS rule
npm run generate:function-shared  # regenerate per-function server helpers
npm run build                     # must pass
npm run release -- patch          # stamps APP_VERSION/RELEASE_DATE

deno lint
deno test --allow-env base44/tests/
```

## The three things that will bite you

**1. RLS fails silently, in both directions.** Every entity↔user comparison has
two halves. Entity side: custom fields live under `data.`, so a bare
`business_id` names nothing and the rule matches *every* row — RLS effectively
off. User side: custom user fields resolve as `{{user.data.business_id}}`, so a
bare `{{user.business_id}}` resolves to nothing and the rule matches *zero*
rows. Neither raises an error. StockFlow shipped both, three days apart, in
production. `npm run validate:rls` is the guard; it runs in CI and inside
`npm run lint`.

Every tenant-scoped entity also needs an explicit
`{"user_condition":{"role":"admin"}}` branch on **all four** ops. Backend Safe
functions read and write via `asServiceRole`, which evaluates as `role:admin`
with no end-user context — without that branch, reads return zero rows (so
read-then-write functions silently no-op) and writes are rejected outright.

**2. The repo `.jsonc` is not the deployed schema.** Base44 runs against
whatever was last deployed. Committing a field change does nothing at runtime,
and Base44 *silently drops* writes to a field that isn't in the live schema —
the record saves, the field just never persists. Verify against the live schema
(`list_entity_schemas`) and deploy (`update_entity_schema`) after touching any
entity file.

**3. `User` must not have an entity-level `rls` block.** It is managed by
Base44's auth system; adding one makes `asServiceRole.entities.User.update()`
*hang* rather than throw, so onboarding dies with an empty-bodied HTTP 500.
Field-level `rls.write` on `role`/`business_id` is the supported — and the
security-relevant — half, and it is what stops any user from calling
`auth.updateMe({role:"admin"})`. `validate-rls.mjs` enforces both facts.

## Architecture

- **Multi-tenant via `Membership`.** `User.business_id` names the ONE tenant the
  caller is in right now, and every entity's RLS compares against it. Membership
  only answers "which tenants may I switch to"; switching is a service-role
  write via `switch-tenant`, which re-derives membership server-side. Isolation
  does not weaken as a user joins more restaurants.
- **Roles** live in `src/lib/rbac.js`: `admin` (ACACIA platform tier — the tier
  every RLS admin branch is written against, never given to a tenant's staff),
  `business_admin` (dueño/gerente), `staff` (personal de cocina). Mirrored by
  `User.jsonc`'s enum; they must stay in sync.
- **Every write goes through a Safe function** under `base44/functions/*/`,
  which runs four checks in order: authenticated → right tenant → permission key
  → billing status. No entity is written directly from `src/`, with one
  documented exception (`AppSession`, see below).
- **Shared server code is generated, not hand-copied.** Base44/Deno isolates
  each function directory, so `_guard.ts` / `_permissions.ts` / `_audit.ts` /
  `_alertEngine.ts` / the field validators exist once per group. The canonical
  sources are in `scripts/lib/function-shared/`; `npm run
  generate:function-shared` fans them out and CI fails on drift. **Never edit a
  copy under `base44/functions/`** — edit the canonical source and regenerate.
- **`AppSession` is deliberately NOT behind a Safe function.** Its RLS scopes a
  user to their own rows via the built-in, unspoofable `created_by_id`; there is
  no granular permission for "may I heartbeat my own session" (everyone must be
  able to); and a billing gate would be actively wrong — a suspended tenant's
  users still need to log in to see *why*. Wrapping it would add a failure mode
  to a best-effort path and close no gap.

## The WhatsApp agent

Built from the `whatsapp-agentkit` skill (`jospabloh/claude-skills`), adapted to
multi-tenant Base44. `base44/functions/whatsapp/` is the app's **only public
endpoint** and it writes to a restaurant's books, so three rules are load-bearing:

1. **Verify the HMAC signature before reading the message.** The URL is public.
2. **Answer 2xx immediately, process after.** Providers retry up to seven times
   past ~5s and a Claude round-trip alone exceeds that.
3. **Claim the provider event id in `WhatsAppEvento` before any work.** Delivery
   is at-least-once, and (2) makes duplicates routine rather than rare. Skip
   this and one retried message becomes two identical expenses.

**Departure from the skill, on purpose:** it says to generate only the chosen
provider's adapter. That assumes one business per deployment. KitchOps is
multi-tenant, so provider is a per-restaurant setting and both Zernio and Meta
ship; exactly one runs per message, chosen by that tenant's `WhatsAppConfig`.

**Do not reintroduce `npm:@anthropic-ai/sdk` here.** `_brain.ts` calls the
Messages API with plain `fetch` because Base44's bundler cannot resolve the
SDK's transitive `zod` dependency — the function fails to deploy with
`upload_script: HTTP 400: [10021] Uncaught Error: No such module "zod"`, which
only shows up at `base44 functions deploy`, never in lint, build or tests. It
was the one function in the app that imported the SDK, and the only one that
failed. The upside: `_brain.ts` now imports nothing external, so CI type-checks
it alongside `_tools.ts` and `_providers.ts`.

**Authorization is an allowlist of phone numbers**, each carrying the role it
acts as. Anyone else gets a polite brush-off and never reaches the tool layer —
"whoever knows the number" is not an authorization model for something that
writes financial records. Every tool then resolves the same permission key its
button in the app is gated on, so a cook cannot do by WhatsApp what they cannot
do in the UI.

**The webhook URL is on the app's own subdomain, not the platform domain:**

```
https://<app-subdomain>.base44.app/api/apps/<appId>/functions/whatsapp
```

`https://app.base44.com/api/apps/.../functions/whatsapp` answers **403** —
*"Backend functions cannot be accessed from the platform domain"* — for every
request, including a provider's. Registered with the wrong host, the webhook
looks like a broken integration rather than a wrong URL. An unsigned POST to the
right host returns `401 unauthorized`, which is the cheapest way to confirm the
function is deployed and running without sending a real message.

Secrets live in Base44 app secrets, never in an entity: `ANTHROPIC_API_KEY`,
`ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`, `META_ACCESS_TOKEN`,
`META_APP_SECRET`, `META_VERIFY_TOKEN`, `INGEST_HMAC_SECRET`,
`PLATFORM_OWNER_EMAIL`.

## Design

One theme, dark, committed — see the header comment in `src/index.css` for why
(the brand assets are photographs that only sit on dark; copper reads as mud on
white; it is used in a kitchen at night). Palette is sampled from the logo:
copper `#C9713F`, navy `#2C4159`, warm charcoal `#16181C`. Barlow Condensed for
display, Inter Tight for body, IBM Plex Mono for money and dates — money is
tabular everywhere, because a column of figures that shifts as it changes is a
column you have to re-read.

The signature element is the **ticket rail**: alerts are open items you clear,
like tickets on an expediter's rail, so they render as slips clipped to a rail
and clearing one slides it off. The weekly cut gets the same treatment
(reported / perforation / deposited / difference). Both are in
`src/index.css`'s `@layer components`.

## ACACIA Portfolio Standard

This app is part of the ACACIA portfolio and must stay compliant with
`jospabloh/acacia-app-standard`. Read `STANDARD.md` there before implementing
any item below for the first time, and re-read the relevant section before
touching a module that's already implemented.

- [x] Module 1 — License lifecycle: `Business.billing_status`
      (trial|active|view_only|suspended), written ONLY by Mission Control's
      unified cron. No native lifecycle/renewal/reminder cron in this repo.
      `generarAlertas` is operational, not lifecycle: it never reads or writes
      billing_status except to skip suspended tenants for cost.
- [x] Module 2 — Roles declared in `src/lib/rbac.js`, mapped onto Base44's
      built-in `role` field; Mission Control's operator roles are a separate
      layer, never conflated.
- [x] Module 3 — Granular permissions: `src/lib/permissionRegistry.js` +
      server-side re-check on every write path, same precedence order, gated
      behind billing_status. Generated server copies, drift-checked in CI, with
      real unit tests (`base44/tests/permissions_test.ts`).
- [x] Module 4 — RLS: four-op `$or` shape on every tenant entity, both halves
      verified, static validator in CI. **Schema changes must be deployed, not
      just committed.**
- [x] Module 5 — Health: `base44/functions/health` measures a real entity-store
      round-trip, secret-gated. Mission Control polls `acaciaControl`'s `ping`.
- [x] Module 6 — `src/lib/appConfig.js` + `scripts/release.mjs`. Build
      validates, release generates — never the other way round.
- [x] Module 7 — Cuenta: org info, members, read-only billing status, danger
      zone with export and irreversible delete behind a typed confirmation.
      Deletion does NOT remove member User accounts; that is documented in the
      UI itself.
- [x] Module 8 — Soporte writes `SupportTicket` here first, then Mission Control
      pulls it via `acaciaControl`. No parallel triage UI.
- [x] Module 9 — `apps/kitchops.html` on `jospabloh/acaciaco-site`.
- [x] Module 10 — Login: on-brand, distinct error states, suspended/view_only
      explained in plain language, links to the marketing page and to support.

Last audited against the standard: 2026-08-20 — brought up from a bare
scaffold (5 entities, no tenant, no RLS, no permissions) to full compliance in
one pass, together with the WhatsApp agent. Not yet verified: a live browser
session as a permission-restricted `staff` against the deployed app, and a real
inbound WhatsApp message end to end. Both need a deployed backend with secrets.

### Deployed-schema state (2026-08-20) — cutover complete

The multi-tenant cutover was staged in two parts, and **both are now deployed**
to the live Base44 app (`6a83b727bb6cfcaac263ab0d`). All 18 entities match this
repo, verified with `list_entity_schemas` after the fact rather than assumed
from the merge.

The staging is worth remembering, because the same sequencing applies to any
future change that makes an existing field required:

1. **First, the 12 additive entities** (`Business`, `Membership`,
   `PermissionProfile`, `AuditLog`, `AppSession`, `AppSettings`,
   `SupportTicket`, `SupportTicketMessage`, the four `WhatsApp*`). Safe to
   deploy ahead of the client, because the running client never read them.
2. **Then, on merge**, the modifications to `Gasto` / `IngresoPlataforma` /
   `InventarioItem` / `Proveedor` / `Alerta` adding a required `business_id`
   and tenant RLS, plus the `User` field-lock on `role`/`business_id`.
   Deploying these first would have broken the running client, which wrote
   those entities with no `business_id` at all; and the field-lock needs
   `complete-onboarding` and `switch-tenant` live, since the lock makes them
   the only remaining writers.

**Left behind on purpose: 9 seeded demo `Gasto` rows (plus the matching
`IngresoPlataforma`/`InventarioItem`/`Proveedor`/`Alerta` seeds) carry no
`business_id`.** They are now unreachable to every tenant role — only the
platform `admin` branch matches them — so they are inert rather than harmful,
and they were left in place instead of deleted because deleting live rows to
tidy up is not a call to make silently. Delete them once a real restaurant is
onboarded and it is clear nobody wants them as a demo.

The live app holds one user (`role: admin`), so the admin RLS branch carried
no lockout risk for this cutover. **That will not be true once real tenants
exist** — a future required-field change needs a backfill, not just a deploy.

## Deploy: el id de la app vive en el repo (módulo 11, 2026-08-21)

El 2026-08-21, un `git pull` fallido dejó la terminal parada en `flowfin` y los
seis comandos siguientes desplegaron **el backend de FlowFin** en puntos, radar,
stockflow y ctrlhq: la CLI toma el origen del **directorio actual** y el destino
de `--app-id`, y nada comprueba que coincidan. En radar el `entities push` llegó
a completarse y borró el modelo de datos entero. Detalle en
`jospabloh/acacia-app-standard` → `docs/incidents.md`.

Por eso este repo ya no se deploya a mano:

```bash
npm run deploy            # funciones — lee el appId de base44.app.json
npm run deploy:site       # frontend — mergear a main NO lo hace por ti
npm run deploy:entities   # schema — DESTRUCTIVO, pide escribir "KitchOps"
npm run functions:audit   # quién llama a cada endpoint
```

**Mergear a `main` no deploya el sitio.** Se creyó lo contrario durante meses.
En flowfin se comprobó al revés: un fix se mergeó a `main` y, horas después, el
árbol que el app realmente servía seguía siendo el de antes del fix — mergear no
propaga nada (detalle en el CLAUDE.md de flowfin). El
frontend se deploya a mano con `npm run deploy:site`, igual que las funciones.
Y comprueba el resultado por **contenido**, no por hashes: el checkpoint del app
puede reportar un `git_commit_hash` igual al HEAD de `main` mientras el árbol que
de verdad se sirve está atrasado.

`scripts/base44-deploy.mjs` **rechaza** un `--app-id` por argumento, así que el
directorio y la app destino no pueden desalinearse. `deploy:entities` imprime la
lista de entidades y el nombre de la app antes de pedir confirmación — ver
"36 entidades de FlowFin" mientras crees estar desplegando otra app es la señal
de alto que faltaba.

`npm run validate:functions` (dentro de `npm run lint`) falla si los endpoints
pasan de `maxFunctions` en `base44.app.json` — hoy **40**, con
Base44 cortando en 50. El margen importa: por encima del tope el deploy falla a
media aplicación y la CLI **no** llega a su fase de poda, así que las funciones
viejas siguen ocupando los slots que harían falta para arreglarlo.

**Antes de consolidar o borrar cualquier función, corre `npm run functions:audit`.**
Una función sin llamadores en el repo casi nunca está muerta: el llamador vive
fuera, donde grep no ve — un entity hook de Base44, un cron del panel, un
`tool_config` de un agente, la URL de un webhook. El audit marca esas como
`REVISAR EN PANEL` en vez de adivinar; confírmalas contra
`npx base44 functions list` (anota `(N automation)`) antes de tocarlas.

## Módulo 12 (selector de tema): esta app declina, a propósito

El resto del portafolio ganó el 2026-08-21 un selector claro / oscuro /
dispositivo en una esquina de la pantalla (`jospabloh/acacia-app-standard`,
módulo 12). **KitchOps no lo lleva, y no es un olvido.**

Un selector sólo tiene sentido si hay más de un tema al que ir, y aquí no lo
hay por las tres razones que ya explica la cabecera de `src/index.css`: los
assets de marca son fotografías renderizadas sobre una cocina oscura y flotan
sobre blanco; el cobre `#C9713F` sobre fondo claro lee como naranja embarrado, y
con él se va cada acento de la app; y el uso real es un teléfono en una cocina
con luz baja, entre comandas. Una paleta clara no es una variante de esta: es un
segundo lenguaje visual y variantes nuevas del logo — un proyecto de diseño, no
un interruptor.

El módulo 12 contempla explícitamente este caso: una app puede declinar un tema
si la razón está escrita y nombra la restricción, y entonces **no monta ningún
control** en vez de montar uno con una sola opción funcional. Si algún día se
decide que KitchOps tenga tema claro, el orden es paleta primero, assets
después, y el selector al final — copiándolo de `shared/theme/`.

## `npm run test:smoke` — comprueba el sitio DESPLEGADO (2026-08-22)

`tests/smoke/smoke.spec.js` es la suite compartida del portafolio, idéntica byte
a byte en todos los repos; la fuente canónica está en
`jospabloh/acacia-app-standard` → `shared/smoke/`. Lo propio de esta app vive en
`tests/smoke/smoke.config.js` (URL, `<title>`, cómo representa el tema).

**No comprueba el build local: comprueba lo que se sirve.** Es la automatización
de la regla que cada CLAUDE.md repite — mergear no deploya nada, y hay que
verificar por contenido y no por hash. Afirma cuatro cosas, todas derivadas de
lo que el propio repo produce (nunca de copy adivinado, que se rompe al cambiar
una palabra y enseña a ignorar la suite):

1. responde 200 y el `<title>` es el de esta app — no un deploy viejo ni otro;
2. no lanza excepciones al pintar;
3. el tema llega resuelto desde el primer frame (el script pre-montaje viajó);
4. el selector de esquina está montado, cambia el tema y la preferencia
   sobrevive a un reload.

**No corre en el pipeline normal ni desde un sandbox de desarrollo**: la salida
HTTPS ahí va por un proxy con allowlist que no incluye estos dominios. Corre en
GitHub Actions (`.github/workflows/smoke.yml`): `workflow_dispatch` para
dispararla a mano justo después de un deploy, y un cron diario como red.

    npm run test:smoke                      # contra producción
    SMOKE_URL=https://… npm run test:smoke  # contra un preview
