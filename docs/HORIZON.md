# Horizon — the research roadmap (2yr / 5yr)

> What the last ~12 months of AI research says is *coming but not here yet*, and how helloo rides it. For each capability: **today → the frontier (recent papers) → ~2yr → ~5yr → what helloo does with it.** Papers are reference points, not dependencies. Companion: [`ARCHITECTURE.md`](ARCHITECTURE.md), [`VERSIONS.md`](../VERSIONS.md).
>
> **Sourcing honesty:** anchor papers are cited by arXiv ID; several very recent (2026) IDs were surfaced via search summaries and should be **click-verified before formal citation** (flagged where load-bearing). Timelines are directional reads, not promises.

## The one meta-insight that shapes the whole roadmap
**Capability is climbing fast, but *reliability* and *safety* lag capability by a wide margin — and that lag is helloo's moat.** METR's task-time-horizon is doubling roughly every **89 days** (Claude Opus 4.5 ≈ 320 min of human-equiv task at 50% success) — yet the honest reliability metric, τ-bench's **pass^k, drops 61%→25% from 1 to 8 tries**. The research consensus: the bottleneck isn't the model, it's the **trust/verification/owned-memory layer around it** — exactly what helloo is building. So we design to *consume* the fast-improving models and *own* the slow-to-solve trust + memory layers.

---

## 1. Memory
**Today:** RAG over a vector store; incumbents ship shallow, stateless-across-runs memory.
**Frontier (papers):** memory has become a managed, self-editing subsystem — **Sleep-time Compute** (2504.13171: consolidate memory *off the response path*, "the agent sleeps and dreams"), **ReasoningBank** (2509.25140: distill reusable *strategies* from successes *and* failures; "experience scaling"), **Zep/Graphiti bi-temporal KG** (2501.13956: four-timestamp facts → reason about *change*), **Titans** (2501.00663: learn-what-to-memorize at test time), memory-as-**reconstruction** from a graph. And an exploding **memory-security** literature: poisoning is a durable backdoor that "looks like ordinary model failure" → **provenance/trust-tiering** as the defense.
**~2yr:** async sleep-time consolidation (episodic→semantic→procedural); bi-temporal, user-legible KG memory; provenance-bound memory (every fact carries source + trust tier).
**~5yr:** robust automatic contradiction/staleness handling; a durable, portable, editable **user model** that steers a frozen LLM across apps; hardened poisoning defenses.
**→ helloo:** our membrane + event-sourced atoms + supersession is already the right shape. Add **sleep-time consolidation** and **provenance/trust-tiers** as first-class — for an *acts-on-your-accounts* product, a poisoned memory becomes a poisoned action, so this isn't a feature, it's existential.
**Hype flag:** "10M-token context replaces memory" — the evidence (LaRA ICML 2025; BEAM 2510.27246) says **no**; long context is a *working set*, never the system of record.

## 2. Reasoning & reliability
**Today:** strong reasoning in *verifiable* domains (code/math); unreliable elsewhere; self-correction inside one model is largely an illusion.
**Frontier:** test-time compute / long "thinking" (survey 2501.02497), **RL from verifiable rewards** as the post-training recipe (2506.14245) — but verifiers don't generalize (2510.00915), and the **Self-Correction Illusion** shows models catch *others'* errors, not their own → **cross-agent checking beats self-review**. Reliability is being won at the **orchestration layer**: external verifiers + separate critic agents + typed checks drive silent failures toward ~0%.
**~2yr:** verifier-gated orchestration as a default; adaptive/controllable test-time compute (spend compute ∝ difficulty).
**~5yr:** reasoning that *generalizes* to open personal-life tasks with calibrated "I don't know."
**→ helloo:** build the trust membrane as **external verifiers + critic agents + typed/executable checks + human-gate on irreversible actions** — never rely on a single agent's self-verification. Measure ourselves on **pass^k / 80%-horizon**, not pass@1; discount any autonomy claim not reported that way.

## 3. Agents & autonomy (long-horizon, computer use)
**Today:** ReAct-style loops drift on long tasks; reliable *API/tool* use, unreliable *GUI* use.
**Frontier:** hierarchical planning + **world models** (survey 2510.16732), **context-folding** to survive long tasks (2510.11967); computer-use grounding is a measured bottleneck (OSWorld, ScreenSpot, UI-TARS) and exposed to prompt-injection; self-improvement via **skills + memory, not weights** (self-evolving-agents survey 2507.21046; ELL 2508.19005).
**~2yr:** reliable *multi-hour* bounded routines; skill-library self-improvement (curated, pruned, poisoning-defended).
**~5yr:** reliable *multi-day* autonomy; robust computer/GUI use across arbitrary real apps.
**→ helloo:** **prefer typed APIs/MCP now**, treat GUI autonomy as maturing; design proactive routines around the *bounded* (80%) horizon; give each hello a growing **curated skill/memory store**, not model retraining. "Informs > acts," always.

## 4. Society of hellos (multi-agent / A2A)
**Today:** orchestrator + ephemeral sub-agents is the production-proven shape (Anthropic: +90.2% on research eval, but ~15× tokens); multi-agent-by-default is often *worse*.
**Frontier:** communication-centric multi-agent surveys (2502.14321), coordination benchmarks that **degrade as the network scales** (AgentsNet 2507.08616), and standardizing **A2A/ACP** protocols.
**~2yr:** standard agent-to-agent protocols (helloo agents interoperate).
**~5yr:** **true multi-principal negotiation** — agents owned by *different people* negotiating with trust + economics — is *barely explored*; protocols exist, trust/economics don't.
**→ helloo:** the "society of hellos" trust layer (consent + scoped delegation + membrane across a hello boundary) is aimed at a **genuinely open research frontier** — that's a moat, and why it's v2/v3, gated hardest.

## 5. helloo-ai / the private edge (on-device models)
**Today:** task-specialized 0.5–8B models run on-device at 4-bit; NPUs aren't always faster than CPUs yet.
**Frontier:** the **specialist-SLM-fleet** thesis (a router over many narrow small models — 2505.13425, 2510.13890), **hybrid** architectures (Mamba/SSM + sparse attention — survey 2508.09834), robust **2-bit QAT** emerging (2511.21736; reasoning is *most* low-bit-sensitive, 2601.14888), **on-device fine-tuning** arrived (MobileFineTuner 2512.08211; MobiLoRA), and silicon crossing the "smooth local LLM" bar (Snapdragon X2 ~80 TOPS).
**~2yr:** on-device task-specialist fleet + local LoRA personalization; robust 2-bit; mature low-bit NPU runtimes.
**~5yr:** assistant-grade 1.58-bit; a sub-quadratic architecture standard on-device; **on-device continual *weight-level* adaptation** (Nested Learning/HOPE, NeurIPS 2025) — *high-risk, watch-and-prototype-late.*
**→ helloo:** the private edge is realizable near-term as **narrow specialists + orchestrator + hot-swappable LoRA**, distilled from big teachers. Until weight-level learning lands (~5yr), "learning you" lives in the **memory layer, not the weights** — don't bet the 2yr roadmap on Nested Learning.

## 6. Trust & security — the moat
**Today:** prompt injection is unsolved; classifier/prompt defenses keep getting bypassed.
**Frontier — a real paradigm shift:** from probabilistic defenses → **deterministic capability + information-flow control**. **CaMeL** (2503.18813: privileged-planner + quarantined-data-LLM + provenance-tracked capability checks → *provable* security on 77% of AgentDojo vs 84% undefended), the **Design Patterns** synthesis (2506.08837), **IFC/FIDES** (2505.23643: proven non-interference for integrity + explicit secrecy), **revocable capabilities** (2606.22504), **deterministic pre-action authorization** (2603.20953). Alignment monitors (Anthropic's agentic-misalignment work) as defense-in-depth.
**~2yr:** deterministic dual-LLM / capability wrappers + pre-action authorization + revocable scoped tokens for *scoped* account actions — buildable **now** on these papers.
**~5yr:** **provable, *general-purpose* injection safety** for open-ended real-account automation + reliable oversight of stronger-than-overseer agents — **research-only today.**
**→ helloo:** this is our defensible core, and the honest framing is the wedge: today's "provable" defenses are provable *because they restrict the agent* (CaMeL's 77 vs 84) — nobody has provable safety for a *general* agent acting freely on real accounts. **That unsolved gap is the moat, not a checkbox.** Lean on deterministic capability control as the primary guarantee; use runtime monitors + human-escalation as defense-in-depth; never trust model alignment alone for actions.

## 7. Privacy & deletion
**Today:** cloud inference sees your data; "forget me" is mostly a UI toggle.
**Frontier:** **TEE confidential compute** is the pragmatic winner (CPU/GPU TEEs at <10–20% overhead — 2509.18886, 2606.11145; Apple PCC / Google Private Cloud AI in production); **DP-federated LoRA** personalizes across users without seeing raw data; **machine unlearning** research is large but **in-weights deletion is unsolved** (retain-forget entanglement, no certification); **FHE** is ~0.2 tok/s — **4 orders of magnitude too slow.**
**~2yr:** on-device edge + **attested-TEE cloud spillover** ("your data never leaves a verified boundary"); deletion = **drop the store/adapter**, not weight surgery.
**~5yr:** DP-federated personalization at scale; certified in-weights unlearning (still uncertain).
**→ helloo:** promise "**your data stays within a verified boundary**" via on-device + TEE now; implement **right-to-be-forgotten architecturally** (delete the memory store / per-user adapter) — sidestepping unsolved in-weights unlearning. This makes privacy + deletion a *product feature*, and matches the builder crowd's non-negotiable ("human-readable, local, deletable").

---

## The roadmap at a glance
| Capability | Today | ~2yr | ~5yr |
|---|---|---|---|
| Memory | RAG / stateless | sleep-time consolidation · bi-temporal KG · provenance | portable editable user model · robust staleness/poisoning |
| Reliability | verifiable-domain only | verifier-gated orchestration | generalizing reasoning w/ calibration |
| Autonomy | reliable APIs, flaky GUI | reliable multi-hour bounded routines | multi-day autonomy · robust computer-use |
| Society of hellos | orchestrator+subagents | A2A/ACP protocols | true multi-principal negotiation *(open)* |
| Private edge (helloo-ai) | 4-bit specialists | fleet + on-device LoRA · robust 2-bit | 1.58-bit · on-device weight-level learning *(risky)* |
| Trust/security | injection unsolved | deterministic capability+IFC for scoped actions | provable general-purpose agent safety *(open)* |
| Privacy/deletion | cloud sees data | on-device + attested TEE · delete-the-adapter | DP-federated at scale · certified unlearning |

## Build now · watch · don't-bet-on
- **Build now (papers already support it):** the deterministic trust layer (scoped), bi-temporal + provenance memory, specialist on-device SLMs + LoRA, TEE confidential spillover, architectural right-to-be-forgotten, verifier-gated orchestration, pass^k/80%-horizon as our internal bar.
- **Watch & prototype late:** on-device weight-level continual learning (Nested Learning/HOPE), provable *general* agent safety, multi-principal agent negotiation — these are the **5-yr moat**, genuinely unsolved.
- **Don't bet on (honest flags):** long context replacing memory (evidence says no); FHE for interactive inference (too slow); certified in-weights unlearning (unsolved — use deletable stores/adapters); model-alignment-alone as an action safety guarantee (bypassable — wrap in deterministic capability control).

## Reference anchors (high-confidence)
Memory: 2310.08560 (MemGPT), 2501.00663 (Titans), 2501.13956 (Zep), 2504.13171 (Sleep-time), 2509.25140 (ReasoningBank), 2504.19413 (Mem0), Nested Learning/HOPE (NeurIPS 2025). Reasoning/agents: 2501.02497, 2508.16665, 2503.12651, 2507.21046, 2502.14321, 2507.08616, 2501.16150; METR Time-Horizon (Mar 2025 / Jan 2026); τ-bench (Sierra); Anthropic multi-agent (Jun 2025). On-device: 2409.15790, 2505.13425, 2510.13890, 2508.09834, 2504.18415 (BitNet v2), MobiLoRA. Safety: 2503.18813 (CaMeL), 2506.08837 (Design Patterns), 2505.23643 (FIDES/IFC), 2606.22504 (revocable capabilities), 2509.18886 (TEE), 2510.25117 (unlearning survey).
*(2026-dated IDs surfaced via search summaries — verify the exact arXiv ID before formal citation.)*
