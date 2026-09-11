# Design log

> Append-only record of design/UI work. Newest on top. Pairs with `PARITY.md`.

## 2026-09-12 — Web UI Pass 2 (People · Overview · Activity · What's-shared · Settings)
- **Surface:** web (`apps/web`). Same design system + shell as Pass 1 — nothing new invented.
- **Screens:** Overview (dashboard: memory/people/connections/approvals tiles + recent activity; new landing) ·
  People (contacts + search) · Activity (event log) · What's-shared (membrane: private vs shared/org) ·
  Settings (account, MCP link for Claude/ChatGPT, reminders/automations/agents with remove, sign out).
- **API routes (thin → @helloo/*):** /api/overview, /api/people, /api/activity, /api/shared, /api/settings,
  /api/settings/mcp-token, /api/settings/cancel. Sidebar nav expanded to the full set.
- **Verified (browser, real data):** Overview shows 1,131 memories · 93 people · 7 connections · 5 pending;
  People lists real contacts; all endpoints 200. Deployed to helloo-web.
- **Skipped this pass:** inline memory edit/forget, audit filtering, billing.


## 2026-09-12 — Web UI Pass 1 (adopt helloo-brain frontend onto helloo-platform)
- **Surface:** web (`apps/web`, Next.js/OpenNext on Cloudflare → helloo-web.getyourbumb.workers.dev).
- **What:** brought helloo-brain's frontend + design system into the monorepo, repointed to the new
  backend (Better Auth + `@helloo/*` packages; no Supabase). One system.
- **Design system:** reused helloo-brain's tokens (`app/globals.css`: monochrome, `--app-bg #fafafa`,
  white cards, hairline `--border #ebecee`, radius `0.75rem`, brand only on status) + `components/ui`
  (shadcn/base-ui). **Nothing new invented.** Dropped `components/brain` (team-only).
- **Screens shipped:** Login (net-new, email-OTP) · Ask (chat → converse) · **Approvals inbox**
  (net-new — approve/deny/always-allow → executes) · Memory (atoms + search) · Connections
  (multi-account). App shell with sidebar nav + sign-out; session-guarded.
- **States:** default / loading / empty done on each screen; error surfaced on login. Deferred:
  richer error/optimistic states.
- **Verified:** browser E2E — email-OTP login → app shell → Ask + Connections (real data);
  authed API routes 200; unauthed → 401; `/` → /login.
- **Deferred to Pass 2:** People, Overview, Activity, What's-shared, Settings. **Dropped for v1:**
  Commitments, Members, billing.
- **Known nuance:** web login creates/uses a user keyed by email; the Telegram data-owner (TbB6 /
  mahesh@helloo.dev) is a separate account, so a fresh web login shows an empty account. To see
  existing data in the UI, point the data-owner to a deliverable email (open item).
