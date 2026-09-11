import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, desc, eq, lt } from "drizzle-orm";
import { eventLog } from "./schema";
import * as schema from "./schema";

// Own client (avoids a circular import with index.ts's getDb). The retrying fetch is configured
// globally on neonConfig when the package's index module loads.
function db(url: string) {
  return drizzle(neon(url), { schema });
}

/**
 * Operational logging. `logEvent` records an error/event to `event_log` best-effort — it also mirrors
 * to console (captured by Cloudflare observability) and NEVER throws into the caller, so adding
 * logging can't break a path. Use it wherever we'd otherwise swallow an error silently.
 */

export type EventLevel = "info" | "warn" | "error";
export interface LogEventInput {
  kind: string;
  level?: EventLevel;
  ownerId?: string | null;
  detail?: Record<string, unknown>;
}

/** Normalize an unknown thrown value into a short string for the detail payload. */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return "unknown error";
  }
}

export async function logEvent(databaseUrl: string, input: LogEventInput): Promise<void> {
  const level = input.level ?? "info";
  const line = `[${level}] ${input.kind}${input.ownerId ? ` owner=${input.ownerId}` : ""} ${JSON.stringify(input.detail ?? {})}`;
  if (level === "error") console.error(line);
  else console.log(line);
  try {
    await db(databaseUrl)
      .insert(eventLog)
      .values({ kind: input.kind, level, ownerId: input.ownerId ?? null, detail: input.detail ?? {} });
  } catch {
    // logging must never throw into the caller.
  }
}

export interface EventRow {
  seq: number;
  kind: string;
  level: string;
  detail: Record<string, unknown>;
  createdAt: Date;
}

/** Recent events for one owner (newest first) — for a status view. */
export async function recentEvents(databaseUrl: string, ownerId: string, limit = 30): Promise<EventRow[]> {
  return db(databaseUrl)
    .select({
      seq: eventLog.seq,
      kind: eventLog.kind,
      level: eventLog.level,
      detail: eventLog.detail,
      createdAt: eventLog.createdAt,
    })
    .from(eventLog)
    .where(eq(eventLog.ownerId, ownerId))
    .orderBy(desc(eventLog.createdAt))
    .limit(limit);
}

/** Best-effort retention trim: delete events older than `days` (call occasionally, e.g. from cron). */
export async function pruneEvents(databaseUrl: string, days = 30): Promise<void> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    await db(databaseUrl).delete(eventLog).where(and(lt(eventLog.createdAt, cutoff)));
  } catch {
    // best-effort
  }
}
