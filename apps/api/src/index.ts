import { Hono } from "hono";
import { cors } from "hono/cors";
import { pingDb, logEvent, errorText, recentEvents, pruneEvents } from "@helloo/db";
import { createAuth } from "@helloo/auth";
import { ingestText, listMemory, recall } from "@helloo/memory";
import { converse, type ConverseResult, type HistoryMessage } from "@helloo/agent";
import { listOpenApprovals, decide } from "@helloo/trust";
import { initiateConnection, listConnections, executeAction } from "@helloo/integrations";
import { dueReminders, advanceReminder, activeEmailWorkflows, markWorkflowSeen } from "@helloo/scheduler";
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
  loadHistory,
  saveHistory,
} from "@helloo/channels";
import { handleMcpMessage } from "./mcp";
import type { AppEnv } from "@helloo/core";

// apps/api is composition-only: it wires the domain packages to HTTP. Turns run `converse` directly
// here (the vestigial per-user Durable Object was removed — converse is stateless; short-term chat
// context lives in `chat_session`, long-term in Postgres).
type Bindings = AppEnv;
const app = new Hono<{ Bindings: Bindings }>();

const HISTORY_LIMIT = 8;

/** Format a converse result into a channel-ready reply, with the in-chat approval hint. */
function formatReply(result: ConverseResult): string {
  const reply = result.reply && result.reply.length > 0 ? result.reply : "…";
  const pending = result.pendingApprovals.length;
  if (pending > 0) {
    const it = pending === 1 ? "it" : `them (say "approve all")`;
    return `${reply}\n\n⏳ ${pending} action(s) waiting — reply "approve" to do ${it}, or "deny" to skip.`;
  }
  return reply;
}

/** Run one turn (no conversation history — used by the cron for reminders/workflows). */
async function runTurn(env: Bindings, owner: string, message: string): Promise<string> {
  try {
    return formatReply(await converse(env, owner, message));
  } catch {
    return "Sorry — something went wrong.";
  }
}

/** Approve/deny the pending action(s) straight from the chat (no app needed). Returns whether it handled the message. */
function approvalIntent(text: string): "allow" | "deny" | null {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (/^(approve|approve all|yes|yes all|ok|okay|confirm|go ahead|do it|send it|sounds good|👍)$/.test(t)) return "allow";
  if (/^(deny|deny all|no|nope|cancel|reject|stop|skip|don'?t)$/.test(t)) return "deny";
  return null;
}

async function handleApprovalIntent(
  env: Bindings,
  token: string,
  owner: string,
  chatId: string,
  text: string,
): Promise<boolean> {
  const intent = approvalIntent(text);
  if (!intent) return false;
  const open = await listOpenApprovals(env, owner);
  if (open.length === 0) return false; // a plain "yes"/"no" with nothing pending — let the agent handle it
  const all = /\ball\b/.test(text.toLowerCase());
  const targets = all ? open : open.slice(0, 1); // newest first; approve just the latest unless "all"
  const lines: string[] = [];
  for (const req of targets) {
    try {
      const decided = await decide(env, owner, req.id, { decision: intent, reviewer: owner });
      if (intent === "deny") {
        lines.push(`🚫 Skipped: ${req.tool}`);
      } else if (decided.request.status === "allowed") {
        const exec = await executeAction(env, owner, decided.request.tool, decided.request.args);
        lines.push(exec.successful ? `✅ Done: ${req.tool}` : `⚠️ ${req.tool} failed: ${exec.error ?? "unknown error"}`);
      }
    } catch {
      lines.push(`⚠️ Couldn't process ${req.tool}.`);
    }
  }
  const remaining = all ? 0 : open.length - 1;
  if (remaining > 0) lines.push(`(${remaining} more waiting — reply "approve all" for the rest.)`);
  await sendTelegramMessage(token, chatId, lines.join("\n") || "Nothing to do.");
  return true;
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

// Status/observability: the signed-in user's recent events (errors, workflow fires, reminders…).
app.get("/api/status", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const events = await recentEvents(c.env.DATABASE_URL, owner, 40);
  const errors = events.filter((e) => e.level === "error").length;
  return c.json({ ok: errors === 0, errorCount: errors, events });
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

// The daily loop (recall → reason → gate → learn), run in the Worker.
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
  return c.json(await converse(c.env, owner, message));
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
    // Approve/deny a pending action right from the chat (no app). If handled, we're done.
    if (await handleApprovalIntent(c.env, token, owner, msg.chatId, msg.text)) {
      return c.json({ ok: true });
    }
    // Run the turn synchronously on the request's full budget (Telegram waits up to ~60s), then
    // reply. Short-term history gives follow-ups context; learning happens in the background.
    await sendTelegramTyping(token, msg.chatId);
    const history = await loadHistory(c.env, "telegram", msg.chatId).catch((): HistoryMessage[] => []);
    const result = await converse(c.env, owner, msg.text, { history });
    await sendTelegramMessage(token, msg.chatId, formatReply(result));
    const updated = [
      ...history,
      { role: "user" as const, text: msg.text },
      { role: "assistant" as const, text: result.reply },
    ].slice(-HISTORY_LIMIT);
    await saveHistory(c.env, "telegram", msg.chatId, owner, updated).catch(() => {});
    c.executionCtx.waitUntil(ingestText(c.env, owner, msg.text).catch(() => {}));
  } catch (err) {
    await logEvent(c.env.DATABASE_URL, {
      kind: "turn",
      level: "error",
      detail: { channel: "telegram", chatId: msg.chatId, error: errorText(err) },
    });
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
    } catch (err) {
      await logEvent(env.DATABASE_URL, {
        kind: "reminder",
        level: "error",
        ownerId: r.ownerId,
        detail: { reminderId: r.id, error: errorText(err) },
      });
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

/** Narrow an unknown into a plain record (assertion-free; matches the toArgs pattern). */
function toRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? { ...v } : {};
}
/** Read a string field off a raw Gmail message object. */
function emailField(m: unknown, key: string): string {
  const v = toRecord(m)[key];
  return typeof v === "string" ? v : "";
}
function gmailMessages(data: unknown): unknown[] {
  const v = toRecord(data).messages;
  return Array.isArray(v) ? v : [];
}

/**
 * Fire event-triggered workflows: for each active email workflow, poll recent Gmail, act on NEW
 * messages (newer than the last handled id) matching the filter by running the instruction as an
 * agent turn and delivering the result. Baselines on first poll so it never fires on backlog.
 */
async function runEmailWorkflows(env: Bindings): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const flows = await activeEmailWorkflows(env);
  for (const wf of flows) {
    try {
      const res = await executeAction(env, wf.ownerId, "GMAIL_FETCH_EMAILS", { max_results: 15 });
      if (!res.successful) continue;
      const messages = gmailMessages(res.data);
      const newest = messages[0];
      const newestId = emailField(newest, "messageId");
      if (newestId.length === 0) continue;
      if (!wf.lastSeenId) {
        await markWorkflowSeen(env, wf.id, newestId); // baseline — don't fire on existing mail
        continue;
      }
      // Collect messages newer than the last handled one (newest-first until we hit it).
      const fresh: unknown[] = [];
      for (const m of messages) {
        if (emailField(m, "messageId") === wf.lastSeenId) break;
        fresh.push(m);
      }
      const matchFrom = (wf.matchFrom ?? "").toLowerCase();
      const matchSubject = (wf.matchSubject ?? "").toLowerCase();
      const matches = fresh
        .filter((m) => {
          const from = emailField(m, "sender").toLowerCase();
          const subject = emailField(m, "subject").toLowerCase();
          return (matchFrom === "" || from.includes(matchFrom)) && (matchSubject === "" || subject.includes(matchSubject));
        })
        .slice(0, 3) // cap firings per tick
        .reverse(); // act oldest-first
      const chatId = token && wf.channel === "telegram" ? await externalIdForOwner(env, "telegram", wf.ownerId) : null;
      for (const m of matches) {
        const context =
          `An email arrived. From: ${emailField(m, "sender")}. Subject: ${emailField(m, "subject")}. ` +
          `Preview: ${emailField(m, "preview") || emailField(m, "messageText").slice(0, 300)}.\n\n` +
          `Your task: ${wf.instruction}`;
        const reply = await runTurn(env, wf.ownerId, context);
        if (token && chatId) await sendTelegramMessage(token, chatId, `⚡ ${wf.name}\n\n${reply}`);
      }
      if (matches.length > 0) {
        await logEvent(env.DATABASE_URL, {
          kind: "workflow",
          ownerId: wf.ownerId,
          detail: { workflowId: wf.id, name: wf.name, fired: matches.length },
        });
      }
      await markWorkflowSeen(env, wf.id, newestId);
    } catch (err) {
      await logEvent(env.DATABASE_URL, {
        kind: "workflow",
        level: "error",
        ownerId: wf.ownerId,
        detail: { workflowId: wf.id, error: errorText(err) },
      });
    }
  }
}

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
    try {
      await runEmailWorkflows(env);
    } catch {
      // best-effort; the next tick retries from the same baseline.
    }
    await pruneEvents(env.DATABASE_URL, 30); // trim the event log (best-effort)
  },
};
