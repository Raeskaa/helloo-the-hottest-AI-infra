# Decisions (ADR log)

> Locked architectural calls, newest first. Each cites the `QUESTIONS.md` fork it closes and the doc it's grounded in. A decision here overrides the "proposal, not decision" framing in the design docs. Reopen only with a new ADR that supersedes.

---

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
