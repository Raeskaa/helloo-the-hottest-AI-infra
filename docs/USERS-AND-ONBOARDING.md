# Users & Onboarding

> Who comes to helloo, why they come, how they get in, and how they migrate from other AIs. A living reference — ideation + (incoming) research. Not v1 scope; that's decided later. Companion: [`PRD.md`](../PRD.md), [`SYSTEM-MAP.md`](../SYSTEM-MAP.md).

## The organizing idea: "many doors, one hello"
Every entry point is a *door*. Behind all of them is **one verified identity** (anchored on email or phone + OTP) that resolves to **one hello**. Design rule: *meet the user in whatever channel they're already in, verify who they are, drop them into their single hello — which works immediately and gets richer over time.* This keeps a dozen doors from becoming a dozen products.

---

## 1. Who comes first (early users)

Two very different buyers, pulled by different things:

- **The "own-your-AI" believers** — tech people (engineers, founders, PMs, designers), tech students, builders, the self-host/privacy crowd. Pulled by *ownership + memory + skills + "it's mine."* They migrate, tinker, self-host, evangelize. **Cheapest to reach, loudest, most price-sensitive.**
- **The "save-me-time" overwhelmed** — busy professionals, small business owners / solopreneurs, heavy multi-taskers, content creators. Pulled by *"it does my busywork across the tools I already use."* They'll **pay**, but need it to *just work* — no tinkering.

Candidate early segments (Mahesh's list + refinement):
| Segment | Pulled by | Note |
|---|---|---|
| People in tech (eng/founders/PMs/designers) | ownership, memory, skills, MCP-native | loud evangelists; the build-in-public base |
| Tech students / students | free/cheap, learning, "my own AI" | reachable via communities; low WTP |
| Heavy multi-taskers / busy pros | offload admin, proactive memory | strong pain, real WTP |
| Small business owners / solopreneurs | act across accounts, chase things, no team | strong WTP; need it to just work |
| Content creators (IG/TikTok/YouTube) | live in DMs/comments; drowning in admin; brand voice memory | dual pain (admin + audience); channel-native fit |

**Beachhead question (to be decided with research):** go deep on the *own-your-AI tech* crowd first (evangelism + build-in-public + migration hook), or a *paying* vertical (creators / solo business owners)? Likely: **tech/builders as the evangelist wedge → creators/solopreneurs as the first paying vertical.** Research is pressure-testing this.

---

## 2. What pulls them here (the hook / why switch from ChatGPT)
The bar is high — people default to ChatGPT. Candidate hooks, strongest first (research validating):
1. **"Bring your AI with you"** — import your ChatGPT/Claude history so helloo *already knows you* on minute one. Migration *as* the hook (see §5).
2. **"It's yours."** Owned, inspectable, portable, private memory — the membrane. Converts the own-your-AI crowd specifically.
3. **"It acts, and it's everywhere you already are."** Does things across your real accounts, reachable from WhatsApp/Telegram/a call/inside Claude — not one more tab.
4. **"It remembers, so you never re-explain."** The #1 repeated complaint about current AI ("talking to a stranger every new chat").

---

## 3. What a user can demand on day one (day-one jobs)
The concrete things a brand-new user expects *immediately* (defines how short onboarding must be):
- **"Remember this about me / my brand / my work"** — and prove it later.
- **"Do my email + calendar"** — triage, draft, schedule, confirm (with approval).
- **"Bring what my old AI knew about me"** — import + be useful at once.
- **"Reach you where I am"** — WhatsApp/Telegram/call, not a new app.
- **"Chase the things I forget"** — proactive nudges, commitments.
- **"Keep my stuff private"** — visible control from the first screen.
- *(creators)* **"Manage my DMs/comments, plan content in my voice, track brand deals."**
- *(business owners)* **"Watch my inbox/leads and tell me what needs me."**

The **cold-start problem:** a new hello knows nothing. Day-one usefulness comes from **import (migration)**, **connect-first-account**, or **"just start talking."** This is the make-or-break of onboarding.

---

## 4. The doors (entry points)

**A. Channel-native (zero install — the differentiator)**
- **WhatsApp** — the Kapso flow: text the number → email → OTP → verified → hello is live in the chat you already use. *(⚠️ WhatsApp general-purpose bots are at-risk outside the EU — real door, not the foundation.)*
- **Telegram** — same flow; most permissive; likely the safest zero-install door.
- **SMS / iMessage-RCS** — text-to-onboard; universal fallback.
- **Phone call** — call the number, voice onboarding ("what's your email? I'll text a code").

**B. App / web (the front door)**
- **Web sign-up** — email or Google/Apple OAuth → create your hello.
- **Native app** — download → sign up (later).

**C. From inside another AI (the migration door — unique to us)**
- **Add helloo as an MCP connector / app** in Claude, ChatGPT, or Cursor → OAuth → your hello is created from the AI you already use. One-click "Add to Cursor/Claude/ChatGPT." No competitor has this.

**D. Social / org (acquisition built in)**
- **Referral / invite link** — share → claim your hello.
- **Federation-driven** — "Mahesh's hello wants to schedule with you — claim your hello to reply." The society of hellos becomes a viral loop.
- **Org / workspace invite** — admin creates an org, invites members; each onboards their hello into it.

**E. Developer / self-host**
- **Open-core self-host** — clone the core, run your own hello (CLI/deploy).
- **BYO-agent** — a dev registers an existing agent (A2A) to operate through helloo.

**F. Physical / ambient**
- **QR code** (card, poster, event) → WhatsApp/Telegram/web claim link.
- **Voice hardware / earbud** — "Hey helloo," paired to an account (routes through a door above).

---

## 5. Migration as a first-class onboarding path (decided: yes)
Not a settings feature — a *front-door hook*. Why: it solves cold-start (useful in the first minute), targets exactly the people who care most (own-your-AI migrators with history + skill files), and it's a door competitors don't have (import *from inside* Claude/ChatGPT via MCP). "Bring your AI with you" can be the sign-up headline.

**Bring your memory (so the hello isn't cold):**
- **Import an export** — upload a ChatGPT/Claude/Gemini data export (.zip/.json) → parse → extract facts → seed the membrane memory.
- **MCP-to-MCP** — pull from another memory MCP directly (helloo *is* one).
- **"Talk to migrate"** — conversational bootstrap: helloo interviews you and builds the first memory live.

**Bring your skills / `.md` files (the "your job is a skill file" world):**
- **Upload a folder** of `.md` / `SKILL.md` files → ingested into the skill/tool registry (frontmatter → name/description/triggers).
- **Connect a Git repo of skills** → sync on push.
- **Paste a skill inline** — a Custom-GPT instruction, a Cursor rule, an agent `.md`.
- **Import a Custom GPT** — its instructions + knowledge files → a hello persona/agent.
- **Skill registry / marketplace** — install a published skill (v2/v3).
- **CLI** — `helloo pull <skill>` for devs.

---

## 6. Cross-cutting onboarding principles
- **Identity convergence.** WhatsApp today, web next week, Claude-MCP later — all resolve to **one hello**, anchored on verified email/phone. Every door funnels to it. Get this wrong → split memory across ghost accounts.
- **Progressive onboarding.** Don't force full setup. Minimal to start (email+OTP), works thin, enriches as you connect/talk. "Start empty, get richer."
- **Trust at the door.** The membrane/privacy promise appears *at connect*, not buried in settings — the first impression is "this is yours and private." Matters most to the migrators.
- **Re-entry / multi-device.** Coming back on a new device/channel — recognize me, don't make me redo it.

---

## 7. Open questions
- Which door is the **hero** for v1? (lean: web sign-up + inside-Claude/ChatGPT via MCP + Telegram — reach the own-your-AI migrators with no WhatsApp platform risk.)
- What's the **minimum** a hello needs before it's useful? (defines onboarding length.)
- Beachhead: **tech/builders (evangelist) vs creators/solopreneurs (paying)** — where to go deep first.
- Migration parsing: how much of a ChatGPT/Claude export is *usefully* extractable into atoms?

---

## 8. Research (folding in)
*Three research streams in progress — early-adopter personas + day-one demand + pull; creators as a segment; the acquisition hook + migration-as-onboarding + GTM. Findings + sources will be folded into §1–3 and §5.*
