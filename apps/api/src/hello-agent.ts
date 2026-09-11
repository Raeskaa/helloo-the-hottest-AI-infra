import { converse, type HistoryMessage } from "@helloo/agent";
import type { AppEnv } from "@helloo/core";

/** Keep the last few turns as short-term conversational context. */
const HISTORY_LIMIT = 8;

/**
 * HelloAgent — one durable agent per user (VERSIONS v1 runtime).
 *
 * Entry point `/turn` runs a single turn synchronously (the caller holds the request open). Both
 * the Telegram webhook and `/api/converse` use it: the webhook is well within Telegram's ~60s
 * budget (~10s/turn), so no background/alarm indirection is needed — a warm-up cron keeps Neon's
 * free-tier compute from suspending between messages.
 *
 * Durable memory lives in Postgres; the DO holds only the owner binding.
 */

function readMessage(v: unknown): string {
  if (v !== null && typeof v === "object" && "message" in v && typeof v.message === "string") {
    return v.message;
  }
  return "";
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
      // Short-term memory: the last few turns of THIS conversation live in the DO's storage, so
      // follow-ups ("reply to that", "the second one") have context. Long-term memory is Postgres.
      const history = (await this.state.storage.get<HistoryMessage[]>("history")) ?? [];
      const result = await converse(this.env, owner, message, { history });
      const updated = [
        ...history,
        { role: "user" as const, text: message },
        { role: "assistant" as const, text: result.reply },
      ].slice(-HISTORY_LIMIT);
      await this.state.storage.put("history", updated);
      return Response.json(result);
    }

    return Response.json({ ok: true, owner });
  }
}
