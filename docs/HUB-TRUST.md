# Hub Deep-Dive: TRUST / APPROVALS

> The second hub the product sits on (the other is [Memory](HUB-MEMORY.md)). Safe action over real accounts is *the moat, made felt*. This is a design + system brief — the model, the append-only audit, the surfaces and their states, the interconnections, and how it should *feel* (safe, not naggy). Proposal, not decision; open calls flagged (`QUESTIONS.md` Q4, Q9, Q24, Q35).

## Why trust is a hub
Every acting feature routes through it: Conversation's sends, Automations' proactive messages, Skills/agents, and — the hardest case — autonomous hello↔hello action. If this feels naggy, the product is annoying; if it feels unsafe, the product is dangerous. Getting the *feel* right is the difference between "an assistant you trust with root" and "a liability."

## The model (from the security research)
**Foundational rule — Meta's "Rule of Two":** an autonomous action may hold at most two of {reads untrusted input · touches sensitive data · acts externally}; all three → human-in-the-loop. This is the design constraint, not a filter.

**Action tiers** (what gates vs what doesn't — tuned hard against approval fatigue):
- **Read-only / internal / reversible → autonomous** (no gate; logged).
- **External / irreversible / high-value / new-counterparty / untrusted-derived-argument → gated** (approve-before-act).

**The gate:** preview the *exact* action → **Approve / Deny / "Always allow for this contact/type"** → execute → log. The "always allow" writes a rule into a **shared policy store** that Federation autonomy also reads (Q9).

**Under the gate:**
- **Capability / OBO tokens** — scoped, short-lived, attenuable; never hand the model long-lived secrets.
- **Default-deny egress allowlist** — the single highest-leverage control against exfiltration.
- **Spend / action caps** — per-tenant, per-tool circuit breakers.
- **Kill switch** — global + per-tenant + per-tool, seconds to trigger.

## The append-only audit log (the spine)
Every step is an immutable, replayable event — **model message · tool call · tool result · permission decision · execution · result · reversal · termination** (concrete shapes in [`DATA-MODEL.md`](DATA-MODEL.md)). The log is: the **receipts** users see, the **forensics** for incident response, and the substrate for **reversibility** (know exactly what was done to reverse it).

## Surfaces & their states (for UX)

| Surface | What it is | Key states to design |
|---|---|---|
| **Approvals inbox** | Pending consequential actions awaiting your OK | nothing pending · one high-stakes · a batch of low-stakes · expiring/timed-out · a blocked/failed action |
| **Action preview** | The exact "here's what I'll do" card | send/email · payment · share-a-doc · schedule · a *new* counterparty (extra scrutiny) · an action using untrusted-derived data (flagged) |
| **Trust dial** (per tool/agent) | read-only → ask-first → autonomous, + caps | default (ask-first) · escalated-to-autonomous · restricted-to-read-only · cap-reached |
| **Activity log / receipts** | Everything helloo did | normal entry · a gated-then-approved action · a reversed action · an autonomous action (with the policy that authorized it) |
| **Spend / action caps** | Budgets + circuit breakers | under budget · approaching cap · cap hit (agent paused) |
| **Kill switch** | Stop everything now | armed · triggered (what it halted) |
| *(v3)* **Autonomy policy editor** | What your hello may do with other hellos without asking | no autonomy · scoped (these people, these actions, this budget) · an escalation-back-to-you |
| *(v3)* **Consent ledger** | Audit of autonomous cross-hello actions | empty · a completed autonomous action · one you want to undo |

## Interconnections (the wiring)
- **Gates every acting feature** — Conversation, Automations, Skills, Federation all call it. Build it **before** any of them.
- **The "always allow for X" policy store is shared with Federation autonomy** (Q9) — Approvals (v1) and cross-hello autonomy (v3) are the same mechanism at two scales.
- **Receipts become Memory + Activity entries** — an action is also a fact ("emailed Priya re: pricing").
- **Voice-ID (v2) feeds authorization** — who is speaking gates sensitive commands.
- **The Membrane governs what appears in previews** — an approval card must not leak a private atom into a shared context.
- **When embedded inside Claude/ChatGPT (MCP)**, the *host* model picks helloo's tools → write actions need a **helloo-side confirmation independent of the host** (Q35), or a prompt-injected host could trigger them.

## How it should feel (UX principles)
- **Safe, not naggy.** Gate only what truly matters; batch low-stakes; learn "always allow for this contact" so the same ask never repeats. Approval fatigue is the failure mode that quietly defeats every gate.
- **Exact, not vague.** The preview shows the *real* content and recipient — "Send *this* to *Priya*", not "Send an email?".
- **Reversible by default.** Show the undo window; make "reverse" one tap where the action allows.
- **Legible autonomy.** When helloo acts on its own (automation or federation), the receipt names *the rule that authorized it* — autonomy is never mysterious.
- **The kill switch is always findable.** One obvious way to stop everything.

## Open questions → engineers
Q4 (v1 security scope; defer full CaMeL?) · Q9 (autonomous-federation policy + safety) · Q24 (validate tool *responses* at runtime) · Q35 (host-injection guard when embedded in another LLM).

## The isolation boundary (Q40) — two options, both specced

A hard lesson from prior art: **an in-process permission engine is UX, not a security boundary** — a compromised/injected agent can bypass in-process checks. The approve-before-act UX must sit *on top of* real isolation. Two options for what that isolation is:

**Option 1 — Per-run sandboxed container + default-deny egress (recommended).**
- Each consequential run executes in an **isolated container** (Cloudflare Sandbox / equivalent) with **no ambient credentials**; tokens are injected scoped + short-lived (OBO).
- **Default-deny egress allowlist:** the sandbox can only reach the specific hosts a task needs — so even a fully hijacked agent has *no reachable exfil path* (physically neutralizes the "external comms" leg of the lethal trifecta).
- The permission UX gates *what* runs; the sandbox + egress bound *what a run can reach* if the UX is fooled.
- *Cost:* container spin-up latency + orchestration.

**Option 2 — In-process policy engine only (lighter, weaker).**
- Tool calls checked against a policy engine in the agent process; no container isolation.
- *Faster/simpler, but:* it is a heuristic, not a boundary — an injected agent that reaches a tool can act. Acceptable only for **read-only / low-blast-radius** tools; anything that writes or sends must fall back to human approval.

**Lean:** Option 1 for anything that acts externally; Option 2's in-process policy is fine as the *first* filter but never the *only* line. The real boundary is **sandbox + egress allowlist + scoped OBO tokens**, with the OS/platform — not our code — as the ultimate boundary. **Ask (Q40):** is the platform's per-run container + egress allowlist strong enough for agents acting on real accounts, and where exactly is the trust boundary drawn?

## Design references (patterns, not sources)
- **One append-only permission log:** model messages, tool calls, **permission decisions, and termination** are all *kinds* of one immutable stream; everything else is a projection. The approve-before-act **handshake keyed by a `request_id`** (request → decision{allow/deny, reviewer, rationale, remember-scope} → accepted) makes the whole audit **replayable for free**. Termination/kill recorded as a durable fact (a forced terminal flush so a kill never loses "how it ended"); **monotonic sequence + canonical digest** for tamper-evidence. (See the shared event log in [`DATA-MODEL.md`](DATA-MODEL.md); Q39 = whether memory + trust share it.)
- **Risk-category permission taxonomy** to seed our action tiers: categories like `network_send` / `privileged` / `fs_destructive` / `shell_unsafe`; modes `explore` / `ask` / `bypass`; decisions `allow` / `prompt` / `block`; sandbox profiles `read-only` / `workspace-write` / `full-access`.
- **The caps layer:** **action budgets & cost governors**, **kill switches & circuit breakers**, **human-in-the-loop propose-then-commit** — the design checklist for our caps + approvals.
- **Local-only guarantee:** a single hard **Privacy Mode enforced at the core** (no inference leaves the device) as a model for the membrane's local mode; **approval gates for side effects**; secrets in the **OS keyring**.
