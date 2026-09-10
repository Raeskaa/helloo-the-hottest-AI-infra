# Backlog & status — what's built, what's next

> Living status of the v1 build against `VERSIONS.md`. Keeps the work honest: every requested
> feature maps to a plan version and a status, so nothing is "random." Newest status on top.

## Built & verified (v1 spine + half the flagship)
- **Runtime:** `HelloAgent` Durable Object, one per user (SQLite) · **Data:** Neon Postgres + RLS membrane (non-owner role) · **Memory:** versioned bi-temporal atoms + provenance + **multi-signal recall** (pgvector + FTS via RRF) · **Trust:** Rule-of-Two gate + approve-before-act + policy store + audit · **Agent loop:** `converse` (recall → reason → gate → learn), multi-step · **Integrations:** Composio (Gmail read + gated send) · **Channels:** Telegram (`@kalfiraana_bot`) · **Model:** provider-agnostic (Gemini via AI SDK).
- **Live in production** (Cloudflare Workers free + SQLite DOs, Neon free). **Real data migrated:** 1,124 memories/people from the old helloo-brain; old Composio connections wired (`composio_identity`).

## Next up (v1, in order)
1. **Calendar + Slack + Docs/Tasks/Sheets tools** — wire the already-connected toolkits into `converse` (read = autonomous, write = gated). *Completes the "inbox & calendar chief of staff" flagship.* ← building now
2. **Connection-permission flow** — when helloo needs a toolkit it isn't connected to, it *asks* (returns a connect link / approval) instead of failing. (v1 Connections + Trust.)
3. **People / entity graph + cross-channel identity resolution** — extract people/contacts from every channel and **unify one person across surfaces** (e.g. *Manish* = his WhatsApp + emails + phone numbers + WhatsApp contact → one entity). Import the old `entities`/`entity_mentions`; build edges. Auto-build the contact/mailing graph. (v1 People; entity resolution = Q17.)
4. **Reliability:** faster/typing-indicator on Telegram; make `ingest` async so a turn is one LLM call; keep the free-tier retry posture.
5. **More channels (adapters over the same `runTurn`):** telephony ("call helloo", + agent-initiated calls with a phone number) · **WhatsApp via Baileys** (runs the user's own account in a sandbox, exposes an API — different risk than the banned Business-API bot; see the WhatsApp-ban note) · Slack-as-channel · SMS · **helloo-as-MCP-server** (reachable inside Claude/ChatGPT).
6. **Memory surfaces (UI, design gate):** inspect / edit / forget, provenance ("why do you know this"), time-machine, People view. *Deferred while backend-first._
7. **Security hardening:** default-deny egress allowlist + scoped OBO tokens + sandbox (Q40); Telegram webhook secret (code ready, needs activation).

## v2 / v3 (per VERSIONS.md — not now)
Workspaces/orgs · bring-your-own-agent + tool/skill registry · **helloo-ai on-device models** · ambient voice · billing (v2). Registry marketplace · cross-org "many hellos" · voice hardware · open-core at scale (v3).

## Requested-feature → plan map (2026-09-10, Mahesh)
| Request | Plan home | Status |
|---|---|---|
| Calendar + Slack + Docs/Tasks/etc tools | v1 flagship (integrations) | next (#1) |
| Agent asks permission to connect Calendar | v1 Connections + Trust | #2 |
| Auto contact/mailing graph from all channels | v1 People / entity graph | #3 |
| Unify one person (Manish) across WhatsApp/email/phones | v1 entity resolution (Q17) | #3 |
| User's WhatsApp on sandbox via Baileys API | v1 WhatsApp channel (new impl) | #5 |
| Agents get phone numbers to call/receive | v1 telephony | #5 |
