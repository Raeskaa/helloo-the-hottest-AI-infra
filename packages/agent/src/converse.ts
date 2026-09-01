import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import { recall, ingestText } from "@helloo/memory";
import { gate, type ProposedAction } from "@helloo/trust";
import { connectedToolkits, executeAction } from "@helloo/integrations";
import type { AppEnv } from "@helloo/core";

/**
 * The daily loop (SYSTEM-MAP §3): recall memory → the model answers grounded in it, reading
 * from connected accounts when useful → any action it proposes is routed through the trust gate
 * (read-only runs autonomously & logged; a send is parked for approval, never auto-sent) → the
 * turn is learned back into memory. Host-agnostic; moves into a per-user DO later (ADR-0007).
 */

export const AGENT_MODEL = "gemini-3.6-flash";

const GMAIL_SEND = "GMAIL_SEND_EMAIL";
const GMAIL_FETCH = "GMAIL_FETCH_EMAILS";

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

export async function converse(
  env: AppEnv,
  ownerId: string,
  message: string,
): Promise<ConverseResult> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for the agent loop");

  // 1. Recall relevant memory + see which real accounts are connected.
  const [hits, toolkits] = await Promise.all([
    recall(env, ownerId, message, 8),
    connectedToolkits(env, ownerId).catch(() => [] as string[]),
  ]);
  const memoryContext =
    hits.map((h) => `- ${h.atom.factText}`).join("\n") || "(nothing remembered yet)";
  const gmailConnected = toolkits.includes("gmail");

  const pendingApprovals: PendingApproval[] = [];
  const executed: ExecutedAction[] = [];

  // 2. Build tools. Read tools execute autonomously (gated read-only tier); the send tool has
  //    NO execute, so the SDK returns the call and we gate it for approval.
  const tools: ToolSet = {};
  if (gmailConnected) {
    tools.read_emails = tool({
      description:
        "Read the user's most recent emails to answer a question about their inbox. Read-only.",
      inputSchema: z.object({
        max_results: z.number().int().min(1).max(10).default(5),
      }),
      execute: async ({ max_results }) => {
        const action: ProposedAction = {
          tool: GMAIL_FETCH,
          args: { max_results },
          actsExternally: false,
          touchesSensitive: true,
          readsUntrusted: false,
          actionClass: "email_read",
        };
        const decision = await gate(env, ownerId, action);
        if (decision.decision !== "allow") return { error: "reading is not permitted" };
        const res = await executeAction(env, ownerId, GMAIL_FETCH, { max_results });
        return res.data;
      },
    });
    tools.send_email = tool({
      description:
        "Send an email from the user's connected Gmail. Use ONLY when the user clearly asks to send or reply to someone.",
      inputSchema: emailArgs,
    });
  }

  const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
  const result = await generateText({
    model: google(AGENT_MODEL),
    system:
      "You are the user's helloo — their personal AI. Answer using what you remember about them " +
      "(below), general knowledge, and their connected accounts when relevant. If a personal fact " +
      "isn't in memory or their accounts, say you don't know it yet rather than inventing it. " +
      "Be concise and warm.\n\n" +
      `Connected accounts: ${toolkits.length ? toolkits.join(", ") : "none"}.\n` +
      `What you remember about the user:\n${memoryContext}`,
    prompt: message,
    tools,
    stopWhen: stepCountIs(5),
  });

  // 3. Gate any SEND the model proposed (read tools already ran under the gate).
  for (const call of result.toolCalls) {
    if (call.toolName !== "send_email") continue;
    const parsed = emailArgs.safeParse(call.input);
    if (!parsed.success) continue;
    const email = parsed.data;
    const summary = `Send email to ${email.to} — "${email.subject}"`;
    const action: ProposedAction = {
      tool: GMAIL_SEND,
      args: { recipient_email: email.to, subject: email.subject, body: email.body, is_html: false },
      actsExternally: true,
      touchesSensitive: false,
      readsUntrusted: false,
      risk: "irreversible",
      actionClass: "email_send",
      contact: email.to,
      reason: message,
    };
    const decision = await gate(env, ownerId, action);
    if (decision.decision === "needs_approval" && decision.requestId) {
      pendingApprovals.push({ requestId: decision.requestId, tool: GMAIL_SEND, summary });
    } else if (decision.decision === "allow") {
      const res = await executeAction(env, ownerId, GMAIL_SEND, action.args);
      executed.push({ tool: GMAIL_SEND, summary, successful: res.successful });
    }
  }

  // 4. Compose the reply.
  let reply = result.text.trim();
  if (!reply) {
    if (pendingApprovals.length > 0) {
      reply = `I've prepared ${pendingApprovals.length} action(s) that need your approval before I proceed.`;
    } else if (executed.length > 0) {
      reply = "Done.";
    }
  }

  // 5. Learn from the user's message.
  await ingestText(env, ownerId, message, "conversation");

  return {
    reply,
    recalled: hits.map((h) => ({ factText: h.atom.factText, score: h.score })),
    pendingApprovals,
    executed,
  };
}
