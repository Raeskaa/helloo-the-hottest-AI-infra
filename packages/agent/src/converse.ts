import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs, type ToolSet } from "ai";
import { recall } from "@helloo/memory";
import { gate, type ProposedAction, type RiskLevel } from "@helloo/trust";
import { connectedToolkits, executeAction, getComposioAiTools, isWriteTool } from "@helloo/integrations";
import type { AppEnv } from "@helloo/core";

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
  return /(SEND|DELETE|REMOVE|TRASH)/i.test(slug) ? "irreversible" : "high";
}
function summarize(slug: string, args: Record<string, unknown>): string {
  const bits = Object.entries(args)
    .filter(([, v]) => typeof v === "string" && v.length < 80)
    .slice(0, 2)
    .map(([k, v]) => `${k}=${String(v)}`);
  return bits.length ? `${slug} (${bits.join(", ")})` : slug;
}

export async function converse(
  env: AppEnv,
  ownerId: string,
  message: string,
): Promise<ConverseResult> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for the agent loop");

  const [hits, toolkits] = await Promise.all([
    recall(env, ownerId, message, 8),
    connectedToolkits(env, ownerId).catch((): string[] => []),
  ]);
  const memoryContext =
    hits.map((h) => `- ${h.atom.factText}`).join("\n") || "(nothing remembered yet)";

  // Reads keep their executor (autonomous); writes have it stripped so the SDK hands the call
  // back to us for gating instead of running it.
  const raw = await getComposioAiTools(env, ownerId, toolkits).catch((): ToolSet => ({}));
  const tools: ToolSet = {};
  for (const [name, t] of Object.entries(raw)) {
    if (isWriteTool(name)) {
      const noExec = { ...t };
      delete noExec.execute;
      tools[name] = noExec;
    } else {
      tools[name] = t;
    }
  }

  const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
  const result = await generateText({
    model: google(AGENT_MODEL),
    system:
      "You are the user's helloo — their personal AI. Answer using what you remember about them " +
      "(below), general knowledge, and their connected accounts (use the tools when relevant). " +
      "If a personal fact isn't in memory or their accounts, say you don't know it yet rather than " +
      "inventing it. For anything that sends, creates, or changes something, DO call the tool — it " +
      "will be queued for the user's approval, not executed silently. Be concise and warm.\n\n" +
      `Connected accounts: ${toolkits.length ? toolkits.join(", ") : "none"}.\n` +
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
