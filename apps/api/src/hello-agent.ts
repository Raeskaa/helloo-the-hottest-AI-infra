import { converse } from "@helloo/agent";
import type { AppEnv } from "@helloo/core";

/**
 * HelloAgent — one durable agent per user (VERSIONS v1 runtime; SYSTEM-MAP §"Agent runtime").
 * A plain Durable Object behind our own interface (so we can swap the Agents SDK in later
 * without rippling). It holds the per-user runtime: conversation turns run here, and DO alarms
 * drive proactivity (the Morning Brief). Durable memory itself lives in Postgres, not DO state —
 * the DO only holds hot/runtime state (owner binding, last brief).
 *
 * DO id is derived from the owner id (`idFromName(ownerId)`), so each user has exactly one.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

interface TurnBody {
  message: string;
}
interface BriefRecord {
  at: number;
  reply: string;
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

    // The composition layer binds the owner on every call (trusted; it authenticated the user).
    const headerOwner = req.headers.get("x-owner-id");
    if (headerOwner) {
      this.ownerId = headerOwner;
      await this.state.storage.put("ownerId", headerOwner);
    }
    const owner = await this.owner();
    if (!owner) return Response.json({ error: "no owner bound to this agent" }, { status: 400 });

    if (url.pathname.endsWith("/turn")) {
      const body = (await req.json()) as TurnBody;
      const result = await converse(this.env, owner, body.message);
      return Response.json(result);
    }

    if (url.pathname.endsWith("/schedule-brief")) {
      await this.state.storage.setAlarm(Date.now() + DAY_MS);
      return Response.json({ scheduled: true });
    }

    if (url.pathname.endsWith("/last-brief")) {
      const brief = (await this.state.storage.get<BriefRecord>("lastBrief")) ?? null;
      return Response.json({ brief });
    }

    return Response.json({ ok: true, owner });
  }

  /** Proactivity: compose a Morning Brief from memory, store it, and reschedule for tomorrow. */
  async alarm(): Promise<void> {
    const owner = await this.owner();
    if (!owner) return;
    const brief = await converse(
      this.env,
      owner,
      "Give me a short morning brief: the most important things you know I should be aware of today.",
    );
    const record: BriefRecord = { at: Date.now(), reply: brief.reply };
    await this.state.storage.put("lastBrief", record);
    // Delivery over a channel is a later slice; for now the brief is stored for pull.
    await this.state.storage.setAlarm(Date.now() + DAY_MS);
  }
}
