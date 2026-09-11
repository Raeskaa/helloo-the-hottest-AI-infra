# helloo — System Status & Build Plan (living)

> The single source of truth for **what the app is, what's built, what's left, and the plan to get
> there.** Update this whenever something ships. Pairs with [BACKLOG.md](BACKLOG.md) (task list),
> [VERSIONS.md](VERSIONS.md) (v1→v3), [DECISIONS.md](DECISIONS.md) (ADRs), [ARCHITECTURE.md](ARCHITECTURE.md)
> (the seven primitives). Legend: **✅ done · 🟡 partial · 🔴 not built · 🚧 in progress (another thread)**.

Last updated: 2026-09-11.

---

## 0. The user journey (the spine everything hangs off)

A person **arrives on a channel** (or via MCP) → **connects one or more accounts** (possibly several of
the same kind — e.g. 4 Google accounts) → **asks for things** → **sets things up** → **makes agents** →
**builds workflows** → **searches**. Everything below is a layer of that spine, each gated by the trust
layer and grounded in owned memory.

```
 channel / MCP ──▶ identity+profile ──▶ connectors(accounts) ──▶ AGENT(ask) ──▶ trust gate ──▶ act
        ▲                  │                     │                   │              │
        └── reminders ◀── scheduler        memory (membrane)     web search    audit log
                              ▲                   │
                       workflows(🔴)         people graph
```

---

## 1. Architecture at a glance

**Runtime:** Cloudflare Workers (free) + one **Durable Object per user** (`HelloAgent`) + **Neon Postgres**
(Drizzle) + a **cron** (every 3 min: warms Neon + delivers due reminders). Model: **Gemini via the Vercel
AI SDK** (provider-agnostic). Live at `helloo-api.getyourbumb.workers.dev`.

**Monorepo packages** (`packages/*`) + app (`apps/api`, composition-only):

| Package | Owns | Status |
|---|---|---|
| `core` | `AppEnv` contract (env/secrets) | ✅ |
| `db` | Drizzle schema, migrations, `withTenant` (RLS), retry/warmup | ✅ |
| `auth` | Better Auth (email-OTP, magic link, social, org, phone-OTP) | ✅ (🚧 WhatsApp phone-OTP in a parallel thread) |
| `memory` | membrane atoms, recall (pgvector+FTS), people graph | ✅ (people auto-fill 🔴) |
| `trust` | Rule-of-Two gate, approvals, policy, audit | ✅ |
| `agent` | `converse` loop + all agent tools | ✅ |
| `integrations` | Composio connect/exec, curated tools, web search | ✅ (multi-account 🔴) |
| `channels` | Telegram adapter, linking, onboarding | ✅ (more channels 🔴) |
| `scheduler` | reminder table access + cron delivery | ✅ |
| `apps/api` | Hono routes, webhook, DO, cron wiring | ✅ |

**Data (Neon, migrations 0000–0016):** auth tables · `hello`/`atom`/`audit`/`atom_embedding` (membrane) ·
`permission_request`/`policy` (trust) · `channel_link`/`composio_identity`/`channel_onboarding` (channels) ·
`person`/`person_identity` (people) · `reminder` (scheduler). All membrane/people/trust/scheduler tables are
**RLS-isolated** (owner connection bypasses for admin/cron).

**Secrets (Cloudflare):** `DATABASE_URL`, `APP_DATABASE_URL`, `BETTER_AUTH_*`, `GEMINI_API_KEY`,
`COMPOSIO_API_KEY`, `TELEGRAM_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `TAVILY_API_KEY` (+ `KAPSO_*` for the
in-progress WhatsApp OTP).

---

## 2. Subsystems in detail

Each: **what it is · done (with references) · remaining · what's needed to build it.**

### A. Identity, profile & onboarding
- **What:** who the user is; how they start.
- **✅ Done:** Better Auth accounts (email-OTP, magic link, social, org); sessions; **in-Telegram self-serve
  signup** (email → real OTP email via Resend/verified domain → account + `channel_link`), `channel_onboarding`
  state machine; owned memory as the de-facto profile.
- **🔴 Remaining:** a **structured profile** (timezone, locale, display name, defaults, "about me"); profile/
  settings **UI**.
- **Needs:** a `profile` table (or profile atoms with a fixed schema) + capture prompts (e.g. ask timezone on
  first schedule) + a settings surface (design-gated).

### B. Channels (how helloo is reached)
- **What:** the surfaces a user talks to helloo on.
- **✅ Done:** **Telegram** end-to-end (onboarding, webhook secret, proactive delivery). `channel_link`
  supports **many channels per user**.
- **🟡 Partial:** **Web** — auth endpoints exist, no chat UI.
- **🔴 Remaining:** **WhatsApp** (Baileys, user's own account — see the ban note) · **Voice/telephony** ·
  **SMS** (a parallel Twilio thread) · **Slack-as-a-channel** · **web chat UI**.
- **Needs (per channel):** an adapter (parse inbound → `runTurn` → send reply) + linking; the pattern is
  established in `channels/telegram.ts` + the webhook. Voice needs a telephony provider + STT/TTS; WhatsApp
  needs a Baileys sandbox service (can't run on Workers — needs a persistent host).

### C. MCP connection (helloo *inside* Claude/ChatGPT)
- **What:** expose helloo's memory + a safe subset of tools as an **MCP server** so other assistants can use it.
- **🟡 Built (read-only v1):** JSON-RPC MCP endpoint `/api/mcp/:token` exposing `recall_memory`, `find_person`,
  `web_search`; per-user token (`mcp_token` table); `POST /api/channels/mcp/token` mints the URL. *Verified:
  handshake + tools/list + tool calls + 401 on bad token.*
- **🔴 Remaining:** exposing **gated write tools** over MCP (behind the trust gate); OAuth (vs path token); a
  UI/CLI to fetch the token; SSE streaming. **Needs:** token-issuing surface for real users; write-tool bridge.

### D. Connectors (connect & act on real accounts)
- **What:** the user's external accounts helloo can read/act on.
- **✅ Done:** Composio connect/reconnect from chat (`helloo_connect_account`, `allowMultiple` for expired);
  6 curated toolkits (Gmail, Calendar, Slack, Tasks, Docs, Sheets), reads autonomous, **writes gated**;
  `composio_identity` maps owner → Composio user.
- **✅ MULTIPLE ACCOUNTS PER CONNECTOR** (e.g. one person's **4 Google accounts**) — built & verified. A
  `connection` table mirrors every Composio account (toolkit, id, label, is_default, status); exactly one
  default per toolkit (among ACTIVE); `syncConnections` refreshes it each turn; `executeAction` routes reads
  **and** gated writes to the toolkit's default via Composio's `connectedAccountId`. Agent tools:
  `helloo_list_accounts` / `helloo_set_default_account` / `helloo_label_account`. *(Verified with real data:
  4 Google Docs + 2 Slack accounts, correct defaults, switching the default via chat works.)*
- **🔴 Remaining:** per-**call** account choice (a write schema can't carry "which account", so today it's the
  default + switch); more toolkits (Notion, Drive, LinkedIn…) = one line each in `CURATED` with a verified
  slug. *(Perf: sync is now throttled — reads the mirror, re-syncs only when stale; `helloo_refresh_accounts`
  forces one. Email-read turn 28.8s → 16.5s.)*

### E. Agent — "ask for things"
- **What:** the reasoning loop that answers and acts.
- **✅ Done:** `converse` (recall → reason → tools → gate → reply), multi-step (`stepCountIs`); explicit
  **response policy** (ground-or-abstain, reads-auto, writes-queued, connect-when-missing, cite sources);
  tools: Composio read/write, `web_search`, `helloo_find_person`, `helloo_schedule_reminder`/list/cancel,
  `helloo_connect_account`. One agent per user (the `HelloAgent` DO).
- **🔴 Remaining:** voice input; threaded/long-context memory of a conversation; sharper disambiguation.
- **Needs:** conversation-thread storage + a richer context assembler; voice = channel work (B).

### F. Setup / preferences / policies — "set things up"
- **What:** standing configuration the user establishes once.
- **🟡 Partial:** **reminders + recurring briefs** (scheduler) = the first "set it and it runs"; **policies**
  (trust: approve-once / always-for, remembered).
- **🔴 Remaining:** a general "set up a rule" surface; a preferences store surfaced to the user.
- **Needs:** overlaps with Workflows (H) and Profile (A).

### G. Make an agent — user-defined / bring-your-own
- **What:** the user creates or brings agents, each scoped to some memory/tools/channels.
- **🟡 Built (v1):** **user-defined agents** — `agent` table (RLS: name, persona, optional toolkit scope) +
  tools `helloo_create_agent` / `list` / `delete` / **`ask_agent`** (delegation). `converse` takes
  `ConverseOptions {persona, scopeToolkits, isSubAgent}`; a delegated sub-agent runs with the persona +
  scoped tools, skips the spend cap and management tools, and can't recurse. *Verified: created a 'Recruiter'
  agent and delegated a draft to it.*
- **🔴 Remaining:** per-agent **memory scope**; **bring-your-own-agent** (A2A/Agent Cards); an agent
  **registry**; per-agent channel bindings. **Needs:** an A2A/MCP client that inherits channels + memory + trust.

### H. Create workflows — "if this, then that", multi-step
- **What:** automations beyond a single scheduled message.
- **🟡 Built (v1):** **event-triggered workflows** — `workflow` table (RLS) + agent tools
  (`helloo_create_workflow` / `list` / `delete`). v1 trigger = a **new Gmail** matching from/subject; the
  cron polls, dedups against `last_seen_id` (baselines on first poll so it never fires on backlog), runs the
  `instruction` as an agent turn (multi-step, **writes gated**) and delivers on the channel. Time-triggered
  automations remain the scheduler's job (`reminder`). *Verified: 'GitHubWatch' fired via cron → delivered.*
- **🔴 Remaining:** more trigger types (calendar event soon, Slack message), a **step DSL** for typed
  multi-step chains (v1 uses one agent instruction), a `workflow_run` log/history, per-owner Gmail-fetch
  batching, pause/resume UI.

### I. Search
- **What:** find information.
- **✅ Done:** **web search** (Tavily, live, cited) + **memory recall** (semantic + keyword via RRF).
- **🔴 Remaining:** **unified search across connected accounts** (one query over Gmail + Drive + Slack…).
- **Needs:** a fan-out search tool that queries each connected read tool and merges/ranks.

### J. Memory / membrane (cross-cutting)
- **✅ Done:** owned, RLS-isolated, versioned bi-temporal atoms + provenance; recall; **people graph
  foundation** (`person`/`person_identity`, `find_person`, 80 legacy people imported).
- **🟡 people-graph auto-fill** — **built for Gmail** (`helloo_import_contacts`): scans senders → resolves
  into the graph (identity known → skip; same name → attach email = unify; else create). `fetchGmailContacts`
  + `resolvePeople`. *Verified: 80→93 people, 0→13 email identities.* Schedulable ("import my contacts daily").
  **Remaining:** other sources (Slack authors, phone numbers, message @handles); service-vs-person filtering;
  auto-on-read; memory UI (inspect/edit/forget — design-gated).

### K. Trust & security (cross-cutting, the moat)
- **✅ Done:** Rule-of-Two **gate**, **approve-before-act** queue, **policy** store, **audit** log; every
  external write is gated; money/trades never auto-executed. **Spend cap:** per-owner daily turn cap
  (`usage_counter` + `recordTurn`, `DAILY_TURN_CAP`, enforced in `converse`; verified — over-cap turns
  short-circuit with no LLM cost). Telegram webhook secret active.
- **🔴 Remaining:** **egress allowlist** (default-deny outbound host list — low risk today since no
  arbitrary-URL fetch, matters once we add read-a-URL / MCP writes) + **scoped OBO tokens + sandbox** (Q40);
  auth-endpoint rate limiting (OTP-send spam — currently blocked on the parallel auth WIP; enable Better
  Auth's rate limiter when that lands).
- **Needs:** an outbound-fetch allowlist; Better Auth `rateLimit` config on the auth handler.

### L. Model layer
- **✅ Done:** provider-agnostic via the AI SDK (Gemini today: `gemini-3.6-flash` for the loop,
  `gemini-embedding-001` for recall). Swappable to Claude.
- **🔴 Remaining:** per-task model routing; **helloo-ai on-device models** (v2/v3).

### M. Ops / delivery
- **✅ Done:** deployed on free tier; cron warm-up + reminder delivery; Neon cold-start retry wrapper; Resend
  email live (verified domain); Telegram webhook secret; **build-in-public repo** (docs restructured).
- **🔴 Remaining:** observability/alerting; staging; CI; load/rate limits; the silent-email-failure hardening
  (`send-verification-otp` returns 200 even on a Resend error).

---

## 3. The plan — sequenced, not random

Ordered by **leverage × dependency**. Phases map to `VERSIONS.md`. Each item: **why · what's needed · rough
size (S/M/L)**.

### Phase 1 — finish v1 for real daily use (now → next)
1. ✅ **Multi-account connectors** (D) — DONE & verified. `connection` table + default routing +
   list/switch/label tools. *(Follow-ups: per-call account choice, perf pass, more toolkits.)*
2. 🟡 **People-graph auto-fill** (J) — Gmail source DONE (`helloo_import_contacts`, verified 80→93 people,
   0→13 email identities). *remaining:* Slack/phone sources, service-vs-person filtering, auto-on-read. *size (rest):* **S–M**.
3. 🟡 **MCP-as-a-channel** (C) — read-only server DONE (`/api/mcp/:token`: recall_memory, find_person, web_search;
   verified). *remaining:* gated writes over MCP, OAuth, a token UI. *size (rest):* **S–M**.
4. 🟡 **Security hardening basics** (K) — **spend cap DONE** (per-owner daily turn cap, verified). *remaining:*
   egress allowlist (low-risk until read-a-URL exists) + auth rate limiting (blocked on the parallel auth WIP). *size (rest):* **S**.
5. **Web chat UI + one more channel** (B) — *why:* not everyone is on Telegram. *needs:* design gate for UI;
   WhatsApp/voice each need a persistent host + provider. *size:* **L** (design-gated).

### Phase 2 — the platform (v2)
6. 🟡 **User-made agents** (G) — v1 DONE (custom personas + delegation via ask_agent; verified). *remaining:*
   per-agent memory scope, bring-your-own-agent (A2A), registry. *size (rest):* **M–L**.
7. 🟡 **Workflow engine** (H) — v1 DONE (email-triggered, agent-executed; verified). *remaining:* more
   triggers (calendar/Slack), typed multi-step DSL, run history, builder UI. *size (rest):* **M**.
8. **Unified cross-account search** (I) — fan-out + merge. *size:* **M**.
9. **Workspaces / orgs** — multi-tenant shared membrane. *size:* **L**.

### Phase 3 — scale & edge (v3)
10. Tool/skill **registry marketplace** · **helloo-ai on-device models** · **voice hardware** · open-core at
    scale.

### The rule we build by
Every new capability is a **tool behind the trust gate**, grounded in **owned memory**, reachable from **any
channel** — we wire external services as HTTP tools, we don't fork frameworks (see [REFERENCES.md](REFERENCES.md)).
No UI ships without the design gate. No secret in the repo. Money/trades are prepare-only.

---

## 4. What's actively in progress right now
- 🚧 **WhatsApp phone-OTP (Kapso)** in the `auth` package — a parallel thread (not this one).
- Everything else above is either shipped or not yet started (nothing else mid-build).

## 5. Update protocol
When something ships: flip its ✅/🟡/🔴 here, add the concrete reference (table/tool/file), and move the task
in [BACKLOG.md](BACKLOG.md) + [linear-import.csv](linear-import.csv). Keep this file honest — if something is
half-done, mark it 🟡 and say what's missing.
