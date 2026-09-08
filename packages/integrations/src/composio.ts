import { Composio } from "@composio/core";
import { eq } from "drizzle-orm";
import { getDb } from "@helloo/db";
import { composioIdentity } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";

/**
 * Composio client (integrations / tool execution — SYSTEM-MAP §"Integrations"). A user's
 * connected accounts and tool executions are scoped by a Composio external user id.
 */
export function composioClient(env: AppEnv): Composio {
  if (!env.COMPOSIO_API_KEY) {
    throw new Error("COMPOSIO_API_KEY is required for integrations");
  }
  return new Composio({ apiKey: env.COMPOSIO_API_KEY });
}

/**
 * The Composio external user id for a helloo owner. Defaults to the owner id, unless a
 * `composio_identity` mapping points at a different id (e.g. a migrated prior account).
 */
export async function composioUserId(env: AppEnv, ownerId: string): Promise<string> {
  const rows = await getDb(env.DATABASE_URL)
    .select({ cid: composioIdentity.composioUserId })
    .from(composioIdentity)
    .where(eq(composioIdentity.ownerId, ownerId))
    .limit(1);
  return rows[0]?.cid ?? ownerId;
}
