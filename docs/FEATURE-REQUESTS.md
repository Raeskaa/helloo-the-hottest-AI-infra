# Features requested by potential users

> Living market-research log. Real people were asked: *"what should helloo — your personal Jarvis —
> be able to do?"* Their answers are kept **verbatim** below (voice preserved), then distilled into a
> capability map: **what's possible today (ticked)** vs **what's in line of work**. Add new responses
> as they come in and re-run the analysis. Newest research on top of §1; keep the analysis (§2–§4) in sync.

Status legend: **✅ today** (works now) · **🟡 partial** (foundation exists / small work or a reconnect) ·
**🔴 not yet** (needs new building) · **⛔ won't auto-do** (we can prepare/draft, but never execute money/trades silently — trust rule).

---

## 1. Raw responses (verbatim)

**R1 — Ujjwal (trader)**
1. Overnight foreign market + latest news + headlines
2. News related to portfolio which can affect it
3. During the day — Targets and SL info
4. On voice, buying and sell orders

**R2 — Srijeeta (BA graduate, job hunting)**
- Draft pre-decided mails — for referral / application
- Application tracking
- JD analysis
- LinkedIn optimization and postings / management
- Research company culture with job roles
- Interview prep according to job roles

**R3 — Rajora (4th-year B.Tech, IITG)**
1. Recalls and reminds my to-do list which it follows from my daily routine
2. Mails check, reminder to connect to family members, track daily/weekly expenses, maintaining health checklist or medicinal check, sleep tracking
3. Gives an idea about the nature of surrounding people, fairly accurate (the voice function). WhatsApp pe to work karega hi
4. Maintaining our mobile updates
5. Wishing someone for their special day or occasions
6. Maintaining relationships
7. Stock up the things or ready the cart for us so things are always ready — food, fruits, Amazon, wagers sab
8. Tracks daily where we are wasting our time or with which people the trash talk is happening
9. Also — stay hydrated

**R4 — Mojo (ex-Amazon SDE1 / Samsung SDE2, now building a startup; agreed with Rajora)**
1. Reminds me to take care of my people who need extra attention today

**R5 — Manish**
1. Mails — reply and notify, draft and review and summarise
2. Cab booking — should know daily where I go from/to and book as I say (movie/food/etc.)
3. If update calls come, automatically pick up and reply
4. Fund management — auto payment and investment
5. Help me reply to girls — add conversation and persuasion skills in my personality and chat
6. The skills I lack, it should have
7. Before meetings, do homework and research

**R6 — Naman (manager & 3D artist at a big studio)**
1. Teach me about the knowledge I lack
2. Be my personal assistant
3. Understand my vision for what I want to make, in very few words
4. Must have all my history — become my digital double, but not fully
5. Build my vision with all my inputs
6. Must be able to take over all my responsibilities including money and calls if I want to go out of station
7. Must understand what "dogesh bhai" is like (meme culture)

**R7 — Bikram (lead frontend at a startup)**
- Remind me about my tasks
- Health track (drink water, calories, etc.)
- According to my career, suggest a few things to read that help me grow
- Some curated content ideas

**R8 — Nitesh (2nd-year Masters, IITG CSE)**
1. Reminds me everything
2. Read my Gmail and WhatsApp chat and automatically do the task that is assigned to me
3. Report automatically after completing the work
4. Two different LLMs discuss a single problem — one's output reviewed by the other and vice versa, until they reach a conclusion
5. Entertain me
6. Better suggestions on everything
7. Daily updates of what's happening in the world, related to my work

---

## 2. Possible today ✅ (ticked)

These map onto capabilities that already run (Gmail/Calendar/Tasks/Sheets, memory, drafting in the
user's voice, LLM reasoning, connect-from-chat). Some need a connected account or a reconnect.

- [x] **Draft / reply / send email** — referral & application mails, replies in *your* style (R2, R5.1, R5.5, R8.2-partial). *Gated: you approve the send.*
- [x] **Summarise & triage inbox** — review, summarise, notify-on-open (R5.1, R3.2, R8.2).
- [x] **Calendar** — see the day, add/move/cancel events (R3, R5.7 partial).
- [x] **To-do / tasks** — capture and list tasks (R3.1, R7, R8.1) — *capture works; auto-firing reminders don't yet (see §3).*
- [x] **Remember your history & preferences** — recall facts, routines, people (R6.4, R6.3, memory core).
- [x] **JD analysis / interview prep / "teach me what I lack"** — paste a JD or ask; reasoning + your context (R2, R6.1, R5.6, N-style coaching).
- [x] **Draft in your voice / persuasion help** — style carried from memory (R5.5, R6.3).
- [x] **Curated reading & content ideas** — career reading, content angles (R7, R8.6).
- [x] **Meeting homework (partial)** — read the calendar + reason; deeper research needs web search (R5.7).
- [x] **Look up a person you know** — who they are + contact points (R3.6, R4.1 — the People graph).
- [x] **Connect / reconnect accounts from chat** — helloo hands you an OAuth link when it needs one.
- [x] **Sheets / Docs** — read a sheet, append a row, read/create a doc (expense/application logs as a stopgap; Docs needs a reconnect).

## 3. In line of work 🔴 — grouped by the primitive that unlocks each

The requests cluster around a few missing **primitives**. Building each unlocks many asks at once.

### A. Proactive / scheduled triggers  *(the single biggest unlock — foundation now BUILT ✅)*
helloo can now **message you first**: a cron-driven scheduler delivers reminders and recurring briefs.
Ask *"remind me…"* or *"every morning tell me…"* and it schedules it (one-off / daily / weekly),
then delivers on your channel — either a plain reminder or a live agent brief. *Verified E2E in prod.*
- ✅ Reminders that fire at a time or recur (R3.1, R7, R8.1, "reminds me everything") — **built** (`helloo_schedule_reminder`)
- 🟡 Daily brief — a "run" reminder can already summarise your day/inbox each morning (R1.1-partial, R8.7, R7); market/world news still needs web search (§B)
- 🟡 Nudges: family, relationships, special-day wishes (R3.2, R3.5, R3.6, R4.1, R6) — schedulable now; auto-deriving *who/when* from the people graph is next
- ✅ Health nudges: hydrate, medicine, sleep on a schedule (R3.2, R7) — **built**
- 🟡 "Report automatically after finishing a task" (R8.3) — schedulable; task-completion detection is separate

### B. Web / news / research
- 🔴 Overnight markets, headlines, portfolio-affecting news (R1.1, R1.2)
- 🔴 Company-culture & role research, world updates related to your work (R2, R8.7)
- 🔴 Deep meeting prep / research (R5.7)

### C. Voice & telephony
- 🔴 Talk to helloo by voice (R1.4, R3.3)
- 🔴 Auto-pick-up / place calls on your behalf (R5.3, R6.6)

### D. More channels
- 🔴 **WhatsApp** (user's own account): read/act on WhatsApp chats; reachable on WhatsApp (R3.3, R8.2) — Baileys sandbox path (see the ban note).
- 🔴 **helloo as an MCP server** — reach helloo (its memory + tools) from inside Claude / ChatGPT / any MCP client. *(Already tracked in the plan; the horizontal-infra play — added per Mahesh's request.)*
- 🔴 **Voice / telephony** — see §C.

### E. People / sentiment intelligence
- 🟡 People graph exists (names → contact points); **cross-channel unification is being filled in** (R3.6, R4.1)
- 🔴 "Nature of surrounding people" / where your time & trash-talk goes (R3.3, R3.8) — sentiment + activity analysis

### F. Vertical integrations
- 🔴 Ride booking with learned routes (R5.2)
- 🔴 Shopping / auto-cart: groceries, Amazon (R3.7)
- 🔴 LinkedIn: optimise, post, manage (R2)
- 🔴 Application tracker (dedicated, beyond a sheet) (R2)
- 🔴 Device/OS "mobile updates" (R3.4)

### G. Money & trading  ⛔ (prepare, never auto-execute)
- ⛔ Buy/sell orders, auto-payments, auto-investment, "take over money" (R1.4, R5.4, R6.6) — helloo can
  research, draft, and set up, but **executing a trade or moving money is never silent** — it stops at your explicit approval, by design (trust rule). Full auto-execution is intentionally out of scope.

### H. Fun / novel
- ✅/🔴 Entertain me, meme-culture fluency ("dogesh bhai") (R8.5, R6.7) — LLM does light versions today.
- 🔴 **Two-LLM debate to consensus** (R8.4) — a self-review loop between models; buildable on our agent as a distinct mode.

## 4. Signal summary (what to build first)
1. ✅ **Proactive scheduler** — DONE (reminders + recurring briefs). Most-requested cluster now unlockable.
2. **Web/news search tool** — next; unlocks research, markets, world updates, company culture (§B). *Also makes the daily brief genuinely useful.*
3. **Channels** — **WhatsApp**, **voice/telephony**, and **helloo-as-MCP** (reachable inside Claude/ChatGPT).
4. **People-graph auto-fill** — so nudges/wishes derive *who & when* automatically.
5. Then verticals (shopping, ride, LinkedIn) as connectors, and the multi-LLM debate mode.
