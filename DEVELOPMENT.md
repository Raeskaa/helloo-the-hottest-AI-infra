# Development

The helloo app is a **pnpm + Turborepo monorepo**. Apps are composition-only; domain behaviour lives in packages — matching the architecture (memory, trust, agent, channels each get their own package as they're built).

```
apps/
  api/            Cloudflare Worker (Hono) — HTTP + auth mount + (later) agent runtime, channels
  web/            (later) the frontend app
packages/
  auth/           Better Auth config (OTP + magic link + social + organizations)
  db/             Drizzle schema (auth.ts generated · membrane.ts hand-written) + migrations + clients
  core/           shared types (AppEnv) + config
  memory/         membrane record layer — tenant-scoped access (withTenant) + atom/audit repository
  (later)         trust/ · agent/ · channels/
docs/  + root .md  the thesis / architecture / research docs
tooling/          shared tsconfig base
```

## Prerequisites
- Node 20+ and **pnpm** (`npm i -g pnpm`).
- A free **Neon** Postgres project (neon.tech).

## Setup
```bash
pnpm install                       # from the repo root — installs the whole workspace
```

**Keys.** The Worker reads secrets from `apps/api/.dev.vars`; the DB CLI tools (Node) read a root `.env`.
```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill DATABASE_URL + BETTER_AUTH_SECRET (openssl rand -base64 32)
echo "DATABASE_URL=<your neon url>" > .env         # root .env (gitignored) — for db:generate / db:migrate
```

**Create the tables:**
```bash
pnpm db:generate     # packages/auth → writes packages/db/src/schema/auth.ts from the auth config
pnpm db:migrate      # generates + applies the SQL migrations to Neon (auth + membrane + RLS)
```

**Create the membrane's non-owner role** (once per database). Neon's owner role has
`BYPASSRLS`, so the membrane must connect as a separate role or RLS is silently bypassed
(ADR-0003):
```bash
ADMIN_DATABASE_URL="<owner DIRECT url>" APP_DB_PASSWORD="$(openssl rand -hex 24)" \
  node packages/db/scripts/create-app-role.mjs
# then put this in apps/api/.dev.vars (pooled host, helloo_app role):
#   APP_DATABASE_URL=postgresql://helloo_app:<APP_DB_PASSWORD>@<pooled-host>/<db>?sslmode=require
```

**Run the API:**
```bash
pnpm --filter @helloo/api typegen   # generates worker-configuration.d.ts
pnpm --filter @helloo/api dev       # → http://localhost:8787   (or: pnpm dev)
```

## Try it (no UI yet)
```bash
curl -X POST http://localhost:8787/api/auth/email-otp/send-verification-otp \
  -H 'content-type: application/json' -d '{"email":"you@example.com","type":"sign-in"}'
# → the 6-digit code prints in the dev console (no email key needed in dev)

curl -i -X POST http://localhost:8787/api/auth/sign-in/email-otp \
  -H 'content-type: application/json' -d '{"email":"you@example.com","otp":"THE_CODE"}'
# → sets a session cookie; GET /api/me with it returns the user
```

## Optional
- **Social login:** add `GOOGLE_/GITHUB_/APPLE_` client id+secret to `apps/api/.dev.vars` (callback `…/api/auth/callback/<provider>`); each turns on automatically.
- **Real emails:** add `RESEND_API_KEY` + a verified `EMAIL_FROM`.
- **Deploy:** inside `apps/api`, `wrangler secret put <NAME>` for each secret, set `BETTER_AUTH_URL` to the deployed origin, then `pnpm --filter @helloo/api deploy`.

## Where things go (the rule)
- **`apps/*` = composition only** — wire packages to a runtime (HTTP, cron, MCP). No domain logic.
- **`packages/*` = domain behaviour** — one package owns one domain; schemas, services, and handlers stay separate. New domain → new package, not a catch-all.
