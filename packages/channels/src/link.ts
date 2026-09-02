import { and, eq } from "drizzle-orm";
import { getDb } from "@helloo/db";
import { channelLink } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";

/**
 * Channel identity linking. Queried via the owner connection (no tenant context — the webhook
 * is unauthenticated and is resolving *which* owner a message belongs to).
 */

/** Create a pending link for a signed-in owner; returns the short code to put in the deep link. */
export async function createPendingLink(
  env: AppEnv,
  ownerId: string,
  channel: string,
): Promise<string> {
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  await getDb(env.DATABASE_URL).insert(channelLink).values({ ownerId, channel, linkCode: code });
  return code;
}

/** Confirm a pending link from the webhook: bind the external id, clear the code. */
export async function confirmLink(
  env: AppEnv,
  channel: string,
  code: string,
  externalId: string,
): Promise<boolean> {
  const db = getDb(env.DATABASE_URL);
  const rows = await db
    .select()
    .from(channelLink)
    .where(and(eq(channelLink.channel, channel), eq(channelLink.linkCode, code)))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  await db
    .update(channelLink)
    .set({ externalId, linkCode: null })
    .where(eq(channelLink.id, row.id));
  return true;
}

/** Resolve which owner an external channel identity belongs to. */
export async function resolveOwner(
  env: AppEnv,
  channel: string,
  externalId: string,
): Promise<string | null> {
  const rows = await getDb(env.DATABASE_URL)
    .select({ ownerId: channelLink.ownerId })
    .from(channelLink)
    .where(and(eq(channelLink.channel, channel), eq(channelLink.externalId, externalId)))
    .limit(1);
  return rows[0]?.ownerId ?? null;
}
