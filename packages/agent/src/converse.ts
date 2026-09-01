import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { z } from "zod";
import { recall, ingestText } from "@helloo/memory";
import { gate, type ProposedAction } from "@helloo/trust";
import { connectedToolkits, executeAction } from "@helloo/integrations";
import type { AppEnv } from "@helloo/core";

/**
 * The daily loop (SYSTEM-MAP §3): recall memory → the model answers grounded in it → any
 * action it proposes is routed through the trust gate (never auto-executed) → an allowed
 * action runs via Composio → the turn is learned back into memory. Host-agnostic; moves into
 * a per-user DO when we need durable state (ADR-0007). Provider-agnostic AI SDK (Gemini today).
 */

export const AGENT_MODEL = "gemini-3.6-flash";

const emailArgs = z.object({
  to: z.string().describe("recipient email address"),
  subject: z.string(),
  body: z.string(),
});

/** Map the friendly tool args to the Composio GMAIL_SEND_EMAIL action. */
const GMAIL_SEND = "GMAIL_SEND_EMAIL";
function toGmailArgs(a: z.infer<typeof emailArgs>): Record<string, unknown> {
  return { recipient_email: a.to, subject: a.subject, body: a.body, is_html: false };
}

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

  // 2. Reason. The send tool has NO execute — the SDK hands the call back so we gate it.
  const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
  const result = await generateText({
    model: google(AGENT_MODEL),
    system:
      "You are the user's helloo — their personal AI. Answer using what you remember about them " +
      "(below) plus general knowledge. If a personal fact isn't in memory, say you don't know it " +
      "yet rather than inventing it. Be concise and warm.\n\n" +
      `Connected accounts: ${toolkits.length ? toolkits.join(", ") : "none"}.\n` +
      `What you remember about the user:\n${memoryContext}`,
    prompt: message,
    tools: gmailConnected
      ? {
          send_email: tool({
            description:
              "Send an email from the user's connected Gmail. Use ONLY when the user clearly asks to send or reply to someone.",
            inputSchema: emailArgs,
          }),
        }
      : {},
  });

  // 3. Gate any proposed actions; execute only what a standing policy already allows.
  const pendingApprovals: PendingApproval[] = [];
  const executed: ExecutedAction[] = [];
  for (const call of result.toolCalls) {
    if (call.toolName !== "send_email") continue;
    const parsed = emailArgs.safeParse(call.input);
    if (!parsed.success) continue;
    const email = parsed.data;
    const summary = `Send email to ${email.to} — "${email.subject}"`;
    const action: ProposedAction = {
      tool: GMAIL_SEND,
      args: toGmailArgs(email),
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
