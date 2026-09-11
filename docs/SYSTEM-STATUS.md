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
- **🔴 Remaining:** entirely (planned; the horizontal-infra wedge).
- **Needs:** an MCP server endpoint (tools: recall memory, list/act on connectors behind the gate) + auth
  (per-user token) + scoping. Runs fine on Workers (HTTP/SSE). Medium build.

### D. Connectors (connect & act on real accounts)
- **What:** the user's external accounts helloo can read/act on.
- **✅ Done:** Composio connect/reconnect from chat (`helloo_connect_account`, `allowMultiple` for expired);
  6 curated toolkits (Gmail, Calendar, Slack, Tasks, Docs, Sheets), reads autonomous, **writes gated**;
  `composio_identity` maps owner → Composio user.
- **🔴 Remaining — the big one: MULTIPLE ACCOUNTS PER CONNECTOR** (e.g. one person's **4 Google accounts**).
  Today it's effectively one account per toolkit; a second Gmail can be *connected* in Composio but there's no
  way to **label it, choose it, or route a tool call to the right one**.
- **Needs:** a `connection` table (owner, toolkit, composio connection id, label, is_default) → surface the
  accounts to the model → when a write/read targets a toolkit with >1 account, the agent **asks which** (or
  uses the default) → route `executeAction` to that specific connection id. Also: more toolkits (Notion,
  Drive, LinkedIn…) = one line each in `CURATED` with a verified slug.

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
- **🔴 Remaining:** entirely. Today there is **one fixed helloo per user**. No user-created agents, no
  per-agent scoping, no **A2A bring-your-own-agent** (Agent Cards). **This is v2** in `VERSIONS.md`.
- **Needs:** an `agent` table (owner, name, system prompt, tool scope, memory scope, channel bindings);
  generalize the DO/`converse` to load an agent config; a registry; for BYO, an A2A/MCP client that inherits
  channels + memory + trust.

### H. Create workflows — "if this, then that", multi-step
- **What:** automations beyond a single scheduled message.
- **🟡 Partial:** the **scheduler** = single-step, **time-triggered** automations (`reminder`, mode `run`
  executes an agent instruction).
- **🔴 Remaining:** **event-triggered** workflows (e.g. "when an email from X arrives → draft reply → notify
  me"), multi-step chains, and a builder.
- **Needs:** a **trigger/event system** (webhooks/polls from connectors → events) + a **step engine** (a
  workflow = ordered steps, each a tool/agent call, with the gate on writes) + storage (`workflow`,
  `workflow_run`). The `reminder` cron is the seed of the execution half; triggers are the missing half.

### I. Search
- **What:** find information.
- **✅ Done:** **web search** (Tavily, live, cited) + **memory recall** (semantic + keyword via RRF).
- **🔴 Remaining:** **unified search across connected accounts** (one query over Gmail + Drive + Slack…).
- **Needs:** a fan-out search tool that queries each connected read tool and merges/ranks.

### J. Memory / membrane (cross-cutting)
- **✅ Done:** owned, RLS-isolated, versioned bi-temporal atoms + provenance; recall; **people graph
  foundation** (`person`/`person_identity`, `find_person`, 80 legacy people imported).
- **🔴 Remaining:** **people-graph auto-fill** (extract identities/mentions from live channels so "unify
  Manish across email/Slack/WhatsApp/phones" resolves itself); memory UI (inspect/edit/forget — design-gated).
- **Needs:** an extraction pass on ingest/read (pull senders, @handles, numbers → `person_identity` with
  resolution against existing people) + a merge/dedup step.

### K. Trust & security (cross-cutting, the moat)
- **✅ Done:** Rule-of-Two **gate**, **approve-before-act** queue, **policy** store, **audit** log; every
  external write is gated; money/trades never auto-executed.
- **🔴 Remaining:** **egress allowlist + scoped OBO tokens + sandbox** (Q40); **spend caps**; webhook-secret
  is active but broader hardening pending.
- **Needs:** an outbound-fetch allowlist per agent; per-owner budget tracking + a cap check before tool calls.

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
1. **Multi-account connectors** (D) — *why:* people genuinely have 4 Google accounts; blocks daily use.
   *needs:* `connection` table + account labels/default + tool routing + "which account?" disambiguation.
   *size:* **M–L**.
2. **People-graph auto-fill** (J) — *why:* makes the contact graph and nudges/wishes real; unifies "Manish".
   *needs:* extraction on ingest/read → `person_identity` + resolution/dedup. *size:* **M**.
3. **MCP-as-a-channel** (C) — *why:* the horizontal-infra wedge; reach helloo inside Claude/ChatGPT.
   *needs:* MCP server endpoint (recall + gated tools) + per-user token. *size:* **M**.
4. **Security hardening basics** (K) — *why:* the real boundary under the gate before wider use.
   *needs:* egress allowlist + spend caps. *size:* **M**.
5. **Web chat UI + one more channel** (B) — *why:* not everyone is on Telegram. *needs:* design gate for UI;
   WhatsApp/voice each need a persistent host + provider. *size:* **L** (design-gated).

### Phase 2 — the platform (v2)
6. **User-made agents + bring-your-own-agent** (G) — `agent` table + scoped runtime + registry + A2A client.
   *size:* **L**.
7. **Workflow engine** (H) — trigger/event system + step engine + builder. Seeded by the scheduler.
   *size:* **L**.
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
