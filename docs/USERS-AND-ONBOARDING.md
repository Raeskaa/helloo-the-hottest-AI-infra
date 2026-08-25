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

**Beachhead — decided by research (see §8):** the sharpest wedge is the **intersection: AI-native *technical solopreneurs* / indie hackers** (tech + runs a one-person business). They uniquely combine **lowest cost-to-reach** (dev channels, build-in-public — where helloo already lives), **business willingness-to-pay** (a tool that makes/saves money beats the $10 consumer ceiling), **extensibility appetite** (MCP/API/skills), and **loud evangelism**. Land there → expand to non-technical small-biz owners → creator-*entrepreneurs* ($2k–30k/mo). Students + aspiring creators = **growth/top-of-funnel, not revenue** (won't pay). Busy parents/pros = high-pain but slow/privacy-blocked → **phase 2**.

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
- Which door is the **hero** for v1? (lean: web sign-up + inside-Claude/ChatGPT via MCP + Telegram — reach the technical-solopreneur migrators with no WhatsApp platform risk.)
- What's the **minimum** a hello needs before it's useful? (defines onboarding length.)
- Migration parsing: how much of a ChatGPT/Claude export is *usefully* extractable into atoms? (incumbents' own imports are shallow — see §8.)

---

## 8. Research findings (2026, sourced)

**Market backdrop (constrains everything):**
- **Defaults barely leak.** ChatGPT ~800–900M weekly actives; <10% of weekly users even *visited* another provider in 2025; 91% reach for their preferred assistant for nearly every task. *You must be dramatically better at a specific job, not marginally better overall.* [a16z 2025; Menlo Ventures 2025]
- **Almost nobody pays.** ~3% of US AI users convert to paid; **93% won't pay more than $10/mo**; 81% of the $12B consumer market goes to general assistants, ~70% to OpenAI. → chase segments with *business/outcome* logic. [Menlo Ventures; Bloomberg Intelligence; NPR 2026]
- **Memory is now table stakes, not a differentiator** — OpenAI/Google/Anthropic all shipped it. BUT their memory is *shallow and non-portable* — the **owned, portable memory moat is still unclaimed.** That gap is helloo's opening. [a16z; Menlo; MemoryPlugin 2026]
- **Usage shifted from "tool" to "life"** — "organizing my life" and personal support nearly doubled YoY; validates the *personal-AI* framing over a productivity tool. [HBR/Forbes 2025]

**Segment scorecard (reach · pain · WTP · evangelism):**
| Segment | WTP | Reach/CAC | Role |
|---|---|---|---|
| **Technical solopreneurs / indie hackers** (tech ∩ small-biz) | **business WTP** | **lowest** (dev channels, build-in-public) | **★ Beachhead** |
| Non-technical small-biz / solopreneurs | strong (rising: 2+ AI-service adoption 10→18%, 88% holding/growing spend) | medium | expand next |
| Creator-*entrepreneurs* ($2k–30k/mo, 2+ platforms, brand deals) | $50–150/mo | creator word-of-mouth | paying vertical |
| Tech workers (broad) | high but self-host/rebuild; only ~29% trust AI output | lowest | evangelists, hard to keep |
| Busy pros / parents | good intent, $10 ceiling; privacy = #1 blocker | diffuse, pricey | phase 2 |
| Students / aspiring creators | ~0 (won't pay) | viral, cheap | **growth only, not revenue** |

**The 3 hooks that actually pull (ranked):**
1. **Migration-as-onboarding** — "paste your old AI's brain; now it's portable and *yours*." Incumbents shipped imports in 2026 but they're *shallow and lock-you-in*; a **neutral, user-owned membrane that imports from all and stays yours is a position they can't copy without cannibalizing their own lock-in.** Make the sign-up itself the aha (first 3 minutes). [Glasp; My Written Word 2026]
2. **Owned memory that compounds across every channel** — the retention loop (context → personalization → better output → return), delivered anywhere (Telegram/MCP/web) so no single channel ban can kill the asset. Retention > wow (Sora: 12M downloads, <8% D30). [VC Cafe 2025; a16z]
3. **A shareable "claim your hello" artifact** + scarce double-sided referral — product-as-distribution (like "Made with" loops); matches our federation viral loop. [AI-Native GTM Playbook 2026]

**Ownership/privacy as a selling message:** converts a *committed minority* (devs, students, small-biz with client data), **not the mainstream on its own** — "if privacy is the only differentiator, it appeals to privacy insiders." Reframe as a *felt benefit* (portable, works everywhere, no re-explaining, can't be leaked/subpoenaed), riding concrete 2025–26 trust failures (OpenAI court-ordered to retain deleted chats; ~300M-message leak; training-on-by-default). [Proton; Digiday; Glasp; Sonomos 2026]

**Trust is the whole GTM, not a feature.** Cross-account action is simultaneously the core *pull* and the #1 *barrier* — "the pitch and the objection are the same sentence." 71% of non-adopters cite data privacy; Signal's president calls agentic-AI privacy "profound." → the **trust layer + approval-gating + owned membrane** *is* the go-to-market. [Menlo; TechRadar 2026; Panoplai 2025]

**Day-one demands (deliver in the first session or lose them):**
1. Remember me without being re-told. 2. Connect real accounts fast + safely, with **visible, granular, revocable permissions** up front. 3. Actually *do* a task (send/schedule/book), with a confirm before anything irreversible. 4. Reach me where I already am (text-grade, zero learning curve). 5. Handle the universal first jobs: email/calendar/todo/research/repurpose. 6. Import my context so memory feels instant. [Menlo; Fortune 2025]

**GTM playbook (bootstrapped, cheap — proven at AI-native scale):**
1. **Build-in-public** founder channel, daily, with real numbers. 2. Authentic presence in 5–10 Reddit/HN/Discord communities + open-source a component. 3. **Product-as-distribution:** the "claim your hello" artifact wired to a **scarce double-sided referral**. 4. A small **paid creator micro-network** *after* ~500 users show pull. 5. **Credit-based free tier** as the upgrade trigger (controls inference cost). Activate together, then double down on whatever pulls hardest around ~500 users. [prodfolks 2026; AI-Native GTM Playbook]

*Caveats: several 2026 datapoints are from press/practitioner sources and future-dated events; load-bearing facts (won't-pay rates, defaults-don't-leak, memory-is-table-stakes, WhatsApp ban) recur across independent sources. Full sourced reports live in the private plan.*
