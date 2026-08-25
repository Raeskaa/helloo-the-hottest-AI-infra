# helloo — Architecture Decision-Space

> The open architecture questions the platform must answer, organized as pillars — now with concrete recommendations from the 2026-08-25 research pass (memory · security · interop/channels · on-device model). A living reference, not a finished spec.

Organizing frame: **two assets we own** (memory, trust) + **four walls to beat** (security, reliability, cost, monetization) + **cross-cutting** (interop/channels, retention) + **the on-device model** (helloo-ai).

**The through-line the research kept surfacing:** build on the **Cloudflare Agents SDK (Durable Objects)** — it is the one foundation that recurs as the right answer across interop, security, *and* memory, because helloo already runs on Workers and it uniquely gives durable per-user agent instances + native channels + MCP server/client + per-agent SQLite. Keep the LLM behind the **Vercel AI SDK provider layer** for model-portability. Consume **MCP** (tools + self-exposure) and **A2A** (agent-to-agent / BYO). None of these is the moat — they're the substrate.

---

## Reality check — red-team verdicts (proposals, pending engineering confirmation)

Two red-team passes (engineer/forum opinion, HN, practitioner blogs) stress-tested every decision. **None of these is settled by us — they are proposals for the engineering team; the live decision points are in [`QUESTIONS.md`](../QUESTIONS.md), and the build order is in [`VERSIONS.md`](../VERSIONS.md).** Verdicts:

- **Runtime — Durable Objects per user: KEEP, with guardrails.** In the sweet spot for a per-user agent. Guardrails: shard memory into SQLite tables (not the 2 MB default state blob — open bug that hits long AI chats); index sparingly; design for hibernation; wrap the Agents SDK (its high-level surface churns).
- **Data split — Postgres record / DO runtime: KEEP, but single-master.** Correct separation *iff* one-way sync (DO live → Postgres record); never dual-write the same field (Kleppmann). (→ Q1)
- **Membrane — Postgres RLS: KEEP, never as the only layer.** `SET LOCAL` + `FORCE RLS` + composite `(tenant_id,…)` indexes + fail-closed **plus** app-layer checks. (→ Q3)
- **Memory — event-sourcing: SIMPLER ALTERNATIVE FLAGGED.** Comprehensive capabilities stay (founder's call); the *implementation* is open — full event-sourcing vs a **versioned bi-temporal table** (same capabilities, far cheaper to run, GDPR-deletable). Lean: the table. (→ Q2, the biggest one)
- **Security — CaMeL: DEFER.** It's a 2025 research paper (~67% block, no production impl). v1 = Meta's **Rule of Two** + read-only-default + scoped short-lived tokens + approve-before-act + default-deny egress + audit + RLS. CaMeL/provenance-taint is a v2+ research track. (→ Q4)
- **Scope — over-engineering: SEQUENCED, not cut.** A pre-user team building all of this at once is "infrastructure for a city with no citizens." Response: v1 = *owned memory + safe action* in one dogfooded app; platform pieces (registry, BYO-agents, on-device family, open-core, cross-org) sequenced into v2/v3. Nothing removed. (→ Q6, `VERSIONS.md`)

The sections below remain the north-star architecture; read them through this reality check.

## Foundation decision (proposed, engineer-reviewed)

- **Runtime:** Cloudflare Agents SDK on Durable Objects. Each user's helloo = a durable, addressable DO holding state (`setState`) + a per-agent SQLite DB; native ingress for web/WebSocket/email/Slack/webhook/voice; durable scheduling; MCP server (`createMcpHandler`, stateless per MCP v2) + MCP client built in; per-run container isolation via the Sandbox SDK.
- **Model portability:** Vercel AI SDK provider interface inside the Worker (don't move to Vercel's runtime; just use its abstraction). No single-vendor lock.
- **Interop:** **MCP = vertical** (helloo→tools, and helloo-as-MCP-server so it's reachable inside Claude/ChatGPT/Cursor). **A2A = horizontal** (BYO/third-party agents plug in via signed **Agent Cards**; helloo orchestrates). Both are now under the Linux Foundation's Agentic AI Foundation — safe long-term bets.
- **Fallback:** an OSS TS agent framework (deploys to Workers) if we ever want higher-level workflow ergonomics or to leave Cloudflare.

---

## Asset 1 — Memory architecture *(resolved design)*
*"Deterministic, versioned, inspectable, owned" + cross-assistant portable.*

**Split the record from the index** — the key insight. No off-the-shelf tool gives all four properties because they conflate two concerns:

- **Authoritative memory (the record) — BUILD.** An **event-sourced, bi-temporal store of "atoms."** Raw turns are *evidence*, not memory. Every change is an immutable event (`ASSERT` / `SUPERSEDE` / `FORGET` / `CORRECT`); current state = a **pure deterministic reduce** over the log → gives deterministic (replayable), versioned (`fold(events[:t])`), inspectable/diffable all at once. Store **valid-time vs learned-time** (a proven temporal-graph bi-temporal model) + **provenance** on every atom. Lives on **Cloudflare DO + D1 + R2** (per-user DO = natural single-writer boundary).
- **Recall (the index) — ADOPT & treat as disposable.** Vector recall via **Cloudflare Vectorize** + a lightweight edge/graph table, both **rebuilt from the atom store**. Recall is probabilistic and that's fine — it's never the source of truth. Make it *testable* with a golden set of (query → expected atom ids).

**Adopt:** Vercel AI SDK (raw turn capture), Cloudflare Vectorize (recall), a temporal-knowledge-graph *bi-temporal design* (copy the model, don't run a Python graph DB), a client-side file-ops memory pattern (over storage you own). **Optional:** a TS memory framework for ergonomics (Vectorize adapter). **Stopgap only:** a Cloudflare-native managed memory service (closed/metered — migrate off).
**Don't run in-stack:** Python + persistent-DB memory engines — they break the edge/ownership model. Mine their ideas (the ADD/UPDATE/DELETE reconciliation loop, tiering + git-style history) as *proposed events* the reducer/user confirm — keeping LLM nondeterminism out of the record.

**Portability:** expose the atom store as an **MCP memory server** on the same DO (`memory.search/get/assert/supersede/forget/list/diff`). Identity: a **helloo-owned identity broker** maps each assistant's principal → one canonical `subject_id` via explicit account-linking (never fuzzy name/email matching). Gate external *writes* behind confirmation (write-as-proposed-event) so ChatGPT can't silently pollute what Claude reads; scope reads with capability tokens; stamp provenance on every write.

**Hardest unsolved:** staleness (model as explicit `SUPERSEDE` + read-time confidence decay, never hidden background rewrites), entity/identity resolution (proposed links with confidence + provenance, reversible), temporal reasoning (the bi-temporal model is what makes "as of when" answerable *and* the system testable).

---

## Asset 2 — Trust / security architecture *(the moat — resolved stack)*
*"Private data vs leak."* Hardest, most defensible pillar. **The defense is architectural, not a filter** — no classifier is safe because "the attacker moves second." helloo sits inside the **lethal trifecta** (private data + untrusted content + external comms) by construction.

**Threat model:** indirect prompt injection → exfiltration (send, but also image URLs, links, webhooks); goal hijacking (OWASP agentic #1); confused-deputy cross-account; MCP tool-poisoning/supply-chain; multi-tenant leakage; control-plane privilege-escalation (cf. OpenClaw CVE-2026-33579). Proven real (Johns Hopkins hijacked Claude Code/Gemini CLI/Copilot via poisoned PR titles, Apr 2026).

**The stack to build on (layered):**
1. **Rule of Two (Meta):** never let one context hold all three trifecta legs. Decompose: a **quarantined** sub-agent reads untrusted content (no send/write); a **privileged** sub-agent plans + acts only on *structured, validated* values.
2. **CaMeL-style provenance tagging (BUILD — core moat):** every field tagged `trusted|untrusted` at ingestion; consequential tools **refuse untrusted-tagged values** for security-critical args (recipient, URL, amount, file-to-share) → escalate instead of blocking wholesale.
3. **Capabilities, not impersonation:** OAuth 2.1/PKCE + Token Exchange **on-behalf-of** tokens — scoped, attenuable, time-boxed, auditable. A Cedar-style deterministic policy engine outside the model.
4. **Approve-before-act, fatigue-tuned:** gate external/irreversible/high-value/new-counterparty/untrusted-arg actions; **don't** gate read-only/internal/repeat-to-approved (approval fatigue is what kills gating). Adopt a framework primitive: Vercel `needsApproval` / LangGraph `interrupt()` / Cloudflare `waitForApproval`.
5. **Sandbox + egress allow-list:** per-run isolated container (Cloudflare Sandbox); allow-list outbound hosts so an injected exfil URL is physically unreachable.
6. **Membrane = Postgres RLS** (`ENABLE`+`FORCE`, non-owner app role, `SET LOCAL` per-txn — the #1 silent-leak footgun, tenant-leading indexes). Enforced below the model; prove it in CI (wrong tenant → zero rows, index scan intact). Guard the control plane's own scope-forwarding (the CVE-2026-33579 lesson).
7. **Audit + spend/action caps:** every tool call logged with the OBO delegation record; per-tenant cost + action circuit-breakers + kill-switch.

**Adopt vs BUILD:** adopt the HITL primitives, OBO tokens, RLS, policy engine, sandbox. **The moat is the *integration*** — the provenance/data-control-separation engine + fatigue-tuned gating + a unified audit/spend plane, productized for real personal accounts. Nobody ships that turnkey.

**Honest limit:** letting a fully autonomous agent hold all three legs with no human is *unsolved*. CaMeL + Rule-of-Two + capabilities + sandbox + HITL raise the bar; they don't close it.

---

## Wall 1 — Reliability
Deterministic **workflows with LLMs at the seams** (practitioner consensus) over open-ended autonomy; **checkpointed state** (DO SQLite / LangGraph-style) so a session knows "where the work stands" (lost state, not model capability, is the #1 failure). Open q: loop shape; when sub-agents; verification before acting.

## Wall 2 — Cost
**Efficient recall** (don't pass everything every turn — the atom store + scoped retrieval helps), **model-tiering** (local/small model for cheap tasks → cloud for hard; see helloo-ai + hybrid routing), **spend caps as a feature**. Cost-per-value is under a microscope in the discourse.

## Wall 3 — Monetization
Open-core (free self-host) + hosted premium (managed memory, workspaces/orgs, governance/compliance, channel gateway, registry). Money follows **memory infra + team/org brains**. Open q: exact core/premium line; pricing between ~$20 consumer and ~$30–50 team seats.

## Wall 4 — Ownership & deployment
Open-core packaging; BYO-keys/model; local-first; data residency. helloo-ai (below) is the technical embodiment of "owned."

---

## Cross-cutting — Interop, channels & the agent ecosystem *(resolved model)*
- **BYO / third-party integration model:** native agents = a Cloudflare `Agent` (DO) that auto-generates an MCP server (its skills) + an A2A Agent Card (identity). **Bring external agents** = accept signed A2A Agent Cards / endpoints; **external tools** = register MCP servers (discover via the official MCP Registry). **helloo Registry** = a superset index of MCP tools + A2A agents **plus the governance layer** (scopes, consent, verification, audit) the base protocols omit — this is a place to add value, since MCP/A2A standardize connectivity *not* governance.
- **Ecosystem blueprints:** Google (Agent Cards + marketplace gallery), Shopify (MCP-first commerce agents), MCP Registry (discovery/verification).
- **Channels:** one durable DO agent per user; thin, swappable channel adapters normalize inbound events to a common envelope; context carried across channels, presentation adapted per channel. **MCP-into-host-LLM (Claude/ChatGPT/Cursor) is itself a first-class channel** and the highest-leverage reach move.
- **Voice (helloo Voice) — a first-class surface, two modes:** (1) **ambient earphone/hearable** — on-device wake-word + VAD ("Hey helloo"), streaming STT→agent→TTS, hands-free; the wake-word + fast local turns are a natural job for **helloo-ai** (on-device, private, low-latency). (2) **telephony** — helloo is a dialable number (Twilio/Vapi/Telnyx-class), inbound *and* outbound (it can call you proactively). Both ride the same DO agent + memory, and voice-triggered actions pass the **same approve-before-act trust gate** as any other surface (a spoken "send it" still confirms).

  **Hardware strategy (resolved): software-first, telephony-anchored; hardware only via partner, later and optional — do NOT build a device now.**
  - **Telephony needs zero hardware and is fully yours** — production-grade in 2026 (~1.3–1.6s response, ~$0.07–0.25/min; Vapi fits a custom persona). This is the reliable hands-free path.
  - **The ambient-earbud experience is platform-gated, so building hardware wouldn't fix it:** iOS offers no custom OS wake-word (Siri-gated); **AirPods block third-party wake words**; classic Bluetooth can't do hi-fi audio + mic simultaneously (A2DP↔HFP; LE Audio not broadly deployed). **Android is the open path** (foreground-service wake word, <2% CPU via Porcupine/Picovoice/Sensory). iOS app = best-effort with a visible-mic caveat.
  - **Don't build a device:** the wearable market consolidated into Meta (Limitless, Dec 2025) / Amazon (Bee, Jul 2025); standalone gadgets flopped (Humane Pin, Rabbit R1); a first SKU is a 7-figure, 12–24-month build with FCC/CE/BT-SIG certs + molds + inventory + fire-safety liability. Winners "improve what people already wear" (Meta Ray-Ban, 7M+ units) — unwinnable for a small team.
  - **If ambient is later validated:** prototype on open-source **Omi/Based Hardware**, then white-label via **Sensory/Picovoice** onto someone else's certified hearable — never from scratch.
  - Open q: barge-in/latency budget; local vs cloud turn routing (hybrid rules); wake-word privacy (audio stays on-device until wake).
- **⚠️ WhatsApp:** general-purpose-bot ban (Jan 15 2026), **but EU/EEA reversal Jul 13 2026** after antitrust — viable in EU, not rest-of-world. Never load-bearing; always a swappable adapter; scope to structured flows if used outside the EU.

## Cross-cutting — The society of hellos (agents · cross-hello federation · orgs)

Three nested scopes of agent interaction, each with its own trust boundary:

1. **Intra-hello (agents within one hello).** Single **orchestrator** + **ephemeral fresh-context sub-agents** on isolated-SQLite DO facets; no shared mutable state (the settled 2026 multi-agent pattern — Cognition/Anthropic). They share the hello's memory + trust layer. *(orchestrator v1; sub-agents v1/v2.)*
2. **Inter-hello (agent ↔ agent across users), autonomous.** Over **A2A**: each hello publishes a signed **Agent Card** (identity + advertised capabilities); hellos discover, delegate, and negotiate *without their owners in the loop* ("our two hellos find a meeting time"). Autonomy is **bounded by a pre-authorized per-user policy** — what your hello may share / agree to / spend autonomously and with whom; anything outside escalates back to you. Enforced by scoped **OBO delegation tokens** + the **membrane** (private atoms never cross a hello boundary, checked below the model) + **consent records** + **audit** + **spend/action caps**. This is the platform's **largest attack surface** (an injected hello could try to manipulate another) → gated hardest, **v2/v3**. Steal: A2A Agent Cards + Google's marketplace identity model; Rule of Two applies to *every* autonomous exchange.
3. **Organizational (hellos in orgs).** An org holds many hellos; a hello belongs to many orgs (person-in-many-workspaces). Memory scopes: personal / org-shared / cross-org, under the membrane + org-level policy governing what member hellos may do/share. Maps onto the dormant `teams` schema + RLS. *(v2.)*

**Why A2A, not a bespoke protocol:** the value *and* the risk are the **governance** (consent, scoping, audit), not the transport — reuse the standard, own the governance. This is the same "consume the standard, add the layer they lack" principle as the tools/interop pillar.

## Cross-cutting — Retention
The **proactivity / daily-habit loop** (triggers, cron, briefs) turns novelty into habit — AI apps churn ~30% faster; embedding in the daily loop is the retention lever. Open q: the proactive surface that earns a daily open without becoming spam.

---

## helloo-ai — the on-device model *(resolved playbook + second product)*

A family of **small, task-specialized models that run locally on any device** — the physical embodiment of "owned, private, local-first" and a sellable line.

- **Feasibility:** a 2–5 person team CAN take a 0.5B–4B open-weight base, QLoRA-tune a task specialist in ~1–3h for ~$5–$50, quantize to 4-bit GGUF, and ship it offline on phone/laptop/browser. CANNOT train a base from scratch (wrong battle) or beat frontier models on open-ended reasoning — **sell the narrowness as the feature.**
- **"Many beautiful versions" architecture (resolved):** **one shared base per size tier + many hot-swappable LoRA adapters** (a few MB each) — exactly Apple's shipping design (adapters hot-swapped without recompilation). Not dozens of separate multi-GB models. The adapter is the sellable, updatable unit.
- **Base — Apache-2.0 / MIT ONLY** to avoid licensing traps: **Phi (MIT), SmolLM2/3 (Apache), small Qwen2.5/3 (Apache — but NOT Qwen-3B/72B, those are non-commercial), confirmed-Apache Ministral 3.** Avoid Llama unless you accept mandatory "Llama" branding + 700M-MAU cap; avoid Gemma's revocable custom terms. **Pin exact commit hashes** — licenses vary by size/version.
- **Pipeline:** don't fine-tune for knowledge (use RAG) or format (use structured output) — only for behavior/tone/task-shape. 500–2,000 curated or teacher-distilled examples → **QLoRA via Unsloth** (single GPU) or **MLX** (on a Mac) → eval on a held-out set → export **GGUF Q4_K_M** (~92% of FP16).
- **Runtimes:** MLX / llama.cpp (Apple), MediaPipe / ONNX Runtime (Android), **ExecuTorch 1.0** (best cross-platform bet), WebLLM / transformers.js (browser), Ollama (desktop). Reality: <4GB usable RAM on phones, thermal + bandwidth limits — narrow task models are exactly what works on-device today.
- **Role — the private edge + hybrid routing:** local model handles private/fast tasks; route hard tasks to cloud on three signals — **sensitivity (fail-closed: never silently send flagged-private data to cloud), complexity, availability** — via a LiteLLM-style gateway. Local-only must be a first-class, user-visible mode.
- **Moat (honest):** base weights, quantizers, and runtimes are all free/commoditizing, and Apple/Google/Microsoft ship on-device models free in the OS. helloo-ai's defensible IP is the **proprietary task datasets + evals, the curated adapter catalog + UX, and distribution** — plus its tie into the platform's memory + trust layers. Pick tasks/verticals the OS models don't serve.
- **Comps to study:** Arcee AI (orchestra of small specialists + router — closest analog), Microsoft Mu, Apple Foundation Models, Gemma+MediaPipe.

---

## Build discipline — systems before code (decided)

The platform acts on users' *real accounts*, so rigor is a launch requirement, not later cleanup. Confirmed with the founder:
- **Adopt a virtual-engineering-team skill suite** — plan-review, code-review, a **security audit (OWASP + STRIDE)**, QA, ship, canary, retro roles. Install in the repo.
- **Adopt an anti-over-build coding discipline** — make the coding agent "think like the laziest senior dev" (write less code, keep every safety guard). Complements the above: it stops over-*building*, while the "complete what you build" ethos finishes what you *do* build → "the minimal right thing, done completely." Directly answers the red-teams' over-engineering warning.
- **Tests + vuln-scanning as a norm from commit #1** — eval/regression + **membrane-leak CI gates** (Maintenance §1), `osv-scanner`/Dependabot + SBOM per release.
- **Adopt a `SKILL.md`-style structure** as the tool/skill registry unit, and a **router** pattern for tool selection.
- **Adopt the "boil the ocean" ethos scoped correctly:** complete *within* the chosen scope (tests, edge cases, error paths), not scope expansion.

Rationale: every red-team named the same failure mode — an agent on real accounts taking a destructive or leaky action. These systems make failures **catchable and reversible before we have users to harm.**

## Maintenance & operations *(resolved playbook — maintenance is a safety function here)*

The blast radius is a user's real accounts, so maintenance is chosen to make failures **catchable and reversible** (cf. the July-2025 Replit incident: an agent wiped a production DB during a code freeze; ~65% of orgs reported an agent incident in the past year).

1. **Testing — layer-isolated.** Deterministic scaffold (routing, RLS, DO state) → exact-pass tests; **membrane-leak = zero-tolerance CI gate**. Stochastic core → eval harness with **tolerance bands** (Promptfoo/DeepEval/Braintrust, pinned judge model, stable golden set), scoring task success, tool-call ordering, and unauthorized-action attempts; RAG-poisoning red-team set for memory.
2. **Observability.** Instrument on **OpenTelemetry GenAI conventions** (backend-swappable); backend = **Langfuse** (self-host, MIT, OTel). Session-level (not single-turn) injection/anomaly detection; per-tenant cost/drift monitoring.
3. **Protocol churn — the steady drip.** An **anti-corruption layer**: wrap MCP/A2A/each model provider/AI SDK behind your own interface; pin exact versions; keep a compatibility matrix. MCP + A2A revise 2–4×/yr with real breaking changes (batching added then removed; 2026-07-28 stateless + required headers). Treat provider **ToS** changes as first-class churn.
4. **Security/patching.** Dependabot + multi-source SCA + **SBOM per release**; `SECURITY.md` + private disclosure + CVE-via-GitHub; agent-boundary hardening (OWASP `LLM01` still #1).
5. **Data/schema.** **Expand/contract migrations (pgroll)** — never rewrite history. RLS **role separation** (`app_owner` DDL / `app_user` app) + `FORCE ROW LEVEL SECURITY`, each change gated by the membrane-leak tests. **Crypto-shredding** (per-user keys, destroy key on erasure) for GDPR Art. 17 on the immutable event log — design per-user keys from day one. Tested restores; per-tenant PITR.
6. **OSS burden.** Automate triage (label/stale/dedupe bots, repro-forcing templates); semver + changelog + `CONTRIBUTING`/`GOVERNANCE`/`SECURITY`; explicit open-core boundary. The hosted plane carries SLO/upgrade/incident load OSS users don't see — that asymmetry is the business.
7. **On-device (helloo-ai).** Tested OTA rollback (destructive lab tests: mid-flash power loss, corrupt download, boot-loop), signed artifacts, staged/canary by cohort; **versioned base↔adapter compatibility** (a base update can invalidate shipped LoRA adapters — MinT-style adapter registry + served-result attribution); eval-before-ship per device runtime/quantization.
8. **Incident/kill-switch.** Layered kill switches — **global + per-tenant + per-tool**, operator-authenticated, seconds to trigger (revoke tool perms, halt jobs, lock deploys); immutable audit of every action-on-account; NIST SP 800-61 (2025 rev.) / CoSAI flow (first hour = contain, not diagnose). Agent-safety SLO (unauthorized-action-blocked rate; membrane-leak = zero).

**Small-team tool defaults:** Promptfoo/DeepEval (evals) · Langfuse (observability) · Dependabot + Aikido/Trivy-class (deps) · pgroll (migrations) · crypto-shredding (erasure) · Memfault-style OTA + MinT-style adapter registry (on-device) · your own ACL + compat matrix (churn).

**Top 5 maintenance risks:** (1) cross-tenant membrane leak; (2) destructive/irreversible action on a real account; (3) protocol churn outrunning the team; (4) prompt-injection/memory-poisoning via the vector store (5 docs → ~90% steer); (5) on-device base OTA silently invalidating adapters.

## Sources
Full sourced reports (interop, security, memory, on-device) with URLs + dates are preserved in the working strategy notes. Caveats: several 2026 figures are vendor self-reported or from AI-generated blogs — load-bearing facts (MCP/A2A governance, the WhatsApp ban + EU reversal, model licenses, CVE-2026-33579) were cross-checked against primary/press sources; treat vendor benchmark numbers (memory-engine accuracy, on-device tok/s) as directional.
