import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";
import { recall, findPeople, resolvePeople } from "@helloo/memory";
import {
  scheduleReminder,
  listReminders,
  cancelReminder,
  createWorkflow,
  listWorkflows,
  deleteWorkflow,
} from "@helloo/scheduler";
import { gate, recordTurn, turnCap, type ProposedAction, type RiskLevel } from "@helloo/trust";
import {
  getConnections,
  syncConnections,
  listAccounts,
  setDefaultAccount,
  labelAccount,
  executeAction,
  getComposioAiTools,
  initiateConnection,
  isWriteTool,
  webSearch,
  fetchGmailContacts,
  SUPPORTED_TOOLKITS,
  TOOLKIT_LABELS,
  type ConnectionState,
} from "@helloo/integrations";
import type { AppEnv } from "@helloo/core";
import { createAgent, listAgents, deleteAgent, getAgentByName } from "./agents";

/**
 * The daily loop (SYSTEM-MAP §3): recall memory → the model answers grounded in it, using the
 * user's connected accounts — **reads run autonomously, writes are routed through the trust gate
 * (queued for approval, never auto-sent)**. Learning (`ingest`) is done by the caller after the
 * reply, so the turn is one LLM round-trip. Host-agnostic; runs inside the per-user DO.
 */

export const AGENT_MODEL = "gemini-3.6-flash";

export interface RecalledFact {
  factText: string;
  score: number;
}
export interface PendingApproval {
  requestId: string;
  tool: string;
  summary: string;
}
export interface ExecutedAction {
  tool: string;
  summary: string;
  successful: boolean;
}
export interface ConverseResult {
  reply: string;
  recalled: RecalledFact[];
  pendingApprovals: PendingApproval[];
  executed: ExecutedAction[];
}

function toArgs(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? { ...v } : {};
}
function riskFor(slug: string): RiskLevel {
  // Anything that leaves the user's control (sends outward or destroys data) is irreversible.
  return /(SEND|REPLY|FORWARD|DELETE|REMOVE|TRASH)/i.test(slug) ? "irreversible" : "high";
}
function summarize(slug: string, args: Record<string, unknown>): string {
  const bits = Object.entries(args)
    .filter(([, v]) => typeof v === "string" && v.length < 80)
    .slice(0, 2)
    .map(([k, v]) => `${k}=${String(v)}`);
  return bits.length ? `${slug} (${bits.join(", ")})` : slug;
}

/** Options for a delegated (sub-agent) run — see helloo_ask_agent. */
export interface ConverseOptions {
  /** A custom-agent persona appended to the base system prompt. */
  persona?: string;
  /** Restrict Composio tools to this subset of the user's connected toolkits. */
  scopeToolkits?: string[];
  /** True when running as a delegated sub-agent: skips the spend cap (the outer turn counted it) and
   * the helloo-management tools (connect, reminders, workflows, agents…) to stay task-focused. */
  isSubAgent?: boolean;
}

export async function converse(
  env: AppEnv,
  ownerId: string,
  message: string,
  opts: ConverseOptions = {},
): Promise<ConverseResult> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for the agent loop");
  const isMain = !opts.isSubAgent;

  // Spend guard: count this turn and stop if the owner is over their daily cap (fail-open on error,
  // since the cap is abuse protection, not a critical-path check). Sub-agent runs skip it — the
  // outer turn already counted.
  const budget = isMain ? await recordTurn(env, ownerId, turnCap(env)).catch(() => null) : null;
  if (budget && !budget.allowed) {
    return {
      reply: `You've reached today's usage limit (${budget.cap} messages). It resets tomorrow — talk to you then.`,
      recalled: [],
      pendingApprovals: [],
      executed: [],
    };
  }

  const [hits, conn] = await Promise.all([
    recall(env, ownerId, message, 8),
    // Mirrored connection state (multi-account): reads our table, re-syncs from Composio only when
    // stale — so the hot path avoids a Composio round-trip + N writes every turn.
    getConnections(env, ownerId).catch((): ConnectionState => ({ toolkits: [], accounts: [] })),
  ]);
  // A sub-agent may be scoped to a subset of the user's connected toolkits.
  const toolkits = opts.scopeToolkits
    ? conn.toolkits.filter((t) => opts.scopeToolkits?.includes(t))
    : conn.toolkits;
  const accounts = conn.accounts;
  const memoryContext =
    hits.map((h) => `- ${h.atom.factText}`).join("\n") || "(nothing remembered yet)";

  // Reads run autonomously but through OUR executor, so they route to the toolkit's DEFAULT account
  // when the user has several of the same kind. Writes have the executor stripped so the SDK hands
  // the call back to us for gating (executeAction routes the account on approval).
  const raw = await getComposioAiTools(env, ownerId, toolkits).catch((): ToolSet => ({}));
  const tools: ToolSet = {};
  for (const [name, t] of Object.entries(raw)) {
    if (isWriteTool(name)) {
      const noExec = { ...t };
      delete noExec.execute;
      tools[name] = noExec;
    } else {
      tools[name] = { ...t, execute: async (input: unknown) => executeAction(env, ownerId, name, toArgs(input)) };
    }
  }

  // Connect-when-missing: let helloo offer to connect an account it doesn't have yet instead of
  // dead-ending. This only produces an OAuth link the user opens themselves, so it runs autonomously.
  const connectable = SUPPORTED_TOOLKITS.filter((t) => !toolkits.includes(t));
  if (isMain && connectable.length > 0) {
    tools.helloo_connect_account = tool({
      description:
        "Start connecting one of the user's accounts so helloo can use it. Returns a link the user " +
        "opens to authorize. Call this when the user asks to use an account that isn't connected " +
        "yet, or agrees to connect one — then share the link in your reply.",
      inputSchema: z.object({
        toolkit: z.string().describe(`Account to connect. One of: ${connectable.join(", ")}`),
      }),
      execute: async ({ toolkit }) => {
        if (!SUPPORTED_TOOLKITS.includes(toolkit)) {
          return { error: `Unsupported account "${toolkit}". Supported: ${SUPPORTED_TOOLKITS.join(", ")}` };
        }
        const link = await initiateConnection(env, ownerId, toolkit);
        return { toolkit, redirectUrl: link.redirectUrl };
      },
    });
  }

  // People graph: let the agent look up who a name refers to and the surfaces (email/handle/number)
  // it resolves to — the start of cross-channel identity ("who is Manish, and how do I reach them").
  tools.helloo_find_person = tool({
    description:
      "Look up a person the user knows by name (or by an email/handle) and get the accounts and " +
      "contact points they resolve to. Use before emailing/messaging someone to find their address.",
    inputSchema: z.object({
      name: z.string().describe("A person's name, email, or handle to look up"),
    }),
    execute: async ({ name }) => {
      const people = await findPeople(env, ownerId, name, 5);
      return { matches: people };
    },
  });

  // People auto-fill: build/refresh the contact graph from the user's Gmail (senders → people,
  // unifying anyone already known by name). Only when Gmail is connected.
  if (isMain && toolkits.includes("gmail")) {
    tools.helloo_import_contacts = tool({
      description:
        "Scan the user's recent Gmail and add the people they correspond with to their contact graph " +
        "(unifying anyone already known). Use when they ask to build/update their contacts or mailing list.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional().describe("How many recent emails to scan (default 40)"),
      }),
      execute: async ({ limit }) => {
        const contacts = await fetchGmailContacts(env, ownerId, limit ?? 40);
        return resolvePeople(
          env,
          ownerId,
          contacts.map((c) => ({ name: c.name, channel: "email", value: c.email })),
        );
      },
    });
  }

  // Management tools (scheduling, workflows, accounts, sub-agents) are for the MAIN helloo only —
  // a delegated sub-agent stays focused on the task with just the action + lookup tools.
  if (isMain) {
  // Proactive scheduling: helloo can message the user LATER — a one-off reminder or a recurring
  // brief. The Worker's cron delivers due reminders; these tools just create/list/cancel them.
  tools.helloo_schedule_reminder = tool({
    description:
      "Schedule helloo to message the user at a future time — a one-off reminder or a recurring " +
      "brief. Use whenever the user asks to be reminded, nudged, or briefed later/daily/weekly. " +
      "runAt is an ISO 8601 UTC timestamp in the future (compute it from the current time given " +
      "below). If the user gives a wall-clock time and you don't know their timezone, ask first.",
    inputSchema: z.object({
      runAt: z.string().describe("First fire time, ISO 8601 UTC, e.g. 2026-09-12T08:00:00Z. Must be future."),
      repeat: z.enum(["none", "daily", "weekly"]).describe("Recurrence"),
      mode: z
        .enum(["say", "run"])
        .describe(
          "'say' = deliver body text as-is (a plain reminder). 'run' = run body as an instruction " +
            "and deliver the result (a brief, e.g. 'summarise today's calendar and unread email').",
        ),
      body: z.string().describe("The reminder text (say) or the instruction to run (run)."),
    }),
    execute: async ({ runAt, repeat, mode, body }) => {
      const when = new Date(runAt);
      if (Number.isNaN(when.getTime())) return { error: "runAt must be a valid ISO 8601 datetime" };
      if (when.getTime() < Date.now() - 60_000) return { error: "runAt is in the past" };
      const r = await scheduleReminder(env, ownerId, { mode, body, repeat, nextRunAt: when });
      return { scheduled: true, id: r.id, nextRunAt: r.nextRunAt.toISOString(), repeat: r.repeat };
    },
  });
  tools.helloo_list_reminders = tool({
    description: "List the user's active scheduled reminders and briefs.",
    inputSchema: z.object({}),
    execute: async () => {
      const items = await listReminders(env, ownerId);
      return {
        reminders: items.map((r) => ({
          id: r.id,
          when: r.nextRunAt.toISOString(),
          repeat: r.repeat,
          mode: r.mode,
          body: r.body,
        })),
      };
    },
  });
  tools.helloo_cancel_reminder = tool({
    description: "Cancel a scheduled reminder by id (get ids from helloo_list_reminders).",
    inputSchema: z.object({ id: z.string().describe("The reminder id to cancel") }),
    execute: async ({ id }) => ({ cancelled: await cancelReminder(env, ownerId, id) }),
  });

  // Workflows: event-triggered automations. v1 trigger = a new matching email; when it arrives the
  // cron runs `instruction` as an agent turn (writes still gated) and delivers the result.
  tools.helloo_create_workflow = tool({
    description:
      "Create an automation that runs WHEN a new email arrives matching a filter — e.g. 'when I get " +
      "an email from my landlord, summarise it and tell me'. The instruction runs as an agent turn " +
      "(any action it proposes is still queued for approval). Use for 'when X happens, do Y' requests.",
    inputSchema: z.object({
      name: z.string().describe("Short name for the automation"),
      matchFrom: z.string().optional().describe("Only fire when the sender contains this (e.g. an email/name); omit for any"),
      matchSubject: z.string().optional().describe("Only fire when the subject contains this; omit for any"),
      instruction: z.string().describe("What helloo should do when it fires (it receives the email's from/subject/snippet)"),
    }),
    execute: async ({ name, matchFrom, matchSubject, instruction }) => {
      if (!toolkits.includes("gmail")) {
        return { error: "Email workflows need Gmail connected first." };
      }
      const r = await createWorkflow(env, ownerId, { name, matchFrom, matchSubject, instruction });
      return { created: true, id: r.id };
    },
  });
  tools.helloo_list_workflows = tool({
    description: "List the user's active automations/workflows.",
    inputSchema: z.object({}),
    execute: async () => ({ workflows: await listWorkflows(env, ownerId) }),
  });
  tools.helloo_delete_workflow = tool({
    description: "Delete an automation by id (get ids from helloo_list_workflows).",
    inputSchema: z.object({ id: z.string().describe("The workflow id to delete") }),
    execute: async ({ id }) => ({ deleted: await deleteWorkflow(env, ownerId, id) }),
  });
  } // end isMain (scheduling + workflows)

  // Web search (Tavily) — only when configured. The read primitive behind "what's the latest on…",
  // news, research, and the daily brief.
  if (env.TAVILY_API_KEY) {
    tools.web_search = tool({
      description:
        "Search the live web for current information — news, facts, prices, research, anything not " +
        "in the user's memory or accounts. Returns a synthesised answer plus source links. Use it " +
        "whenever the user asks about the outside world or recent events, and cite the sources.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().int().min(1).max(10).optional().describe("How many sources (default 5)"),
      }),
      execute: async ({ query, maxResults }) => {
        const r = await webSearch(env, query, maxResults ?? 5);
        return { answer: r.answer, results: r.results };
      },
    });
  }

  if (isMain) {
  // Multi-account: let the user see/switch/rename accounts when they have several of one kind.
  tools.helloo_list_accounts = tool({
    description:
      "List the user's connected accounts per app, showing which is the default. Use when they ask " +
      "what's connected or which account is being used.",
    inputSchema: z.object({}),
    execute: async () => ({
      accounts: accounts.map((a) => ({
        app: TOOLKIT_LABELS[a.toolkit] ?? a.toolkit,
        label: a.label,
        default: a.isDefault,
        status: a.status,
      })),
    }),
  });
  tools.helloo_set_default_account = tool({
    description:
      "Set which connected account is the default for its app (used for reads and actions). Match by " +
      "the account's label or id from helloo_list_accounts. Use when the user says 'use my <X> account'.",
    inputSchema: z.object({ account: z.string().describe("Label or id of the account to make default") }),
    execute: async ({ account }) => setDefaultAccount(env, ownerId, account),
  });
  tools.helloo_label_account = tool({
    description: "Rename a connected account (e.g. call one 'work' and another 'personal') to refer to it easily.",
    inputSchema: z.object({
      account: z.string().describe("Current label or id of the account"),
      newLabel: z.string().describe("The new name"),
    }),
    execute: async ({ account, newLabel }) => ({ renamed: await labelAccount(env, ownerId, account, newLabel) }),
  });
  tools.helloo_refresh_accounts = tool({
    description:
      "Re-check the user's connected accounts from scratch. Use right after they connect a new account " +
      "and it isn't showing yet.",
    inputSchema: z.object({}),
    execute: async () => {
      await syncConnections(env, ownerId);
      const a = await listAccounts(env, ownerId);
      return {
        accounts: a.map((x) => ({
          app: TOOLKIT_LABELS[x.toolkit] ?? x.toolkit,
          label: x.label,
          default: x.isDefault,
          status: x.status,
        })),
      };
    },
  });

  // Make-an-agent: create/list/delete custom agents (personas), and delegate a task to one.
  tools.helloo_create_agent = tool({
    description:
      "Create a custom agent — a named persona the user can delegate to (e.g. a 'Recruiter' that writes " +
      "cold emails, or a 'Coach'). Use when the user asks to make/set up an agent or assistant persona.",
    inputSchema: z.object({
      name: z.string().describe("Short name, e.g. 'Recruiter'"),
      persona: z.string().describe("Instructions defining how this agent behaves and what it's for"),
      description: z.string().optional().describe("One-line description"),
      toolkits: z.array(z.string()).optional().describe("Restrict to these connected apps (e.g. ['gmail']); omit for all"),
    }),
    execute: async ({ name, persona, description, toolkits: tk }) => {
      const r = await createAgent(env, ownerId, { name, persona, description, toolkits: tk });
      return { created: true, id: r.id, name };
    },
  });
  tools.helloo_list_agents = tool({
    description: "List the user's custom agents.",
    inputSchema: z.object({}),
    execute: async () => {
      const list = await listAgents(env, ownerId);
      return { agents: list.map((a) => ({ name: a.name, description: a.description, toolkits: a.toolkits })) };
    },
  });
  tools.helloo_delete_agent = tool({
    description: "Delete a custom agent by name.",
    inputSchema: z.object({ name: z.string().describe("The agent's name") }),
    execute: async ({ name }) => ({ deleted: await deleteAgent(env, ownerId, name) }),
  });
  tools.helloo_ask_agent = tool({
    description:
      "Delegate a task to one of the user's custom agents (get names from helloo_list_agents). Use when " +
      "the user says 'ask my <name> agent to …' or a task fits a persona they created.",
    inputSchema: z.object({
      agent: z.string().describe("The custom agent's name"),
      task: z.string().describe("What to ask that agent to do"),
    }),
    execute: async ({ agent: agentName, task }) => {
      const a = await getAgentByName(env, ownerId, agentName);
      if (!a) return { error: `No agent named "${agentName}". Create one with helloo_create_agent.` };
      const sub = await converse(env, ownerId, task, {
        persona: a.persona,
        scopeToolkits: a.toolkits ?? undefined,
        isSubAgent: true,
      });
      return { agent: a.name, reply: sub.reply, pendingApprovals: sub.pendingApprovals.length };
    },
  });
  } // end isMain (accounts + agents)

  // Only mention accounts in the prompt when a toolkit has more than one (otherwise it's noise).
  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");
  const counts = new Map<string, number>();
  for (const a of activeAccounts) counts.set(a.toolkit, (counts.get(a.toolkit) ?? 0) + 1);
  const hasMultiAccount = [...counts.values()].some((n) => n > 1);
  const accountNote = hasMultiAccount
    ? "\nSome apps have MULTIPLE connected accounts — actions use the one marked (default). If the " +
      "user means a different one, switch it with helloo_set_default_account first, or ask which. " +
      "Accounts: " +
      activeAccounts
        .map((a) => `${TOOLKIT_LABELS[a.toolkit] ?? a.toolkit} → ${a.label}${a.isDefault ? " (default)" : ""}`)
        .join("; ")
    : "";

  const connectedLabels = toolkits.map((t) => TOOLKIT_LABELS[t] ?? t);
  const connectableLabels = connectable.map((t) => TOOLKIT_LABELS[t] ?? t);

  const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
  const result = await generateText({
    model: google(AGENT_MODEL),
    system:
      "You are the user's helloo — their own personal AI. First person, concise, warm, plain " +
      "language. No corporate filler, no 'As an AI'.\n\n" +
      (opts.persona
        ? `You are acting as the user's custom agent. Persona/instructions:\n${opts.persona}\n\n`
        : "The user can create custom agents (personas) and delegate to them — use helloo_create_agent " +
          "when they ask to make one, and helloo_ask_agent to hand a task to one.\n\n") +
      "GROUNDING: Answer from what you remember about them (below), their connected accounts (via " +
      "tools), and general knowledge. If a personal fact isn't in memory or an account, say you " +
      "don't know it yet — never invent names, numbers, dates, or events.\n\n" +
      "READS run automatically (fetching email, listing events, reading Slack, looking up people, " +
      "searching the web). Use them before answering questions about the user's accounts, contacts, " +
      "or the outside world rather than guessing. For anything current/external (news, facts, prices, " +
      "research) use web_search and cite sources. To find someone's email/handle, use helloo_find_person. " +
      "For Slack, resolve a channel or person to an id first (find channels / find users), then read " +
      "history or search.\n\n" +
      "WRITES (send/reply, create/update/delete an event, post to Slack, add a task) are never done " +
      "silently: call the tool and it is queued for the user's approval. Tell them it's waiting for " +
      "their approval — do NOT claim it's done or sent.\n\n" +
      "MISSING ACCOUNT: if something needs an account that isn't connected, call " +
      "helloo_connect_account and give the user the link to authorize — don't just refuse. After they " +
      "authorize, if a just-connected account isn't showing, use helloo_refresh_accounts. Only the " +
      "accounts below can be connected; for anything else, say it's not supported yet.\n\n" +
      "SCHEDULING: you can message the user later — use helloo_schedule_reminder for a reminder or a " +
      "recurring brief (daily/weekly). Compute runAt as an ISO 8601 UTC time from the current time " +
      "below; if the user names a wall-clock time and you don't know their timezone, ask for it first.\n\n" +
      "If a tool errors or returns nothing, say so plainly and suggest the next step.\n\n" +
      `Current time (UTC): ${new Date().toISOString()}.\n` +
      `Connected accounts: ${connectedLabels.length ? connectedLabels.join(", ") : "none"}.${accountNote}\n` +
      `Can be connected on request: ${connectableLabels.length ? connectableLabels.join(", ") : "none"}.\n` +
      `What you remember about the user:\n${memoryContext}`,
    prompt: message,
    tools,
    stopWhen: stepCountIs(5),
  });

  // Gate the writes the model proposed (reads already ran autonomously).
  const pendingApprovals: PendingApproval[] = [];
  const executed: ExecutedAction[] = [];
  for (const call of result.toolCalls) {
    if (!isWriteTool(call.toolName)) continue;
    const args = toArgs(call.input);
    const action: ProposedAction = {
      tool: call.toolName,
      args,
      actsExternally: true,
      touchesSensitive: false,
      readsUntrusted: false,
      risk: riskFor(call.toolName),
      actionClass: call.toolName,
    };
    const decision = await gate(env, ownerId, action);
    const summary = summarize(call.toolName, args);
    if (decision.decision === "needs_approval" && decision.requestId) {
      pendingApprovals.push({ requestId: decision.requestId, tool: call.toolName, summary });
    } else if (decision.decision === "allow") {
      const res = await executeAction(env, ownerId, call.toolName, args);
      executed.push({ tool: call.toolName, summary, successful: res.successful });
    }
  }

  let reply = result.text.trim();
  if (!reply) {
    if (pendingApprovals.length > 0) {
      reply = `I've prepared ${pendingApprovals.length} action(s) that need your approval before I proceed.`;
    } else if (executed.length > 0) {
      reply = "Done.";
    } else {
      reply = "…";
    }
  }

  return {
    reply,
    recalled: hits.map((h) => ({ factText: h.atom.factText, score: h.score })),
    pendingApprovals,
    executed,
  };
}
