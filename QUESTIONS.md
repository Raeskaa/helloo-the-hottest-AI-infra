# helloo — Open Questions for Engineers

> **We're looking for real engineering judgment before we write new code.** The founder is a designer, not an engineer — so this doc lays out the genuinely-open architecture calls in plain terms, with the trade-offs and our *tentative lean* (a lean, **not a decision** — nothing here is settled). If you build systems like this, please weigh in: open a GitHub issue, comment inline, or PR a change. Blunt disagreement is the most useful thing you can give us.
>
> Context: [`SYSTEM-MAP.md`](SYSTEM-MAP.md) (how it works), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (decisions + why + sources), [`VERSIONS.md`](VERSIONS.md) (v1/v2/v3). Each question notes the sources behind it.

---

### Q1 — Data layer: is the Postgres-record / Durable-Object-runtime split right, and is "single-master" the correct discipline?
The plan: **Postgres + RLS** is the durable system-of-record + tenant membrane; **Cloudflare Durable Objects** hold each user's live/hot state and run the agent; DO → Postgres sync is **one-way** (never dual-write the same field). Engineers endorse the split as textbook, but warn that two authoritative stores for the same data = Kleppmann's dual-write anti-pattern.
- **Ask:** Is single-master one-way sync (DO live → Postgres record) the right reconciliation? Or should we collapse to one store (all-Postgres, or all-DO) for v1 simplicity? Where exactly is the master for each kind of data (session vs durable memory)?

### Q2 — Memory implementation: full event-sourcing vs a versioned bi-temporal table? *(the biggest one)*
The founder wants **comprehensive memory from day 1** — versioning, time-travel ("what did it believe when"), correction, provenance, inspect/edit/forget, the membrane. Those *capabilities* are fixed. The **implementation** is open:
- **Option A — hand-rolled event sourcing** (append-only event log → deterministic reduce → current atoms). Maximally auditable/replayable. Red-team warns: event sourcing is a top career-regret when hand-rolled, painful to evolve, and GDPR-delete on an immutable log needs crypto-shredding.
- **Option B — versioned bi-temporal table** (`valid_from/valid_to` + `recorded_at/superseded_at`, soft-supersede, one "current" view). Same user-facing capabilities, far simpler to operate, GDPR-deletable, every Postgres engineer can run it.
- **Our lean:** B, unless you see a reason A is worth the cost. **Ask:** which, and why? Does personal-AI memory genuinely need event-sourcing, or is a temporal/audit table sufficient?

### Q3 — Is Postgres RLS trustworthy as the membrane, and what's the defense-in-depth around it?
RLS is the non-bypassable tenant boundary. Practitioners say it holds at scale but **nobody uses it as the *only* layer.** Known footguns: `SET` vs `SET LOCAL` (pooling leaks tenant context — the #1 bug), owner/`BYPASSRLS` bypass, missing `(tenant_id, …)` composite indexes (2-orders-of-magnitude slowdowns), fail-open on unset variable.
- **Ask:** Do you trust RLS as the membrane with the standard guardrails (`FORCE RLS`, `SET LOCAL` via a pooler-safe wrapper, composite indexes, fail-closed) **plus** app-layer tenant checks? Or do you prefer schema-per-tenant / DB-per-tenant / per-user DO isolation for the strongest cases?

### Q4 — Security for v1: how much is enough? Is CaMeL a v1 thing or a research bet?
Prompt injection is unsolved (recent papers defeat 12 defenses at >90%). The pragmatic v1 posture we lean toward: **Meta's "Rule of Two"** + default read-only agents + scoped short-lived tokens + approve-before-act on writes + default-deny egress allowlist + audit + RLS. The full **CaMeL / dual-LLM / provenance-taint** system is a 2025 research paper (~67% block rate, no production implementation) — we'd defer it to v2+ and use a lightweight trusted/untrusted *flag* in v1.
- **Ask:** Is the v1 posture responsible enough to launch an agent that acts on real accounts? What would you add or remove? Is deferring full CaMeL correct?

### Q5 — Cloudflare Durable Objects: right foundation, or lock-in/limits we'll regret?
DO per user is "in the sweet spot" for a per-user agent, but has real edges: single-writer throughput per object, a **2 MB default state-blob ceiling** (open bug #546 that hits long AI conversations), per-index write cost, hibernation-or-else billing, and vendor coupling (softening via celld/API-compat).
- **Ask:** Bet on DO + Workers as the runtime (with state sharded into SQLite tables, SDK wrapped)? Or run a more portable stack (normal server + Postgres, or a Temporal-style durable-workflow engine) from the start?

### Q6 — Are we over-engineering v1? What would you cut or defer?
A red-team's blunt take: a pre-user team planning event-sourcing + graph + RLS + CaMeL + registry + workspaces + BYO-agents + on-device models + voice + open-core is "building infrastructure for a city with no citizens." We've responded by sequencing into v1/v2/v3 ([`VERSIONS.md`](VERSIONS.md)) and keeping v1 to *owned memory + safe action + channels* in one dogfooded app.
- **Ask:** Is v1 (as scoped in VERSIONS.md) still too big? What would you pull out to ship faster? What's the single most valuable thing to build first?

### Q7 — Interop timing: build the MCP/A2A registry + BYO-agents in v1, or later?
We lean: **consume** MCP tools and **expose** helloo as an MCP server in v1 (high leverage, low cost); **defer** the agent *registry/marketplace* and full BYO-agent to v2/v3 (network-effects products that need users/agents to matter).
- **Ask:** Right call? Any reason BYO-agent (A2A) needs to be earlier?

### Q8 — Model portability & on-device (helloo-ai): when, and how coupled?
v1 uses hosted models behind a provider-agnostic layer. helloo-ai (on-device task models = one base + LoRA adapters, hybrid fail-closed routing) is v2. Risk flagged: a base-model update can silently invalidate shipped adapters; needs versioned base↔adapter compatibility + tested OTA.
- **Ask:** Is on-device rightly v2? How would you structure the local↔cloud routing and the model-portability abstraction so we're not locked to one provider?

---

---

## Part 2 — The society of hellos (agents, cross-hello federation, orgs)

### Q9 — Autonomous hello ↔ hello: how do we bound "no human intervention"?
Two users' hellos can interact autonomously (A2A + signed Agent Cards) — e.g. negotiate a meeting. The plan bounds this with a pre-authorized per-user policy + OBO tokens + membrane + consent + audit + spend caps.
- **Ask:** What does the per-user "autonomy policy" actually look like (a capability list? a budget? per-counterparty rules?)? How does my hello *prove* to yours what it's authorized to do, and how do we stop an injected/compromised hello from manipulating another? Is Rule-of-Two enforceable across a two-hello exchange?

### Q10 — Membrane across a hello boundary
Inside one user, the membrane separates private/shared. Across hellos, my *private* atoms must never reach your hello — even when they'd give a better answer.
- **Ask:** Where is that boundary enforced when two hellos exchange context over A2A — at the token scope, at recall time, at the Agent Card contract, or all three? How do we prevent embedding-neighbor bleed leaking a private atom into a "shared" cross-hello response?

### Q11 — Org tenancy: hellos in orgs, one hello in many orgs
An org holds many hellos; a hello belongs to many orgs (person-in-many-workspaces). Memory scopes personal/org-shared/cross-org.
- **Ask:** Is the org a tenant in the same RLS model, or a separate construct? When a hello acts inside Org A, how do we guarantee it can't read/act with Org B's context, and how do org-level policies compose with the individual's autonomy policy (Q9)? What happens to org-shared memory when a hello leaves the org?

---

## Part 3 — Per-layer benchmark questions

**Memory** — Q12 reconciliation semantics (UPDATE-as-supersede vs competing atom; LLM router vs rules?) · Q13 retrieval beyond single-vector (where do entity/temporal filtering + reranking live; p95 budget?) · Q14 multi-hop without a graph DB (atom-edges table + traversal, or flat?) · Q15 context budgeting/tiering (always-in-context working block vs retrieved vs cold; packing algorithm?) · Q16 GDPR true-erasure cascade (vector + row + summaries + caches; ever fine-tune embeddings on user data?) · Q17 cross-session identity resolution (is the owned record the identity anchor?).

**Agents & loops** — Q18 checkpoint per-step vs per-turn (resume a half-finished turn after DO eviction mid-tool-call?) · Q19 step/token/wall-clock budget per loop and behavior at the cap · Q20 stuck-loop detection · Q21 is the plan an editable persisted artifact?

**Tools & skills / MCP** — Q22 context budget for tool metadata; when switch to progressive disclosure / code-execution? · Q23 per-agent/per-session tool-scoping (least-privilege allowlist?) · Q24 validate tool *responses* at runtime, not just descriptions at connect? · Q25 is our MCP server genuinely stateless; tokens audience-bound (RFC 8707)? · Q26 patched against the May-2026 SDK-level MCP flaw across every language SDK we embed?

**Durable / proactivity** — Q27 which actions run in a Workflow (step-durable) vs the DO loop, and how do we make tool calls idempotent so a replay doesn't double-send/charge? · Q28 how does a proactive wake-up reconcile with a user mid-conversation (queue/interrupt/merge)?

**Integrations** — Q29 REMEMBER conflict resolution across channels (provenance+confidence+timestamp policy at read time; who breaks ties?) · Q30 proactive-assistant cost model under per-tool-call pricing → self-host Nango or build hot-path natives?

**Channels** — Q31 WhatsApp survival outside the EU (structured-only / route to Telegram+RCS / geo-fence — enforced how without a ban-triggering footprint?) · Q32 the per-channel renderer contract (one answer → Block Kit / Telegram buttons / terse SMS / voice).

**Voice** — Q33 fast-model-for-the-spoken-turn + big-model-async: how do we cancel/replace an in-flight TTS utterance when the async answer changes mid-sentence? · Q34 on-device wake→cloud handoff (raw audio vs transcript; Voice-ID failure; always-listening buffer privacy contract).

**Inside other apps** — Q35 when embedded in ChatGPT/Claude the *host* model picks our tools — how do we stop a prompt-injected host context from triggering a write action, and do write tools need a helloo-side confirmation independent of the host?

---

---

## Part 4 — Questions from prior-art patterns

### Q36 — Memory model: atom store vs a tiered context-filesystem vs both?
A studied design stores memory + RAG + skills as one addressable filesystem with **L0/L1/L2 tiered summaries** and **directory recursive retrieval** (~90% token savings, results with surrounding context). Our plan is bi-temporal *atoms*.
- **Ask:** Keep the atom *record* (versioning/provenance/membrane) but adopt tiered summaries + hierarchical retrieval as the *index/recall* layer (best of both)? Or is the filesystem model the better primitive outright?

### Q37 — Recall algorithm: adopt Reciprocal Rank Fusion?
A proven approach fuses keyword + dense vectors + graph traversal via **RRF** with session diversification.
- **Ask:** Is RRF over (keyword + vector + entity/graph) our default recall, run in a Worker in front of Vectorize? What's the p95 budget?

### Q38 — Memory transparency: mirror to human-readable files?
A studied local-first design mirrors memory to an **editable Markdown vault** so users inspect/edit by touching files ("no black box").
- **Ask:** Do we mirror the atom store to human-readable files (or export) for the inspect/edit/forget UX, alongside the DB — and how do we keep the two in sync without a dual-write bug?

### Q39 — Trust audit spine: one append-only event stream?
A studied local-first agent workspace records model messages, tool calls, **permission decisions, and termination as kinds of one append-only event log**; everything else is a projection; handshake keyed by a `request_id`; tamper-evident via a canonical digest.
- **Ask:** Should our audit spine *be* this single event stream (and should it share the Memory record's event log)? Adopt the `request_id` handshake + a risk-category permission taxonomy?

### Q40 — The real isolation boundary (not the UX)
A hard lesson from prior art: *"the OS is the boundary, the engine is the UX"* — an in-process permission engine is not a security boundary.
- **Ask:** Under our approval UX, what is helloo's actual OS/process/network isolation on a Cloudflare-DO runtime — a per-run container + a default-deny egress allowlist? Is that boundary strong enough for agents acting on real accounts? (Both options specced in [`docs/HUB-TRUST.md`](docs/HUB-TRUST.md).)

---

**How to respond:** open an issue per question (title `Q<n>: …`), comment inline, or PR edits. Highest-leverage: **Q2** (memory implementation), **Q6** (is v1 over-scoped), **Q9** (autonomous-federation safety), **Q13/Q37** (recall), **Q39** (audit event model), **Q40** (real isolation boundary). The two hub deep-dives are [`docs/HUB-MEMORY.md`](docs/HUB-MEMORY.md) and [`docs/HUB-TRUST.md`](docs/HUB-TRUST.md), and the strawman schema is [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md). Thank you — genuinely.
