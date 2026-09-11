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

/**
 * `workflow` — an event-triggered automation: WHEN a trigger fires, run `instruction` as an agent
 * turn (multi-step, writes gated) and deliver the result on `channel`. v1 trigger = a new Gmail
 * matching `match_from` / `match_subject`. The cron polls, dedups against `last_seen_id` (the newest
 * message id already handled — set as a baseline on first poll so a workflow never fires on backlog),
 * and fires on newer matches. Tenant-isolated by RLS; the cron reads across tenants via the owner
 * connection (bypasses RLS).
 */
export const workflow = pgTable(
  "workflow",
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
    name: text("name").notNull(),
    triggerType: text("trigger_type").notNull().default("email"), // v1: "email"
    matchFrom: text("match_from"), // substring on sender (null = any)
    matchSubject: text("match_subject"), // substring on subject (null = any)
    instruction: text("instruction").notNull(), // what the agent should do when it fires
    channel: text("channel").notNull().default("telegram"),
    status: text("status").notNull().default("active"), // "active" | "paused"
    lastSeenId: text("last_seen_id"), // newest message id already handled (dedup baseline)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("workflow_active_idx").on(t.triggerType).where(sql`${t.status} = 'active'`),
    index("workflow_owner_idx").on(t.ownerId),
  ],
);
