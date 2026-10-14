# AGENTS.md

## Project Context

This is a Base44 app repository. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for local setup, environment variables, and publish workflow.

## Base44 References

- CLI overview: https://docs.base44.com/developers/references/cli/get-started/overview.md
- Agent skills: https://docs.base44.com/developers/backend/overview/skills.md

If your agent supports Agent Skills, install or update Base44 skills before Base44-specific work:

```bash
npx skills add base44/skills
```

## Key Files

- `src/`: frontend application source.
- `src/api/base44Client.js`: frontend Base44 SDK client.
- `vite.config.js`: Vite config and Base44 Vite plugin setup.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `base44 dev` as the default local development command when you need the local Base44 backend. It can run the backend and frontend together.
- When docs or code mention the frontend being started automatically, that usually means the Base44 project config includes `site.serveCommand`, for example `"serveCommand": "npm run dev"` in `base44/config.jsonc`.
- Use `npm run dev` only for frontend-only work against the hosted Base44 backend.
- Prefer the existing Base44 CLI workflow over adding new npm scripts for Base44-specific tasks.
- Reuse the existing SDK client and Vite plugin patterns before adding new Base44 integration paths.
- Run the relevant checks from `package.json` before finishing code changes.

## Deploying (learned the hard way, 2026-08-20)

```bash
npx base44 functions deploy --app-id "<appId>"          # all functions
npx base44 functions deploy whatsapp --app-id "<appId>" # just one (positional)
npx base44 entities push --app-id "<appId>"
npx base44 site deploy -y --app-id "<appId>"            # publishes the built site
```

- **`--force` does NOT force a re-upload.** It means *"delete remote functions
  not found locally"* — a prune. Harmless when every function exists locally,
  destructive when one doesn't. It is not the flag to reach for when a deploy
  looks stuck.
- **A function's bundle is built by Base44, not by us**, so a dependency it
  cannot resolve fails at `upload_script` with an opaque 400 — e.g.
  `[10021] Uncaught Error: No such module "zod"` for `npm:@anthropic-ai/sdk`.
  Lint, build and the Deno tests all pass in that state; only the deploy fails.
  Prefer `fetch` over an npm SDK in function code.
- **`unchanged` after a failed deploy is still worth verifying.** Confirm from
  the outside rather than from the CLI's label, with an unsigned POST of `{}` to
  `https://<app-subdomain>.base44.app/api/apps/<appId>/functions/<name>`. The
  status code alone does not say "live": it depends on what the function checks
  first. Measured against this app on 2026-10-13:
  - `401` — secret- or signature-gated (`health`, `generarAlertas`, `whatsapp`).
  - `400` with the function's own message — action dispatchers that validate
    the body first (`gastos`, `soporte`, `business`, `acaciaControl`).
  - `500 {"message":"Authentication required to view users"}` — functions that
    call `auth.me()` first (`complete-onboarding`, `manage-member`,
    `delete-account`). This 500 means the bundle loaded and ran; it is the SDK
    rejecting the missing session.
  - `404 "Backend function '<name>' not found or not deployed"` — never deployed.
  A bundle that fails to load also comes back as a 500 (not reproduced here), so
  read the body, not just the code. None of these prove which version is live; only
  a call with a real session does. Note the **app subdomain**: the platform
  domain (`app.base44.com`) 403s all backend-function requests.
- `entities push` overwrites the deployed schema with the local `.jsonc` and
  deletes any entity not present locally. It prompts first; read the list.
