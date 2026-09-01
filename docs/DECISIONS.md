# Decisions (ADR log)

> Locked architectural calls, newest first. Each cites the `QUESTIONS.md` fork it closes and the doc it's grounded in. A decision here overrides the "proposal, not decision" framing in the design docs. Reopen only with a new ADR that supersedes.

---

## ADR-0007 — Agent loop v1: host-agnostic `converse()`, DO runtime deferred
**Date:** 2026-09-02 · **Grounded in:** `SYSTEM-MAP.md §3`, VERSIONS v1 runtime · **Status:** accepted

- **Built:** `packages/agent` `converse(env, ownerId, message)` — the daily loop: recall relevant memory → the model answers grounded in it (says "don't know" over inventing) → any proposed action is routed through `trust.gate()` and **never auto-executed** (the tool has no `execute`; the SDK hands the call back, we gate it) → the turn is learned back via `ingestText`. Route `POST /api/converse`. Provider-agnostic via the AI SDK; **model = Gemini `gemini-3.6-flash`** (swap to Claude in one line when an `ANTHROPIC_API_KEY` exists).
- **Deviation from VERSIONS ("runtime = Durable Object per user"), conscious:** v1 conversation is **stateless** (recall→respond), so the loop runs as host-agnostic domain logic in a Worker route. It **moves into a per-user DO** when we need durable state / alarms / proactivity / streaming — same sequencing as building Memory before the DO. The logic is host-agnostic so the move is mechanical.
- **Stubbed (needs integrations):** real action *execution*. The gate + approval handshake are real; there's no tool to actually send yet. Lands with Nango/Composio + the tool layer.
- Proven in-Worker: "Where do I live?" → grounded "You live in Lyon!"; "email priya…" → tool intent → gate → 1 pending approval, nothing sent.

## ADR-0006 — Trust layer v1: in-process gate + approve-before-act + policy store
**Date:** 2026-09-02 · **Grounded in:** `HUB-TRUST.md`, `DATA-MODEL.md §5`, VERSIONS v1 · **Status:** accepted

- **Built (the decision/handshake layer):** `packages/trust` — Rule-of-Two + action-tier `gate()` (read-only/internal/reversible → autonomous & logged; external/irreversible/high-risk → gated), the **approve-before-act handshake** (`permission_request` queue keyed by request id → `decide()` → immutable `permission_decision` audit event), and the **shared policy store** (`policy`; "always allow for X" writes it, and `gate` shortcuts future matches). Tables under RLS+FORCE (migrations 0007/0008). This is the same policy store v3 federation autonomy will read.
- **Deferred to the agent-runtime slice (Q40):** the real isolation boundary — **per-run sandbox + default-deny egress allowlist + scoped OBO tokens** — plus **spend/action caps (counters), kill switch, and reversibility**. HUB-TRUST is explicit that an in-process engine is UX, not a security boundary: the gate decides *whether* to act; the sandbox/egress bound *what a run can reach*. So v1's gate is the first filter, never the only line — it lands with the DO agent runtime + real tools, which don't exist yet.
- **Also moved to `@helloo/db`:** `withTenant` + `ensureHello` (tenant/identity primitives) so trust needn't depend on memory.

## ADR-0005 — Recall index: pgvector in Neon + Gemini embeddings
**Date:** 2026-09-02 · **Closes:** part of Q13/Q37 (retrieval) · **Grounded in:** `HUB-MEMORY.md` read path, `DATA-MODEL.md §4` · **Status:** accepted

- **Embeddings live in Postgres via pgvector**, in a sidecar `atom_embedding` table (RLS-protected), not on the `atom` record — keeping the "index is a rebuildable/disposable convenience" split (`HUB-MEMORY`). Rationale over Cloudflare Vectorize: one store, one RLS model, transactional with the record, trivial local dev, and plenty fast at our scale. The index is disposable — migrate to Vectorize later only if scale demands.
- **Model:** `gemini-embedding-001` at **768 dims** (Matryoshka truncation; `text-embedding-004` is 404 for new keys, like `gemini-2.5-flash`). Via the AI SDK (provider-agnostic). Task types: `RETRIEVAL_DOCUMENT` on write, `RETRIEVAL_QUERY` on recall.
- **v1 recall is vector-only** (cosine). `HUB-MEMORY` mandates multi-signal (never single-vector) — so **keyword (tsvector) + RRF fusion, edges/multi-hop, tiering, and a reranker are the immediate next slices**, not shipped here. Atoms already carry `provenance`, so recall returns "why" for free.
- Embeddings computed **outside** the DB transaction (before the write) so no external call is held inside a tx. Atoms written before this ADR have no embedding row (not backfilled in v1) — they won't surface in vector recall until re-asserted.

## ADR-0004 — Identity anchor & one-hello-per-owner (v1)
**Date:** 2026-09-02 · **Closes:** Q17 · **Status:** accepted

- `owner_id` = Better Auth `user.id` (the identity authority; already built).
- Exactly **one `hello` per owner** in v1, auto-created on first membrane write. `hello_id` is the tenant/runtime handle (= the future Durable Object).
- Cross-channel **identity convergence** (one hello per verified human across email/Telegram/etc.) is deferred; channels attach to an existing `owner_id` later.

## ADR-0003 — Membrane = Postgres RLS, forced, tenant-scoped per transaction
**Date:** 2026-09-02 · **Closes:** Q3 · **Grounded in:** `DATA-MODEL.md §7` · **Status:** accepted

- `ENABLE` + **`FORCE ROW LEVEL SECURITY`** on every tenant table (force, because the app currently connects as the table owner, who otherwise bypasses RLS).
- Tenant context set via **`SET LOCAL app.owner_id = <id>`** inside an **interactive transaction** — never session `SET`.
- Because `SET LOCAL`+query must share one transaction, the **membrane data-path uses the Neon serverless Pool (WebSocket) driver** (`drizzle-orm/neon-serverless`). Auth keeps the stateless **neon-http** driver (works, no RLS-transaction need).
- **A dedicated non-owner role (`helloo_app`, `NOBYPASSRLS`) is REQUIRED, not optional.** Verified 2026-09-02: Neon's `neondb_owner` has `rolbypassrls = true`, so `FORCE` alone does nothing — the self-test showed a stranger reading another tenant's row until the runtime connected as `helloo_app`. Auth/migrations use the owner url (`DATABASE_URL`); the membrane uses `APP_DATABASE_URL` (the app role) exclusively. Role is provisioned by `packages/db/scripts/create-app-role.mjs` with least-privilege grants on `hello`/`atom`/`audit` (+ default privileges for future membrane tables).
- **Proven** (`membraneSelfTest`, run in-Worker 2026-09-02): owner writes+reads its atom; a different tenant sees **0 rows** (`isolated: true`). Wire this into CI when CI exists.

## ADR-0002 — Memory record layer = Option B (versioned bi-temporal table + separate audit)
**Date:** 2026-09-02 · **Closes:** Q2, Q39 · **Grounded in:** `DATA-MODEL.md` Option B + "How to choose" · **Status:** accepted

- Adopt **Option B**: the `atom` table **is** the record — bi-temporal, **versioned in place** (non-destructive supersede: close the old row, open a new version; never mutate/erase). A **separate append-only `audit` log** covers trust/actions only.
- **Not** full event-sourcing (Option A). Rationale (straight from the doc's recommendation): pre-PMF, tiny team, ship fast, **GDPR hard-delete matters early**, every Postgres engineer can operate it, memory stays **decoupled** from the runtime. Move memory to a unified event log later **only if** a concrete tamper-evidence/compliance need appears.
- **Unchanged either way** (built in later slices): `edges`, tiered `context_nodes` (L0/L1/L2), vector/keyword indexes, `policies`, `permission_requests`, `counters`, and the whole recall + write path.

## ADR-0001 — Runtime & source of truth
**Date:** 2026-09-02 · **Closes:** Q1 · **Grounded in:** `ARCHITECTURE.md`, `DATA-MODEL.md §Principles` · **Status:** accepted

- **Postgres (Neon) is the single system-of-record** — durable, queryable, RLS-enforced truth. **Single-master.**
- **Durable Objects are the per-hello runtime/compute** (active agent loop, hot conversation state, locks, alarms) — **not** a second source of truth; DO durably persists to Postgres.
- Split **record** (owned, deterministic) from **index** (rebuildable): vector/graph/tier indexes are projections; if recall is wrong, rebuild the index, never touch the record.

---

### Deferred (recorded so we don't forget)
- **Recall/index layer** — multi-signal RRF retrieval (Q37), atom-to-atom edges/multi-hop (Q14), tiered L0/L1/L2 + hierarchical drill-down (Q15/Q36), reranker (Q13). Built after the record layer.
- **Fact pipeline** — LLM extract → reconcile (ADD/UPDATE/DELETE/NOOP) → confirm. Needs an LLM key; comes after the record layer lands.
- **GDPR crypto-shred / erasure cascade** (Q16) — easier under Option B; specify when we touch deletion.
</content>
