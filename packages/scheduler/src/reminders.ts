import { and, asc, eq, lte } from "drizzle-orm";
import { getDb, withTenant, ensureHello } from "@helloo/db";
import { reminder } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";

/**
 * Reminder scheduling. Writes go through `withTenant` (RLS-scoped to the owner). The cron scan and
 * advance run on the owner connection, which bypasses RLS so one pass can serve every user.
 */

export type ReminderMode = "say" | "run";
export type ReminderRepeat = "none" | "daily" | "weekly";

export interface ScheduleReminderInput {
  channel?: string;
  mode: ReminderMode;
  body: string;
  repeat: ReminderRepeat;
  nextRunAt: Date;
}
export interface ScheduledReminder {
  id: string;
  nextRunAt: Date;
  repeat: ReminderRepeat;
}
/** A due reminder as seen by the cron (no tenant context). */
export interface DueReminder {
  id: string;
  ownerId: string;
  channel: string;
  mode: ReminderMode;
  body: string;
  repeat: ReminderRepeat;
  nextRunAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function normalizeMode(v: string): ReminderMode {
  return v === "run" ? "run" : "say";
}
function normalizeRepeat(v: string): ReminderRepeat {
  return v === "daily" || v === "weekly" ? v : "none";
}
/** Next occurrence strictly after `now`, preserving the original wall-clock offset. */
function computeNext(from: Date, repeat: ReminderRepeat, now: Date): Date | null {
  const period = repeat === "daily" ? DAY_MS : repeat === "weekly" ? WEEK_MS : 0;
  if (period === 0) return null;
  let next = from.getTime();
  while (next <= now.getTime()) next += period;
  return new Date(next);
}

/** Create a reminder for the owner (tenant-scoped write). */
export async function scheduleReminder(
  env: AppEnv,
  ownerId: string,
  input: ScheduleReminderInput,
): Promise<ScheduledReminder> {
  const repeat = normalizeRepeat(input.repeat);
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const helloId = await ensureHello(tx, ownerId);
    const rows = await tx
      .insert(reminder)
      .values({
        ownerId,
        helloId,
        channel: input.channel ?? "telegram",
        mode: normalizeMode(input.mode),
        body: input.body,
        repeat,
        nextRunAt: input.nextRunAt,
      })
      .returning({ id: reminder.id, nextRunAt: reminder.nextRunAt });
    const row = rows[0];
    if (!row) throw new Error("failed to create reminder");
    return { id: row.id, nextRunAt: row.nextRunAt, repeat };
  });
}

/** The owner's active reminders, soonest first. */
export async function listReminders(env: AppEnv, ownerId: string): Promise<DueReminder[]> {
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const rows = await tx
      .select({
        id: reminder.id,
        ownerId: reminder.ownerId,
        channel: reminder.channel,
        mode: reminder.mode,
        body: reminder.body,
        repeat: reminder.repeat,
        nextRunAt: reminder.nextRunAt,
      })
      .from(reminder)
      .where(eq(reminder.status, "active"))
      .orderBy(asc(reminder.nextRunAt));
    return rows.map((r) => ({ ...r, mode: normalizeMode(r.mode), repeat: normalizeRepeat(r.repeat) }));
  });
}

/** Cancel a reminder the owner owns. Returns whether a row was cancelled. */
export async function cancelReminder(env: AppEnv, ownerId: string, id: string): Promise<boolean> {
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const rows = await tx
      .update(reminder)
      .set({ status: "cancelled" })
      .where(and(eq(reminder.id, id), eq(reminder.status, "active")))
      .returning({ id: reminder.id });
    return rows.length > 0;
  });
}

/** Due reminders across all tenants (cron scan; owner connection bypasses RLS). */
export async function dueReminders(env: AppEnv, now: Date, limit = 50): Promise<DueReminder[]> {
  const rows = await getDb(env.DATABASE_URL)
    .select({
      id: reminder.id,
      ownerId: reminder.ownerId,
      channel: reminder.channel,
      mode: reminder.mode,
      body: reminder.body,
      repeat: reminder.repeat,
      nextRunAt: reminder.nextRunAt,
    })
    .from(reminder)
    .where(and(eq(reminder.status, "active"), lte(reminder.nextRunAt, now)))
    .orderBy(asc(reminder.nextRunAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, mode: normalizeMode(r.mode), repeat: normalizeRepeat(r.repeat) }));
}

/** After firing: advance a recurring reminder to its next run, or complete a one-off. */
export async function advanceReminder(env: AppEnv, row: DueReminder, now: Date): Promise<void> {
  const next = computeNext(row.nextRunAt, row.repeat, now);
  const db = getDb(env.DATABASE_URL);
  if (next) {
    await db.update(reminder).set({ lastRunAt: now, nextRunAt: next }).where(eq(reminder.id, row.id));
  } else {
    await db.update(reminder).set({ lastRunAt: now, status: "done" }).where(eq(reminder.id, row.id));
  }
}
