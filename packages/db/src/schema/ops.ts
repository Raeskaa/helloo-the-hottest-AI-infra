import { sql } from "drizzle-orm";
import { pgTable, bigserial, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * `event_log` — lightweight operational observability: errors and key events (turn failed, tool
 * failed, workflow fired, reminder delivered, onboarding step…) so failures aren't swallowed
 * silently and prod is inspectable without `wrangler tail`. Not membrane data — an ops table with no
 * RLS, written best-effort via `logEvent` (never throws into callers). `owner_id` is nullable
 * (some events aren't tied to a user) and is a plain string, not an FK, so logging can't fail on a
 * missing/unknown owner.
 */
export const eventLog = pgTable(
  "event_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    /** "error" | "turn" | "tool" | "workflow" | "reminder" | "onboarding" | … */
    kind: text("kind").notNull(),
    level: text("level").notNull().default("info"), // "info" | "warn" | "error"
    ownerId: text("owner_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("event_log_created_idx").on(t.createdAt), index("event_log_owner_idx").on(t.ownerId)],
);
