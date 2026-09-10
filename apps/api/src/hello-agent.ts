import { converse } from "@helloo/agent";
import { ingestText } from "@helloo/memory";
import { sendTelegramMessage } from "@helloo/channels";
import type { AppEnv } from "@helloo/core";

/**
 * HelloAgent — one durable agent per user (VERSIONS v1 runtime). Two entry points:
 *  - `/turn` runs a turn synchronously (the caller holds the request open — used by /api/converse).
 *  - `/enqueue` stores a channel message and fires a DO **alarm**, which processes it in a durable
 *    background slot and sends the reply itself. Webhooks use this so a slow turn on a cold DB can
 *    never be cut off mid-reply (the `waitUntil` failure mode).
 * Durable memory lives in Postgres; the DO holds only the owner binding + a small message queue.
 */

interface QueuedMsg {
  channel: "telegram";
  chatId: string;
  text: string;
}

function readMessage(v: unknown): string {
  if (v !== null && typeof v === "object" && "message" in v && typeof v.message === "string") {
    return v.message;
  }
  return "";
}

function readQueued(v: unknown): QueuedMsg | null {
  if (v === null || typeof v !== "object") return null;
  if (!("chatId" in v) || !("text" in v)) return null;
  const chatId = v.chatId;
  const text = v.text;
  if (typeof chatId !== "string" || typeof text !== "string") return null;
  return { channel: "telegram", chatId, text };
}

export class HelloAgent {
  private ownerId: string | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: AppEnv,
  ) {}

  private async owner(): Promise<string | null> {
    if (this.ownerId) return this.ownerId;
    this.ownerId = (await this.state.storage.get<string>("ownerId")) ?? null;
    return this.ownerId;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const headerOwner = req.headers.get("x-owner-id");
    if (headerOwner) {
      this.ownerId = headerOwner;
      await this.state.storage.put("ownerId", headerOwner);
    }
    const owner = await this.owner();
    if (!owner) return Response.json({ error: "no owner bound to this agent" }, { status: 400 });

    if (url.pathname.endsWith("/turn")) {
      const message = readMessage(await req.json());
      return Response.json(await converse(this.env, owner, message));
    }

    if (url.pathname.endsWith("/enqueue")) {
      const msg = readQueued(await req.json());
      if (!msg) return Response.json({ error: "bad message" }, { status: 400 });
      const queue = (await this.state.storage.get<QueuedMsg[]>("queue")) ?? [];
      queue.push(msg);
      await this.state.storage.put("queue", queue);
      await this.state.storage.setAlarm(Date.now());
      return Response.json({ queued: true });
    }

    return Response.json({ ok: true, owner });
  }

  /** Drain the message queue durably: one turn at a time, replying over the channel. */
  async alarm(): Promise<void> {
    const owner = await this.owner();
    const token = this.env.TELEGRAM_BOT_TOKEN;
    if (!owner || !token) return;

    for (;;) {
      const queue = (await this.state.storage.get<QueuedMsg[]>("queue")) ?? [];
      const [msg, ...rest] = queue;
      if (!msg) break;
      // Dequeue before processing so an interrupted run can't double-send.
      await this.state.storage.put("queue", rest);
      try {
        const result = await converse(this.env, owner, msg.text);
        let reply = result.reply;
        if (result.pendingApprovals.length > 0) {
          reply += `\n\n(⏳ ${result.pendingApprovals.length} action(s) need your approval in the app.)`;
        }
        await sendTelegramMessage(token, msg.chatId, reply);
        await ingestText(this.env, owner, msg.text).catch(() => {});
      } catch {
        await sendTelegramMessage(token, msg.chatId, "Sorry — I hit a snag. Please try again.").catch(() => {});
      }
    }
  }
}
