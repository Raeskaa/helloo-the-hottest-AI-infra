# External references — repos & tools to mine

> Running log of external repos/tools we're evaluating, with an honest **"can we actually use it
> here?"** verdict. Our backend is **Cloudflare Workers** — no persistent runtime, HTTP-only — so the
> real filter is: *does it run as an HTTP API / JS-TS lib, or does it need a container / browser /
> Python runtime?* Add new finds here; promote the usable ones into `FEATURE-REQUESTS.md` / the build.

## Directly usable (HTTP APIs / TS — fit Workers)
| Source | What | Use in helloo |
|---|---|---|
| [awesome-autonomous-web](https://github.com/Agent-Tools/awesome-autonomous-web) → **Tavily / Exa / Serper / Brave** | LLM-native web-search APIs | ✅ **web_search tool** — Tavily wired (needs key) |
| same → **FireCrawl / Spider** | Hosted scrape / read-a-URL (HTTP) | 🔜 "read this page/PDF" tool when needed |
| same → **Browserbase / Steel / Anchor** | Cloud browsers via HTTP | 🔜 "operate a website" (the Workers-safe path to browser automation) |

## Reference / inspiration only (Python · browser-extension · research — NOT drop-in)
| Source | What it is | Why not import — what to take |
|---|---|---|
| [500-AI-Agents-Projects](https://github.com/ashishpatel26/500-AI-Agents-Projects) | 500 use-cases + Python example agents (CrewAI/AutoGen/LangGraph/Agno) | Different stack. **Take:** use-case ideas → feed `FEATURE-REQUESTS.md`. |
| [AIHawk](https://github.com/feder-cr/AIHawk) | Python bot that auto-applies to jobs (LinkedIn Easy Apply) | Python + browser automation of LinkedIn (ToS-risky, ban-prone). **Take:** the *job-seeker vertical* shape (Srijeeta's asks) — do the safe parts we already can: draft referral/application mails, JD analysis, interview prep, track applications in a sheet. **Avoid** auto-submitting on LinkedIn. |
| [fuji-web](https://github.com/normal-computing/fuji-web) | In-browser web agent (Chrome extension, DOM+LLM) | Needs a real browser. **Take:** the browsing-agent *approach*; on Workers we'd reach it via a cloud browser (Browserbase/Steel), not this extension. |
| [lumos](https://github.com/allenai/lumos) | Research framework for modular LLM agents (planning/grounding), Python | Research/training code. **Take:** agent-design ideas (plan → ground → act separation) for our converse loop. |
| [ClawBench](https://github.com/TIGER-AI-Lab/ClawBench) | Benchmark for evaluating agents | Not a feature — an **eval harness**. **Take:** use it *later* to measure helloo's agent quality, not to build a feature now. |

## The pattern
Almost everything interesting in this space is **Python or a browser extension**. For helloo (TS on
Workers) the reusable slice is: **hosted HTTP APIs** (search, scrape, cloud-browser) we call as tools,
plus **architecture ideas** we reimplement. We don't fork Python agent frameworks — we wire their
capabilities as tools behind our trust gate.
