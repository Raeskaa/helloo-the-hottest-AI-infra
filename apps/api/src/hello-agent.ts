import { converse } from "@helloo/agent";
import type { AppEnv } from "@helloo/core";

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
      return Response.json(await converse(this.env, owner, message));
    }

    return Response.json({ ok: true, owner });
  }
}
