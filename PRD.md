# helloo — Product PRD (v1 / v2 / v3)

> **Feature scope for the UX team to start designing in parallel.** This is *product* (surfaces, features, states, user stories) — not UI design; the actual screens go through the design process. A proposal to confirm/reshuffle, mapped to the architecture in [`VERSIONS.md`](VERSIONS.md) / [`ARCHITECTURE.md`](docs/ARCHITECTURE.md). Existing app already had: chat/ask, memory, people, commitments, activity, connections, shared, members, settings, automations, voice — this organizes and extends that.

## Product primitives (the nouns the whole app is built from)
- **Conversation** (text + voice, any channel) · **Memory** (facts helloo owns about you) · **People** (your relationship graph) · **Actions** (things helloo does on your accounts) · **Approvals** (gate before consequential actions) · **Automations** (proactive/scheduled) · **Connections** (integrations) · **Membrane** (private vs shared) · **Channels** (where helloo lives) · later: **Skills/Agents**, **Workspaces/Orgs**, **Other hellos**.

## Personas
- **The individual** (v1) — a founder/professional who wants an assistant that remembers and acts. Dogfood persona.
- **The team member** (v2) — same person, now inside an org with shared context.
- **The developer / extender** (v2/v3) — brings agents/skills, builds on the platform.

---

# PRD v1 — "One helloo that remembers and acts, safely, everywhere"

Goal: the daily loop — talk to it, it remembers, it does things (with your OK), reachable on your channels. Every screen here maps to a layer we've architected.

### 1. Conversation (home)
- Conversational home: text chat + **voice (push-to-talk + call)**; streaming replies; **suggested next-actions ("pills")**.
- **Source + action chips** on answers (what it used, what it did).
- History, search, per-conversation context.
- *States to design:* empty/first-run, thinking/streaming, tool-running, awaiting-approval, error/offline, voice-listening/speaking.

### 2. Memory (what helloo knows) — *the differentiator, design it beautifully*
- **Memory list/timeline** of facts about you; filter by type/source.
- **"Why do you know this?"** — provenance popover (source, when learned, confidence) on any fact.
- **Inspect / edit / forget** — one-tap correct or forget; "forget everything from source X."
- **Time-machine view** — "what did you believe about X last month" (bi-temporal made visible).
- *States:* rich vs sparse memory, low-confidence/needs-review item, a superseded/"this changed" item, a forgotten/tombstoned item.

### 3. People (relationship graph)
- Contacts helloo knows; **last-contact, strength, how you know them**; per-person profile ("what helloo knows about Priya").
- "Who knows about X" / "who have I not talked to in a while."
- *States:* known vs external contact, merge-suggestion ("is this the same Alex?"), privacy-limited person.

### 4. Approvals & Trust — *NEW, the safety UX; make it feel trustworthy, not naggy*
- **Approvals inbox**: pending consequential actions with an **exact "here's what I'll do" preview**; approve / deny / **"always allow for this contact/type"** (fights approval-fatigue).
- **Trust dial** per tool/agent: read-only → ask-first → autonomous; **spend/action caps**.
- **Activity log / receipts**: every action helloo took, reversible-by-record.
- *States:* nothing pending, one high-stakes approval, batch of low-stakes, a blocked/failed action, a reversed action.

### 5. Connections (integrations)
- Connect accounts (Gmail, Calendar, Slack, Notion…); **per-source scope** (private vs shared, remember vs look-up-only).
- Connection health/status; reconnect flow.
- *States:* not-connected, connected-healthy, needs-reauth, partial/degraded, connect-in-progress.

### 6. Automations & proactivity
- **Morning brief** (digest across accounts) — a first-class surface.
- **Reminders**; **triggers** ("when an email from X arrives, …"); **"chase" rules** (nudge me/others on commitments).
- Per-automation on/off, preview of what it'll send, channel choice.
- *States:* no automations, active, paused, misfired/needs-attention.

### 7. Commitments
- **"Who owes what" board** — open/overdue commitments helloo is tracking; nudge action.
- *States:* none, on-track, slipping, done.

### 8. Membrane / privacy control
- **"Everything of mine helloo can see/share"** screen; per-item private↔shared; **one-tap revoke**.
- Clear "private never leaves" reassurance surface.

### 9. Channels
- Manage where helloo reaches you (web/app, WhatsApp*, Telegram, SMS, phone call, "inside Claude/ChatGPT" via MCP); per-channel notification prefs.
- **Channel handoff** — "continue on…" (start on a call, finish in the app).

### 10. Onboarding, personas, settings
- First-run: connect first account, optional history import, pick a **persona/role** (founder / job-seeker / general).
- Account, appearance (light/dark), data export/delete, billing stub.

\* WhatsApp = at-risk/at-launch-constrained; design it as one channel among many.

---

# PRD v2 — "helloo for teams + extensible + on-device + ambient voice"

### 11. Workspaces / Organizations
- **Org switcher** (person in many orgs); org member list; **org brain** (shared memory view); admin controls (who sees the shared graph, invite).
- Membrane extended: personal / org-shared / group.

### 12. Skills & Agents (extensibility)
- **Skill/agent gallery** — install skills (like an app store); per-skill permissions.
- **Bring-your-own-agent** — connect an external agent (A2A); it inherits channels + memory + trust.
- Agent manager: which agents run, their scoped tools, their trust dial.

### 13. helloo-ai (on-device model)
- **Model manager** — download/select on-device task models; **local/private mode toggle** (data stays on device); hybrid routing indicator ("answered locally / used cloud").

### 14. Voice — ambient
- **"Hey helloo"** wake-word on earbuds; voice-ID ("only me can trigger sensitive commands"); ambient conversation UI.

### 15. Hosted premium
- Billing/plans; usage (memory, actions, channels); spend controls.

---

# PRD v3 — "The society of hellos"

### 16. Other hellos (federation)
- **Hello directory** — your hello's links to other people's hellos.
- **Autonomy policy editor** — "my hello may schedule / share X / spend up to Y with these hellos, without asking me." The consent UI for autonomous cross-hello action.
- **Consent ledger** — record of what your hello agreed to autonomously (review/undo).
- *States:* no connections, a pending autonomous negotiation, an escalation-back-to-you, a completed autonomous action.

### 17. Cross-org & marketplace
- Cross-org collaboration; a **skill/agent marketplace** (publish + install, with governance/verification).

---

## More ideas (backlog to consider — pick, cut, remix)
- **Receipts everywhere** — every action leaves a shareable receipt.
- **Blind spots** — helloo surfaces what it's *unsure* about and asks, instead of guessing.
- **Rehearse** — helloo drafts, you edit; it learns your voice from your edits.
- **"Undo" for the world** — reverse a sent/scheduled action within a window.
- **Digest composer** — you design your own brief (what/when/where).
- **Focus / do-not-disturb** — helloo holds non-urgent proactivity.
- **Handoff to a human** — loop in a real person (assistant/teammate) from a thread.
- **Weekly retro** — "here's what I did for you / what's slipping."
- **Memory health** — "stale facts to confirm," "duplicates to merge."
- **Shared moments** — with consent, two people's hellos co-remember an event (dinner, meeting).
- **Templates/plays** — reusable multi-step actions ("prep me for this meeting").
- **Guest mode / delegation** — let someone act through your hello with tight scope + expiry.
- **Trust score surface** — how confident helloo is before acting.
- **Voice personas** — different voices/tones per context.
- **Offline-first inbox** — queue actions when offline, run on reconnect.

---

## Notes for UX (to start now)
- **Design the states, not just the happy path** — every surface above lists its states; the *approval*, *low-confidence memory*, *needs-reauth*, and *awaiting-autonomous-action* states are where trust is won or lost.
- **Two hero surfaces carry the product:** **Memory** (make "it's yours, inspect/forget" tangible and calm) and **Approvals/Trust** (make "it asks first" feel safe, not naggy). These are the differentiators; give them the most craft.
- **Parity across surfaces:** web/app + voice + "inside another app (MCP)" — the same action must be expressible in a chat bubble, a voice turn, and a compact card.
- **The daily loop is proactive + in-chat**; the rich management screens (memory, people, connections, org brain) are for review, not the everyday path.
- When we move to actual screens/flows/visual system, that work goes through the design process (design gate) — this PRD is the input.

**UX + devs: confirm the version each feature sits in, and tell us which v1 surfaces are must-have vs nice-to-have for the first dogfood build.**
