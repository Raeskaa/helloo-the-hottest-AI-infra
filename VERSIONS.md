# helloo — Build Sequence (v1 / v2 / v3)

> **A proposal for the engineering team to confirm or reshuffle — nothing here is a final decision.** Nothing is *cut*; the whole vision still gets built, sequenced so v1 ships real value and de-risks the hard parts before we generalize into the full platform. Companion: [`QUESTIONS.md`](QUESTIONS.md) (the open calls), [`SYSTEM-MAP.md`](SYSTEM-MAP.md) (how it works), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (why).
>
> Two red-team passes (engineer/forum opinion) shaped this. Their headline: a pre-user team should prove **one deeply useful app** before building the full platform. So v1 = the smallest thing that *fully* proves the thesis (**owned memory + safe action**), built comprehensively where it counts, with the platform generalizing out of it in v2/v3.

---

## v1 — Prove *owned memory + safe action* (one loved, dogfooded app)

**Goal:** one person's helloo that remembers comprehensively, acts safely on real accounts, and is reachable from the channels people already use. Dogfood it daily.

- **Runtime:** Cloudflare Durable Objects, one per user. Guardrails (from red-team): shard memory into SQLite tables, not the 2 MB default state blob; index sparingly; design for hibernation. Wrap the Agents SDK behind our own interface so its churn doesn't ripple in.
- **Data layer:** **Postgres + RLS = system-of-record + membrane; DO = live runtime**, single-master with one-way sync (never dual-write the same field). RLS as *one* isolation layer + app-layer tenant checks (defense-in-depth).
- **Memory — comprehensive from day 1 (founder's call):** the **membrane** (private / shared layers), versioning + time-travel ("what did it believe when"), provenance on every fact, and an **inspect / edit / forget** screen; recall via Vectorize. *Open dev question (Q2): the implementation underneath — full event-sourcing vs a versioned bi-temporal table. The capabilities are the same either way; the build cost differs.*
- **Security — responsible minimum (Rule of Two):** agents default **read-only**; **scoped, short-lived tokens** per action; **approve-before-act** on every irreversible/external write with a clear "here's exactly what I'll do" UI; **default-deny egress allowlist**; **audit log** of every action. (Full CaMeL/provenance-taint engine deferred — see Q4.)
- **Channels:** web/app + **telephony ("call helloo")** + **WhatsApp\* / Telegram / Slack / SMS** adapters + **helloo-as-MCP-server** (reachable inside Claude/ChatGPT/Cursor). New channels are just adapters.
- **Models:** hosted, behind a provider-agnostic layer (model-portable from day 1).
- **Flagship use case:** the inbox & calendar chief of staff (SYSTEM-MAP §"Example use cases" #1–5).

\* WhatsApp = best-effort/at-risk (Meta's general-purpose-bot ban; EU-reversed). Never load-bearing.

## v2 — Generalize + monetize

**Goal:** turn the proven app into a platform others build on, and turn on revenue.

- **Workspaces / orgs** — multi-tenant, users in many orgs; org/shared memory layers on the membrane.
- **Bring-your-own-agent** via A2A Agent Cards; **tool/skill registry** (consume MCP tools + basic publish).
- **helloo-ai (on-device):** first task-specialized models — one base + hot-swappable LoRA adapters; **hybrid local/cloud routing, fail-closed on private data**.
- **Voice:** ambient earbud wake-word (Android solid, iOS best-effort).
- **Hosted premium + billing** (managed memory, workspaces, governance, spend controls).
- **Security depth:** revisit CaMeL-style provenance beyond the v1 flag *if* real usage shows it's needed.

## v3 — Ecosystem + scale

**Goal:** network effects and the original grand vision, on a validated, monetized core.

- **Registry marketplace** + governance layer at scale (the network-effects product — only meaningful once there are agents + users).
- **Cross-org "many hellos"** collaboration.
- **On-device model family** — many adapters, more device runtimes (ExecuTorch), broader tasks.
- **Voice hardware** — partner/white-label (Sensory/Picovoice) or open-source Omi; never build a device from scratch.
- **Open-core community at scale** + published papers.

---

## Why this order (rationale, not gospel)
- **v1 proves the two things only helloo can win on** — owned memory + safe action — with real users, before spending on platform/ecosystem machinery for users who don't exist yet.
- **The moat (trust + owned memory) is fully present in v1;** the commoditizing/ecosystem pieces (registry, BYO, on-device family, open-core) are v2/v3 because they need users/agents to have value.
- **Comprehensive where it matters (memory, security posture, channels), sequenced where it's ecosystem** (marketplace, cross-org, hardware).

**Engineers: please challenge the version each item sits in.** Move things earlier or later, split them finer, or tell us v1 is still too big. That's what this doc is for.
