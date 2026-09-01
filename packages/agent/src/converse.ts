import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { z } from "zod";
import { recall, ingestText } from "@helloo/memory";
import { gate, type ProposedAction } from "@helloo/trust";
import type { AppEnv } from "@helloo/core";

/**
 * The daily loop (SYSTEM-MAP §3), v1: recall memory → the model answers grounded in it →
 * any action it proposes is routed through the trust gate (never auto-executed) → the turn is
 * learned back into memory. Host-agnostic logic; it moves into a per-user Durable Object when
 * we need durable state / proactivity (ADR-0007). Provider-agnostic via the AI SDK (Gemini today).
 */

export const AGENT_MODEL = "gemini-3.6-flash";

const emailArgs = z.object({
  to: z.string().describe("recipient email address"),
  subject: z.string(),
  body: z.string(),
});

export interface RecalledFact {
  factText: string;
  score: number;
}
export interface PendingApproval {
  requestId: string;
  tool: string;
  summary: string;
}
export interface ConverseResult {
  reply: string;
  recalled: RecalledFact[];
  pendingApprovals: PendingApproval[];
  learned: { added: number; updated: number };
}

export async function converse(
  env: AppEnv,
  ownerId: string,
  message: string,
): Promise<ConverseResult> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for the agent loop");

  // 1. Recall what we know that's relevant.
  const hits = await recall(env, ownerId, message, 8);
  const memoryContext =
    hits.map((h) => `- ${h.atom.factText}`).join("\n") || "(nothing remembered yet)";

  // 2. Reason. The action tool has NO execute — the SDK hands the call back so we gate it.
  const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
  const result = await generateText({
    model: google(AGENT_MODEL),
    system:
      "You are the user's helloo — their personal AI. Answer using what you remember about them " +
      "(below) plus general knowledge. If a personal fact isn't in memory, say you don't know it " +
      "yet rather than inventing it. Be concise and warm.\n\n" +
      `What you remember about the user:\n${memoryContext}`,
    prompt: message,
    tools: {
      send_email: tool({
        description:
          "Send an email on the user's behalf. Use ONLY when the user clearly asks to send or reply to someone.",
        inputSchema: emailArgs,
      }),
    },
  });

  // 3. Gate any proposed actions (approve-before-act). Never execute here.
  const pendingApprovals: PendingApproval[] = [];
  for (const call of result.toolCalls) {
    if (call.toolName !== "send_email") continue;
    const parsed = emailArgs.safeParse(call.input);
    if (!parsed.success) continue;
    const args = parsed.data;
    const action: ProposedAction = {
      tool: "send_email",
      args,
      actsExternally: true,
      touchesSensitive: false,
      readsUntrusted: false,
      actionClass: "email_send",
      contact: args.to,
      reason: message,
    };
    const decision = await gate(env, ownerId, action);
    if (decision.decision === "needs_approval" && decision.requestId) {
      pendingApprovals.push({
        requestId: decision.requestId,
        tool: "send_email",
        summary: `Send email to ${args.to} — "${args.subject}"`,
      });
    }
  }

  // 4. Compose the reply.
  let reply = result.text.trim();
  if (!reply && pendingApprovals.length > 0) {
    reply = `I've prepared ${pendingApprovals.length} action(s) that need your approval before I proceed.`;
  }

  // 5. Learn from the user's message (write path).
  const learned = await ingestText(env, ownerId, message, "conversation");

  return {
    reply,
    recalled: hits.map((h) => ({ factText: h.atom.factText, score: h.score })),
    pendingApprovals,
    learned: { added: learned.added, updated: learned.updated },
  };
}
