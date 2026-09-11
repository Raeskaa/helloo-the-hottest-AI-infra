import { sql } from "drizzle-orm";
import { getDb } from "@helloo/db";
import { usageCounter } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";

/**
 * Spend guard (HUB-TRUST "spend caps"): a per-owner, per-day cap on agent turns so one runaway or
 * abusive user can't drain the shared free-tier LLM/tool budget. `recordTurn` atomically counts the
 * turn and reports whether the owner is still under their cap.
 */

export const DEFAULT_DAILY_TURN_CAP = 100;

export interface TurnBudget {
  allowed: boolean;
  used: number;
  cap: number;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The effective cap for this env (DAILY_TURN_CAP override, else the default). */
export function turnCap(env: AppEnv): number {
  const n = Number(env.DAILY_TURN_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_TURN_CAP;
}

/** Count today's turn for an owner and report whether they're still within cap. */
export async function recordTurn(env: AppEnv, ownerId: string, cap: number): Promise<TurnBudget> {
  const db = getDb(env.DATABASE_URL);
  const day = utcDay();
  const rows = await db
    .insert(usageCounter)
    .values({ ownerId, day, turns: 1, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [usageCounter.ownerId, usageCounter.day],
      set: { turns: sql`${usageCounter.turns} + 1`, updatedAt: new Date() },
    })
    .returning({ turns: usageCounter.turns });
  const used = rows[0]?.turns ?? 1;
  return { allowed: used <= cap, used, cap };
}
