# Hub Deep-Dive: MEMORY

> One of the two hubs the whole product sits on (the other is [Trust/Approvals](HUB-TRUST.md)). This is a design + system brief — the data model, the read/write paths, the surfaces and their states, the interconnections, and how it should *feel*. It's what the UX team designs from and what devs build against. Proposal, not decision; open calls flagged inline (`QUESTIONS.md` Q2, Q12–Q17).

## Why memory is a hub
Almost every feature reads from or writes to memory: Conversation recalls it, People is a view of it, Commitments is a *typed projection* of it, Automations compose over it, the Membrane governs it, Federation shares slices of it. **Its quality caps the product's quality.** The market's #1 unmet need is memory that's *trustworthy, owned, and inspectable* — so this is also the differentiator.

## The core idea: split the RECORD from the INDEX
- **Record = the truth.** Deterministic, versioned, owned. Built as an append-only event log → reduced to current "atoms." *(Implementation — full event-sourcing vs a versioned bi-temporal table — is open, Q2. The capabilities below hold either way.)*
- **Index = a rebuildable convenience.** Vector + graph indexes derived from the record; if recall is wrong, rebuild the index, never touch the record.

## Data model (conceptual)

**Event** (append-only): `type` (ASSERT | SUPERSEDE | FORGET | CORRECT) · `atom_ref` · `payload` · `actor` (who/what asserted — a channel, an integration, the user, another hello) · `source_ref` (provenance) · `confidence` · `recorded_at`.

**Atom** (current-state projection): `subject · predicate · object` (a typed fact) · **bi-temporal** `valid_from/valid_to` (world-truth) + `recorded_at/expired_at` (system-time) · `visibility` (private | shared | org) — *the membrane* · `provenance[]` (event + source spans) · `confidence` · `last_confirmed_at` · `salience`.

**Edge**: `atom → atom` relation (enables multi-hop; a relations table + traversal, not a graph DB).

**Indexes** (derived, disposable): vector (Vectorize) · entity/graph · keyword.

## The write path (how a fact enters)
1. **Ingest** raw evidence (a message, an email via WATCH, a doc) — *evidence is not memory*.
2. **Extract** candidate facts (LLM) → **proposed events** with confidence.
3. **Reconcile** against top-k neighbors — an **ADD / UPDATE / DELETE / NOOP router** (a proven write-time reconciliation pattern). "UPDATE" = **supersede** (close old `valid_to`, open new), never erase → contradictions never silently pile up.
4. **Confirm** — low-confidence or ambiguous → a review-queue item (surfaced in "memory health"); default fail-safe to `private`.
5. **Append** the event → **reduce** to atoms → **re-index**. Writes are async; the record is the source of truth.

## The read path (recall)
1. Embed the query (context-threaded).
2. **Multi-signal retrieval** — semantic + entity + temporal (the proven fusion pattern) — *never single-vector* (our #1 current gap, Q13).
3. **Membrane filter** — RLS + recall-time filter drops anything the caller may not see (private never leaks — enforced below the model).
4. **Rerank** (LLM reranker) + **tiering/budget** — an always-hot "working memory" block + retrieved atoms + cold archive, trimmed to a token budget (the proven tiering pattern, Q15).
5. Return atoms **with provenance** so the UI can show "why."

## The 6 upgrades that make it best-in-class
1. Multi-signal recall + reranker (not single-vector). 2. Atom-to-atom edges (multi-hop). 3. Write-time reconciliation router. 4. Tiering + context budgeting. 5. Decay + usage-reinforcement (reinforce on *confirmation*, not retrieval; salience floor). 6. Real GDPR-erasure cascade (never fine-tune embeddings on user data).

## Surfaces & their states (for UX)

| Surface | What it is | Key states to design |
|---|---|---|
| **Memory list / timeline** | Everything helloo knows about you | rich vs sparse · grouped by source/type · a "changed/superseded" item · a forgotten (tombstoned) item |
| **Provenance popover — "why do you know this?"** | Source + when-learned + confidence on any fact | high vs low confidence · single vs multiple sources · derived (inferred) vs stated |
| **Inspect / edit / forget** | Correct or remove a fact | edit-in-place (writes SUPERSEDE) · forget one · "forget everything from source X" · confirm-forget (irreversible framing) |
| **Time-machine** | "What did you believe about X last month" | now vs as-of-date · a fact that changed between then and now |
| **Memory health** | Review queue: stale to confirm, duplicates to merge, low-confidence | nothing to review · a batch · a merge suggestion (reversible) |
| **People** (graph view) | Relationship graph over entity atoms | known vs external contact · merge suggestion · privacy-limited person |

## Interconnections (the wiring)
- **An edit/forget writes a new event → instantly changes recall everywhere** (Conversation, Automations, Brief, People). The Memory view is a *write surface disguised as a viewer*.
- **Per-source scope (Connections) sets each atom's default `visibility`** → governs recall, People, Org-brain, and what Federation may share. One classification, platform-wide.
- **Commitments = a typed projection** of the same pipeline (owner/counterparty/due/status atoms).
- **The Membrane control** is the human-facing face of the `visibility` field.
- **Federation** exposes only `shared`+ atoms across a hello boundary — private is checked below the model.

## How it should feel (UX principles)
- **Calm and yours.** This is the "it's mine" promise made tangible — not a scary database. Plain language, not schema.
- **Always answer "why."** Provenance is one tap from any fact; trust is built by showing the receipt.
- **Forgetting is real and easy.** One tap; honest about what's removed (and that "forget" truly cascades, not a fake toggle).
- **Show change, don't hide it.** When helloo's understanding updated, say so ("you moved to Berlin — updated"), don't silently rewrite (the ChatGPT "Dreaming" anti-pattern).
- **Low-confidence asks, doesn't guess** — surfaces "is this right?" instead of asserting.

## Open questions → engineers
Q2 (event-sourcing vs versioned table) · Q12 (reconciliation semantics) · Q13 (multi-signal retrieval + latency budget) · Q14 (multi-hop without a graph DB) · Q15 (tiering/budget) · Q16 (GDPR erasure cascade) · Q17 (cross-session identity).

## Design references (patterns, not sources)
Proven patterns adopted from prior art (reimplemented; some upstream sources are copyleft, so nothing is vendored):
- **Tiered loading + hierarchical retrieval** (the answer to gaps #1 and #4): every entry gets an **L0 abstract (~256 chars → vector search)**, **L1 overview (~4000 chars → rerank/navigation)**, **L2 = full detail on demand** → ~90% token savings. Retrieval finds the best *directory/context node* first, then drills down with **score propagation**, so results arrive *with surrounding context*, not flat chunks. Every query keeps an **observable trajectory** ("why did I recall this"). **Design fork → Q36:** keep the bi-temporal *atom record* but adopt tiered summaries + hierarchical retrieval as the *index/recall* layer (likely best of both).
- **Multi-signal recall via Reciprocal Rank Fusion** over keyword + dense vectors + graph traversal, with session diversification (gap #1, Q37).
- **Supersession chains:** edits/forgets create new versions; superseded atoms leave the index but keep full history + provenance — our non-destructive edit/forget. Plus **forget-with-audit-trail**, tier consolidation, and decay curves (gap #5).
- **Memory mirrored to human-readable files** (an editable vault) so users inspect/edit without a black box (Q38); aggressive compression of tool output before the model sees it.
- **Provenance as first-class fields** on every record (author, origin, model-visibility = a membrane primitive); **compaction-as-projection** — summarization changes the model-input projection, never the canonical record (validates our record-vs-index split).
