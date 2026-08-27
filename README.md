# helloo — Personal AI, redefined

> Infrastructure for personal AIs people **own** — layered memory they control, agents that act across their real accounts *safely*, reachable from any channel. Open-source core, hosted premium.

This repository holds the **platform thesis** for helloo. It is a living document — a build-in-public statement of what we're making, why now, and how we intend to win. Code lives elsewhere; this is the argument.

---

## The thesis

Everyone is about to have a personal AI. But the mass-market default will belong to incumbents — Apple, Google, OpenAI, Meta — who win by distribution: it knows you, but it's *theirs*. The "own your AI" alternatives that have emerged (self-hosted, any-channel, bring-your-own-agent) are powerful and genuinely wanted — and almost entirely **unsafe, unreliable, and unmonetized**.

**helloo is the infrastructure for personal AIs you can actually trust and own.** Spin up your own AI (or bring your own agent), give it a layered memory you control — the *membrane* — and let it *do things* across your real accounts, safely: it asks before it acts, it can't leak across the boundary, every action is logged, and you set the limits. Reachable where you already are, and from Claude or ChatGPT. Open-source at the core; we run the trusted, managed version.

**A personal AI that's an asset you build — not a subscription you rent.**

---

## Why now

- **Memory went mainstream** in 2025–2026 (native in ChatGPT/Claude/Gemini) — and immediately fragmented into silos that don't talk to each other.
- **Interop became a standard** — MCP is near-universal and Linux-Foundation-governed; A2A reached v1.0. "Any-agent, any-channel" is now a commodity you *consume*.
- **The demand is proven** — self-hosted personal-agent projects showed millions want an AI that acts across their apps (email triage, calendar, team workflows) — and exposed exactly the walls nobody has cleared.

## What we're NOT

Not a chatbot with a nicer personality. Not a memory feature. Not a walled-garden assistant. Not another agent that runs as root and hopes for the best.

**How we say it** (from talking to the technical-solopreneur crowd): helloo is **the layer that makes you independent of any one model and reaches into your real life** — **automations that actually work** (bounded, observable, cost-capped; it *informs* and drafts, and acts only with your OK), and a memory that's **yours, correctable, and exportable** — not "an AI that remembers everything." We don't say "agents" to users, and we don't lecture about privacy — we make it a felt benefit. Full language guide in [`PRD.md`](PRD.md#positioning--product-language-from-user-research--apply-everywhere).

---

## The wedge — where the moat actually is

Not the channels. Not the model. Not the memory (all commoditizing). The moat is the two things the whole field is failing at:

1. **The trust layer** — safe agent action over real accounts: approve-before-act, non-bypassable permission + memory-visibility filters, per-agent sandboxing, full audit, spend caps.
2. **Owned, layered, portable memory** — the *membrane*: personal / shared / org layers, user-owned, versioned, inspectable, revocable — and exposed as an MCP server so it spans Claude / ChatGPT / your own apps.

| What people say is broken | helloo's answer |
|---|---|
| "I want it to act as me, not just chat" | Confirm-gated executable tools + a proactive engine |
| "Memory is untrustworthy — it forgets, it leaks" | The membrane + provenance + versioned, revocable memory |
| "Giving an agent access is running as root" | Approve-before-act + permission filters + audit + spend caps |
| "My AI should be mine, self-hostable" | Open-core; the memory is your asset, not our lock-in |
| "Five memory silos don't talk to each other" | Memory exposed as an MCP server, portable across assistants |

---

## Architecture — seven primitives

A "helloo" is a personal AI composed of seven primitives. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full decision-space and open questions.

1. **Identity & memory** — the layered membrane; owned, portable, bi-temporal. *(core)*
2. **Agent runtime** — many agents per AI; provider-agnostic. *(core)*
3. **Tool / skill registry** — MCP servers + markdown skill-files, scoped per agent. *(core)*
4. **Channel adapters** — web/native, Telegram, SMS, voice-call, and MCP-into-Claude/GPT. *(core)*
5. **Workspaces** — orgs → users; users in many orgs; memory scoped by tenant. *(premium)*
6. **Bring-your-own-agent** — any A2A/MCP agent inherits channels + memory + trust. *(premium)*
7. **Trust & governance** — approve-before-act, permissions, sandbox, audit, spend caps. **(the moat)**

---

## helloo-ai — the on-device model

A distinct strand and a second product line: a **family of small, task-specialized models that run locally on any device** — optimized per task, private by construction. Not a foundation model from scratch, but strong open-weight small models specialized (fine-tune / LoRA / distillation), quantized, and shipped through on-device runtimes (llama.cpp, Apple MLX/Core ML, ONNX, WebGPU).

It's the physical embodiment of the thesis — *owned, private, local-first* — and the **private edge** of the platform: sensitive memory and everyday tasks run on your device; hard tasks route to a cloud model; your private data stays local. Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## helloo Voice — ambient, hands-free, callable

helloo is available as **voice**, as a first-class surface — not a feature bolted onto a chat app:

- **Through earphones / hearables** — summon it hands-free ("Hey helloo"), talk while walking, driving, working. On-device wake-word + low-latency speech in/out, so it feels like a presence in your ear, not an app you open.
- **On the phone / calls** — *call* helloo the way you'd call Siri or Alexa — but helloo is also a number you can dial, and it can **call you** (proactive: a morning brief, a reminder, "your flight moved"). Voice conversations carry the same memory and can *act* — with the same approve-before-act trust gate as every other surface.

It builds on the platform's speech stack and ties directly to **helloo-ai** (on-device wake-word + fast local turns keep voice private and instant) and the **trust layer** (a voice command to send or spend still asks first). Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Roadmap

- **Phase 0 — Extract & harden.** Provider-agnostic runtime, MCP-native tool registry, membrane as real Postgres RLS, memory-quality evals.
- **Phase 1 — Open core + trust.** Open-source runtime with great DX, the trust layer as the headline, compliant channels, a dogfooded flagship AI.
- **Phase 2 — Hosted + BYO.** Managed memory, workspaces/orgs, governance & spend controls, bring-your-own-agent, the agent/skill registry. The revenue layer.
- **Phase 3 — Ecosystem.** Many hellos collaborating across orgs; registry network effects.

---

## The honest hard problems

We are building the *non-naive* version on purpose. Naive horizontal infra is the hardest, least-defensible path — the pieces are commoditizing, and popularity without a trust model or a business is a dead end. We win only if we hold the line on:

- **Security is existential** — running agents over real accounts is a huge attack surface (the "lethal trifecta": private data + untrusted content + external comms). Sandbox, permissions, and audit from day one.
- **Reliability** — deterministic workflows with LLMs at the seams; state so a session knows where the work stands.
- **Cost** — efficient memory retrieval and spend caps as first-class features.
- **Monetization from day one** — open-source adoption is not a business; the hosted trust/memory layer must exist early.
- **Model-portability** — a provider terms-change must never kill users.
- **Channels** — no personal AI may depend on a channel a platform can switch off (see the WhatsApp general-purpose-bot ban, Jan 2026).

---

## Read next

- [`SYSTEM-MAP.md`](SYSTEM-MAP.md) — how helloo works end to end (diagrams), before any new code.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the architecture decisions, why, and the alternatives.
- [`docs/HUB-MEMORY.md`](docs/HUB-MEMORY.md) & [`docs/HUB-TRUST.md`](docs/HUB-TRUST.md) — deep-dives on the two hub subsystems everything sits on.
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — strawman schema (event log + bi-temporal atoms + tiers) for devs to react to.
- [`VERSIONS.md`](VERSIONS.md) — proposed v1 / v2 / v3 build sequence (for the team to confirm).
- [`PRD.md`](PRD.md) — product features/surfaces per version, for the UX team to design from.
- [`docs/USERS-AND-ONBOARDING.md`](docs/USERS-AND-ONBOARDING.md) — who comes, why, the entry points, and migration-as-onboarding.
- [`docs/USE-CASES.md`](docs/USE-CASES.md) — the use-case taxonomy, grounded in how people actually run AI routines.
- [`docs/HORIZON.md`](docs/HORIZON.md) — the 2yr/5yr research roadmap: what's coming (papers) and what helloo does with it.
- [`QUESTIONS.md`](QUESTIONS.md) — open questions for engineers. **If you build systems like this, please weigh in** — open an issue or comment inline.

## Status

Early. Thesis first, then the core. This document evolves in public, and it is currently being **red-teamed** — including the honest question of what here is over-engineered for a pre-user product. Feedback and challenge are welcome; the hard problems are open invitations.
