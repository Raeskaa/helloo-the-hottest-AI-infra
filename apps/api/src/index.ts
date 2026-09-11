import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { pingDb } from "@helloo/db";
import { createAuth } from "@helloo/auth";
import { ingestText, listMemory, recall } from "@helloo/memory";
import { listOpenApprovals, decide } from "@helloo/trust";
import { initiateConnection, listConnections, executeAction } from "@helloo/integrations";
import { dueReminders, advanceReminder } from "@helloo/scheduler";
import {
  parseTelegramUpdate,
  sendTelegramMessage,
  sendTelegramTyping,
  createPendingLink,
  confirmLink,
  resolveOwner,
  externalIdForOwner,
  getOnboarding,
  startOnboarding,
  setAwaitingOtp,
  clearOnboarding,
  bindChannel,
  looksLikeEmail,
  extractOtp,
  createMcpToken,
  resolveMcpOwner,
} from "@helloo/channels";
import { handleMcpMessage } from "./mcp";
import { HelloAgent } from "./hello-agent";
import type { AppEnv } from "@helloo/core";

// apps/api is composition-only: it wires the domain packages to HTTP.
// Domain behaviour lives in packages/*; the per-user runtime is the HelloAgent DO.
type Bindings = AppEnv & { HELLO_AGENT: DurableObjectNamespace };
const app = new Hono<{ Bindings: Bindings }>();

/** The caller's durable agent (one per user). */
function agentStub(env: Bindings, owner: string): DurableObjectStub {
  return env.HELLO_AGENT.get(env.HELLO_AGENT.idFromName(owner));
}

const turnReplySchema = z.object({
  reply: z.string().optional(),
  pendingApprovals: z.array(z.unknown()).optional(),
});

/** Run one turn through the owner's DO and return a channel-ready reply string. */
async function runTurn(env: Bindings, owner: string, message: string): Promise<string> {
  const res = await agentStub(env, owner).fetch("https://hello-agent/turn", {
    method: "POST",
    headers: { "content-type": "application/json", "x-owner-id": owner },
    body: JSON.stringify({ message }),
  });
  const parsed = turnReplySchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return "Sorry — something went wrong.";
  const reply = parsed.data.reply && parsed.data.reply.length > 0 ? parsed.data.reply : "…";
  const pending = parsed.data.pendingApprovals?.length ?? 0;
  return pending > 0 ? `${reply}\n\n(⏳ ${pending} action(s) need your approval in the app.)` : reply;
}

/**
 * Sign a brand-new user up from inside the chat: ask email → send OTP → verify → create the account
 * and link this chat. Runs when an inbound message comes from a chat with no owner yet.
 */
async function handleOnboarding(
  env: Bindings,
  token: string,
  chatId: string,
  text: string,
): Promise<void> {
  const channel = "telegram";
  const state = await getOnboarding(env, channel, chatId);

  if (!state) {
    await startOnboarding(env, channel, chatId);
    await sendTelegramMessage(
      token,
      chatId,
      "👋 Welcome to helloo — your own personal AI. Let's set you up.\n\nWhat's your email address?",
    );
    return;
  }

  if (/^\s*(restart|reset|change email)\s*$/i.test(text)) {
    await startOnboarding(env, channel, chatId);
    await sendTelegramMessage(token, chatId, "No problem — what email should I use?");
    return;
  }

  if (state.stage === "awaiting_email") {
    if (!looksLikeEmail(text)) {
      await sendTelegramMessage(token, chatId, "That doesn't look like an email. Send me your email address to continue.");
      return;
    }
    const email = text.trim();
    // Email OTP via Better Auth (delivers through Resend in prod; falls back to logs until the key is set).
    await createAuth(env).api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    await setAwaitingOtp(env, channel, chatId, email);
    await sendTelegramMessage(
      token,
      chatId,
      `📧 I sent a 6-digit code to ${email}. Paste it here to finish.\n\n(Say "restart" to use a different email.)`,
    );
    return;
  }

  // awaiting_otp
  const otp = extractOtp(text);
  if (!otp) {
    await sendTelegramMessage(token, chatId, 'Paste the 6-digit code I emailed you, or say "restart" to use a different email.');
    return;
  }
  const email = state.email;
  if (!email) {
    await startOnboarding(env, channel, chatId);
    await sendTelegramMessage(token, chatId, "Something went off-track — what's your email?");
    return;
  }
  // Verify the OTP; on first sign-in Better Auth creates the account and returns the owner id.
  let userId: string | null = null;
  try {
    const res = await createAuth(env).api.signInEmailOTP({ body: { email, otp } });
    userId = res.user.id;
  } catch {
    userId = null;
  }
  if (!userId) {
    await sendTelegramMessage(
      token,
      chatId,
      'That code didn\'t work — it may have expired. Paste the latest code, or say "restart" for a new one.',
    );
    return;
  }
  await bindChannel(env, channel, userId, chatId);
  await clearOnboarding(env, channel, chatId);
  await sendTelegramMessage(
    token,
    chatId,
    "✅ You're in — this chat is now your helloo.\n\nTry \"what can you do?\", or ask me to connect an account (like Gmail) and I'll send you a link.",
  );
}

// Reflect the request origin with credentials so the browser client can hold
// the session cookie. In production, replace with an explicit allowlist.
app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "",
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

/** Resolve the signed-in owner id from the request, or null. */
async function ownerId(env: AppEnv, headers: Headers): Promise<string | null> {
  const session = await createAuth(env).api.getSession({ headers });
  return session?.user.id ?? null;
}

app.get("/", (c) =>
  c.json({ ok: true, service: "helloo-api", auth: "/api/auth/*", me: "/api/me", memory: "/api/memory" }),
);

// Better Auth owns every route under /api/auth/* (sign-in, OTP, social, session, org…).
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

// Example protected route — proves the session works end to end.
app.get("/api/me", async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  return c.json({ user: session.user, session: session.session });
});

// Memory write path: text -> extracted facts -> atoms (in the caller's tenant).
app.post("/api/memory/ingest", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ text?: unknown }>().catch(() => null);
  const text = body?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return c.json({ error: "text required" }, 400);
  }
  const result = await ingestText(c.env, owner, text);
  return c.json(result);
});

// Memory read path: the caller's current beliefs.
app.get("/api/memory", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  return c.json({ atoms: await listMemory(c.env, owner) });
});

// Semantic recall: ?q=... [&k=8] -> ranked atoms with similarity + provenance.
app.get("/api/memory/recall", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const q = c.req.query("q");
  if (!q || q.trim().length === 0) return c.json({ error: "q required" }, 400);
  const kRaw = Number(c.req.query("k"));
  const k = Number.isFinite(kRaw) && kRaw > 0 ? Math.min(Math.floor(kRaw), 50) : 8;
  const hits = await recall(c.env, owner, q, k);
  return c.json({ hits });
});

// Approvals inbox: consequential actions awaiting the owner's decision.
app.get("/api/approvals", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  return c.json({ requests: await listOpenApprovals(c.env, owner) });
});

// Decide one request: { decision: "allow"|"deny", rememberScope?, rationale? }.
app.post("/api/approvals/:id", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ decision?: unknown; rememberScope?: unknown; rationale?: unknown }>().catch(() => null);
  const decision = body?.decision;
  if (decision !== "allow" && decision !== "deny") {
    return c.json({ error: "decision must be 'allow' or 'deny'" }, 400);
  }
  const rememberScope = body?.rememberScope === "always_for" ? "always_for" : "once";
  const rationale = typeof body?.rationale === "string" ? body.rationale : undefined;
  const result = await decide(c.env, owner, c.req.param("id"), {
    decision,
    rememberScope,
    rationale,
    reviewer: owner,
  });
  // On approval, execute the action for real (this is the side effect the gate was protecting).
  if (result.request.status === "allowed") {
    const execution = await executeAction(
      c.env,
      owner,
      result.request.tool,
      result.request.args,
    );
    return c.json({ ...result, execution });
  }
  return c.json(result);
});

// The daily loop runs in the caller's durable agent (recall → reason → gate → learn).
app.post("/api/converse", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ message?: unknown }>().catch(() => null);
  const message = body?.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    return c.json({ error: "message required" }, 400);
  }
  // Learn from the turn in the background so it never delays the reply.
  c.executionCtx.waitUntil(ingestText(c.env, owner, message).catch(() => {}));
  return agentStub(c.env, owner).fetch("https://hello-agent/turn", {
    method: "POST",
    headers: { "content-type": "application/json", "x-owner-id": owner },
    body: JSON.stringify({ message }),
  });
});

// Connect a real account (OAuth): { toolkit: "gmail" } -> a redirect URL the user opens.
app.post("/api/connect", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ toolkit?: unknown }>().catch(() => null);
  const toolkit = body?.toolkit;
  if (typeof toolkit !== "string" || toolkit.trim().length === 0) {
    return c.json({ error: "toolkit required (e.g. 'gmail')" }, 400);
  }
  return c.json(await initiateConnection(c.env, owner, toolkit));
});

// The user's connected accounts.
app.get("/api/connections", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  return c.json({ connections: await listConnections(c.env, owner) });
});

// Reach helloo on Telegram. A signed-in user gets a deep link to bind their chat.
app.get("/api/channels/telegram/link", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const code = await createPendingLink(c.env, owner, "telegram");
  const bot = c.env.TELEGRAM_BOT_USERNAME ?? "your_bot";
  return c.json({ url: `https://t.me/${bot}?start=${code}` });
});

// Telegram webhook (Telegram calls this, unauthenticated). Only acts if a bot token is set.
app.post("/api/channels/telegram/webhook", async (c) => {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) return c.json({ ok: true });
  // Reject forged calls: once a webhook secret is configured, Telegram echoes it in this header.
  const expected = c.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && c.req.header("X-Telegram-Bot-Api-Secret-Token") !== expected) {
    return c.json({ ok: true });
  }
  const msg = parseTelegramUpdate(await c.req.json().catch(() => null));
  if (!msg) return c.json({ ok: true });

  // The whole turn runs SYNCHRONOUSLY on the request's budget: Telegram waits up to ~60s and a
  // turn is ~10s, so there's no need for background/alarm indirection (which is unreliable on the
  // free plan). A warm-up cron keeps Neon warm so a cold start can't make the turn error.
  try {
    if (msg.startPayload) {
      const linked = await confirmLink(c.env, "telegram", msg.startPayload, msg.chatId);
      await sendTelegramMessage(
        token,
        msg.chatId,
        linked
          ? "✅ Linked to your helloo. Message me here anytime."
          : "That link is invalid or already used — grab a fresh one from the helloo app.",
      );
      return c.json({ ok: true });
    }
    const owner = await resolveOwner(c.env, "telegram", msg.chatId);
    if (!owner) {
      // No account yet — sign the user up from inside the chat (ask email → OTP → verify → link).
      await handleOnboarding(c.env, token, msg.chatId, msg.text);
      return c.json({ ok: true });
    }
    // Run the turn synchronously on the request's full budget (Telegram waits up to ~60s), then
    // reply. Learning happens in the background so it never delays the answer.
    await sendTelegramTyping(token, msg.chatId);
    const reply = await runTurn(c.env, owner, msg.text);
    await sendTelegramMessage(token, msg.chatId, reply);
    c.executionCtx.waitUntil(ingestText(c.env, owner, msg.text).catch(() => {}));
  } catch {
    await sendTelegramMessage(token, msg.chatId, "Sorry — I hit a snag. Try again in a moment.").catch(() => {});
  }
  return c.json({ ok: true });
});

/**
 * Deliver every reminder that's due (the proactive scheduler). Runs on the cron: scan due rows
 * across all users, deliver on their channel ("say" = the text; "run" = an agent turn), then
 * advance recurring rows / complete one-offs. Always advances, even on a delivery error, so a
 * broken reminder can't re-fire every tick.
 */
async function runDueReminders(env: Bindings): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const now = new Date();
  const due = await dueReminders(env, now, 10);
  for (const r of due) {
    try {
      const chatId =
        token && r.channel === "telegram" ? await externalIdForOwner(env, "telegram", r.ownerId) : null;
      if (token && chatId) {
        const text = r.mode === "run" ? await runTurn(env, r.ownerId, r.body) : `⏰ ${r.body}`;
        await sendTelegramMessage(token, chatId, text);
      }
    } catch {
      // best-effort delivery; still advance below so it doesn't wedge.
    }
    await advanceReminder(env, r, now).catch(() => {});
  }
}

// Mint an MCP token so the signed-in user can reach their helloo from Claude/ChatGPT (as an MCP server).
app.post("/api/channels/mcp/token", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ label?: unknown }>().catch(() => null);
  const label = typeof body?.label === "string" ? body.label : undefined;
  const token = await createMcpToken(c.env, owner, label);
  return c.json({ token, url: `${new URL(c.req.url).origin}/api/mcp/${token}` });
});

// The MCP endpoint (Streamable HTTP, JSON responses). The path token IS the credential. Read-only.
app.post("/api/mcp/:token", async (c) => {
  const owner = await resolveMcpOwner(c.env, c.req.param("token"));
  if (!owner) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "invalid token" } }, 401);
  const body = await c.req.json().catch(() => null);
  if (Array.isArray(body)) {
    const out = [];
    for (const msg of body) {
      const r = await handleMcpMessage(c.env, owner, msg);
      if (r) out.push(r);
    }
    return out.length > 0 ? c.json(out) : c.body(null, 202);
  }
  const res = await handleMcpMessage(c.env, owner, body);
  return res ? c.json(res) : c.body(null, 202);
});

// We don't offer a server-initiated SSE stream; tell clients POST-only (MCP spec allows 405 here).
app.get("/api/mcp/:token", (c) => c.body(null, 405, { Allow: "POST" }));

export { HelloAgent };

export default {
  fetch: app.fetch,
  // Cron: warm Neon (so cold-start can't drop a reply) then deliver any due reminders (prod only).
  async scheduled(_event: ScheduledController, env: Bindings, _ctx: ExecutionContext): Promise<void> {
    try {
      await pingDb(env.DATABASE_URL);
    } catch {
      // best-effort; a failed warm-up just means the next real request wakes it.
    }
    try {
      await runDueReminders(env);
    } catch {
      // best-effort; the next tick retries any still-due reminders.
    }
  },
};
