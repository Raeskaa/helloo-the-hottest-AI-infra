# Use Cases — grounded in how people actually run AI routines

> A use-case taxonomy for helloo, built from how people *really* use AI routines/automations today (2025–2026 research). The point isn't to list features — it's to structure use cases around what actually becomes a habit, and to attack the exact gaps every incumbent's "scheduled tasks" leave open. Companion: [`PRD.md`](../PRD.md), [`USERS-AND-ONBOARDING.md`](USERS-AND-ONBOARDING.md).

## The one insight that should govern every use case
A tracked user ran **~60 automations over 18 months — only 5 survived** past a month. The survivors all passed **three filters**, which we adopt as design law:
1. **Built-in trigger** — the task is *already* on a schedule or event (weekly report, invoice, aging thread), not discretionary.
2. **Defined destination** — output goes *to a person or system* (client, inbox, tracker). Every abandoned one had "decent output sitting in a doc, going nowhere."
3. **<30-second input** — if assembling the context takes minutes, the habit never forms.

> *"AI productivity is a habit-design problem dressed up as a prompt-engineering problem."*

**Two rules for every helloo use case:** (a) **close the loop to a real endpoint** — send / schedule / file, never produce a doc; (b) prefer **time-based or event-triggered** categories that already have a natural cadence.

---

## The competitive gap — why incumbents' routines fail (helloo's opening)
Every major assistant shipped a "scheduled tasks/routines" feature, and they fail in the *same* ways:

| Assistant | Feature | The crippling limits |
|---|---|---|
| ChatGPT | **Tasks** | ~10 active; min ~once/hour; **plain-text prompts only** (no Custom GPT, no files); notify-only |
| Gemini | **Scheduled Actions** + Gems + Daily Brief | ~10 actions; time-based only; notify-only |
| Claude | Code Routine / Desktop task / `/loop` | dev-centric; `/loop` expires ~7 days; **missed runs don't catch up**; 5 different mechanisms, none unified |
| Perplexity | Tasks | stopping a task **deletes** it; two overlapping systems |
| Copilot | Scheduled Prompts | ≤15 repeats; M365-only |
| Custom GPTs | personas | **cannot be invoked inside a scheduled Task** — customization and automation are walled off |

**The seven gaps helloo fills** (each is a differentiator):
1. **Conditional-by-default** — say *nothing* when nothing changed. Incumbents "fire no matter what" ("No birthdays today" every day) → the #1 way they become spam.
2. **Act, don't just notify** — send the reply, file the message, schedule the follow-up. The most-cited unmet want.
3. **Per-routine memory** — each run builds on the last (dedup "same info as yesterday"); incumbents are stateless across runs.
4. **Consolidate into one brief** — one merged digest, not N pings.
5. **Reliable scheduling + catch-up** on missed runs; accurate clock (ChatGPT "fails to keep real-world time").
6. **Event triggers, not just time** — real monitoring (price crosses X, email from boss) instead of hourly polling.
7. **Unify customization + scheduling** — schedulable personas/skills; no incumbent does this.

---

## The use-case taxonomy (12 categories)
For each: examples · who wants it most · trigger · memory/accounts needed. **★ = habit-forming core** (matches the 5 survivors: built-in trigger + real destination).

| # | Category | Example use-cases | Wants it most | Trigger | Needs |
|---|---|---|---|---|---|
| 1 | **Capture / Remember** | voice note/highlight → auto-tagged memory; "remember I promised Sam the deck Fri"; save article → summary+tags | students, creators, knowledge workers | event (on input) | personal memory; notes, read-only inbox |
| 2 ★ | **Digest / Brief** | morning brief (calendar + top emails + weather); weekly reading digest; end-of-day recap | busy pros/parents, PMs | time (daily/weekly) | preferences; calendar, gmail, feeds |
| 3 ★ | **Triage / Inbox** | overnight triage → "3 need you"; classify + route; surface commitments across Slack+email | knowledge workers, operators, solopreneurs | event + daily rollup | sender/priority memory; gmail, slack, tracker |
| 4 | **Draft / Send** | replies "in your voice"; follow-ups; invoice-reminder emails; captions | operators, solopreneurs, creators | event or on-demand | voice/style + relationship memory; gmail, stripe, social |
| 5 | **Schedule / Coordinate** | "find time with X"; fill family calendar from a forwarded schedule; reschedule conflicts | parents, PMs, busy pros | event + time upkeep | availability + household memory; calendar(s), contacts |
| 6 ★ | **Chase / Follow-up** | nudge unanswered threads; chase unpaid invoices; remind me *and* them; lead sequences | solopreneurs, operators | time (aging timer) | commitment ledger; gmail, CRM, stripe |
| 7 | **Monitor / Watch** | watch topic/competitor/price/keyword; "this email needs action"; CI/deploy failures | devs, creators, solopreneurs | event (condition) | watchlist + thresholds; web, github, inbox |
| 8 | **Research / Answer** | "prep me for the 2pm" one-pager from email+CRM+LinkedIn; Q&A with *my* context | PMs, knowledge workers, students | on-demand | deep personal+project memory; email, CRM, docs, web |
| 9 | **Repurpose / Create** | long-form → 6 platform posts; newsletter → a week of content; notes → flashcards | creators, students | event or on-demand | voice + audience/format memory; CMS, social, notes |
| 10 ★ | **Personal-ops / Admin** | month-end invoicing; receipt filing; appointment confirmations; renewals | solopreneurs, busy pros | time (recurring) | recurring-task + vendor memory; stripe, email, calendar, files |
| 11 | **Learn / Coach** | spaced-repetition review; habit check-ins with streak protection; progress recaps | students, self-improvers | time (daily/spaced) | progress + gap memory; notes, flashcards, calendar |
| 12 ★ | **Relationships / CRM** | "haven't talked to Priya in 3 months"; remember birthdays/kids/prefs; keep-in-touch cadence | solopreneurs, operators, everyone | time (cadence) + event | rich per-person memory; contacts, email, calendar |

**Anchor helloo's first use cases in the habit-forming core (★): Digest, Triage, Chase, Personal-ops, Relationships** — the categories that already have a built-in trigger and a real destination, so they become daily habits rather than novelties. The moat across *all twelve* is the same: **shared portable memory + cross-account authority** — the two things the stitched-together stacks can't do.

---

## User × routine map (what each segment actually runs today)
- **Developers / indie-hackers** — self-hosted workflows, CI/deploy alerts, scrape→summarize→notify, Raycast commands, "build the automation by describing it."
- **Content creators** — repurpose long-form → 6+ posts (~3–4 hrs saved each), newsletter → a week of content, AI script co-writer.
- **Students** — syllabus/notes → study guides → flashcards; real-time Q&A; PDF → flashcards.
- **Operators / PMs / knowledge workers** — overnight inbox triage → morning brief, drafts in-voice, auto meeting notes + pre-meeting one-pagers, commitments across Slack+email (avg knowledge worker = 11.7 hrs/wk on email, 121 emails/day).
- **Solopreneurs / small-biz** — appointment confirmations, invoice reminders, lead intake + follow-ups, social scheduling. Rule of thumb: "automate the task that happens weekly and takes >15 min."
- **Busy pros / parents** — forward a schedule → AI fills the shared family calendar; daily SMS roundup; morning briefing (weather + traffic + kid's schedule); meal plans.

---

## What proactivity should feel like (from the spam evidence)
**Resonates:** merged morning brief (calendar+email+weather in one glance); **decision-elimination** routines (outfit/meals/workout — "removes a micro-decision"); **filtered** digests where the value is what's *excluded*; one-time future reminders ("passport in 6 months").
**Feels like spam:** fires regardless of findings; no-op pings ("no birthdays today"); over-produced output nobody reads; unreliable recurrence (a "daily joke" that fired ~5×/month).
→ **helloo's proactivity earns its place only when it's conditional (silent when nothing changed), consolidated (one brief), reliable, and closes the loop (acts, not just alerts).**

---

## Worked example — Mahesh's own routines *(to fill in)*
Mahesh runs 2–3 daily routines himself. *(To be filled with the actual ones, then pressure-tested: how helloo does each one better via owned memory + acts-across-accounts + approval + conditional-by-default.)*

---

## Sources
Two research passes (feature landscape + real usage; automation stacks + taxonomy), 2025–2026 — ChatGPT Tasks / Gemini Scheduled Actions / Claude routines / Perplexity / Copilot docs + journalist accounts + practitioner build-in-public posts. Full sourced reports live in the private plan. Caveats: some ROI figures are vendor-sourced (directional); the 60-attempts/5-survivors figure is a well-circulated practitioner anecdote illustrating a real pattern, not a statistic; raw Reddit threads were not machine-fetchable so user-voice comes via journalist accounts of them.
