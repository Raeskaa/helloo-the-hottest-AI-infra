import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { hello } from "./membrane";

/**
 * Proactive scheduler — the first thing that lets helloo message you *first* (reminders, daily
 * briefs, nudges). A `reminder` fires when `next_run_at` passes: the Worker's cron scans due rows
 * every few minutes and delivers them on the owner's channel. `mode` decides how:
 *  - "say"  → deliver `body` verbatim (a plain reminder).
 *  - "run"  → run `body` as an agent turn and deliver the reply (a brief: "summarise my day").
 * `repeat` recurs the row ("daily"/"weekly") by advancing `next_run_at`; "none" completes it.
 * Tenant-isolated by RLS on owner_id (writes go through withTenant); the cron reads across tenants
 * via the owner connection, which bypasses RLS.
 */
export const reminder = pgTable(
  "reminder",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    helloId: text("hello_id")
      .notNull()
      .references(() => hello.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("telegram"),
    mode: text("mode").notNull().default("say"), // "say" | "run"
    body: text("body").notNull(),
    repeat: text("repeat").notNull().default("none"), // "none" | "daily" | "weekly"
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"), // "active" | "done" | "cancelled"
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // The cron scan: due active reminders, soonest first.
    index("reminder_due_idx")
      .on(t.nextRunAt)
      .where(sql`${t.status} = 'active'`),
    index("reminder_owner_idx").on(t.ownerId),
  ],
);
