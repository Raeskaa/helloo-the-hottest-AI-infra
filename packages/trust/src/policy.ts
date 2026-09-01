import { eq } from "drizzle-orm";
import { policy } from "@helloo/db/schema";
import type { Tx } from "@helloo/db";
import type { Policy, PolicyEffect, PolicyScope, ProposedAction } from "./types";

/** An empty scope matches nothing (guard against accidental allow-all). */
function scopeMatches(scope: PolicyScope, action: ProposedAction): boolean {
  const fields = [scope.tool, scope.actionClass, scope.contact];
  if (!fields.some(Boolean)) return false;
  if (scope.tool && scope.tool !== action.tool) return false;
  if (scope.actionClass && scope.actionClass !== action.actionClass) return false;
  if (scope.contact && scope.contact !== action.contact) return false;
  return true;
}

/** The standing policy that governs this action, if any. Deny wins over allow. */
export async function matchPolicy(
  tx: Tx,
  helloId: string,
  action: ProposedAction,
): Promise<Policy | undefined> {
  const rows = await tx.select().from(policy).where(eq(policy.helloId, helloId));
  const now = Date.now();
  const active = rows.filter((p) => !p.expiresAt || p.expiresAt.getTime() > now);
  const matches = active.filter((p) => scopeMatches(p.scope, action));
  return matches.find((p) => p.effect === "deny") ?? matches.find((p) => p.effect === "allow");
}

/** Write a standing policy (e.g. from an "always allow for X" approval). */
export async function writePolicy(
  tx: Tx,
  ownerId: string,
  helloId: string,
  scope: PolicyScope,
  effect: PolicyEffect,
  sourceRequestId?: string,
): Promise<Policy> {
  const inserted = await tx
    .insert(policy)
    .values({ ownerId, helloId, scope, effect, sourceRequestId })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("writePolicy: insert returned no row");
  return row;
}
