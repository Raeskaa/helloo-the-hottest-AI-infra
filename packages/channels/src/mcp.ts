import { eq } from "drizzle-orm";
import { getDb } from "@helloo/db";
import { mcpToken } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";

/**
 * MCP channel tokens — the per-user credential that lets an MCP client (Claude / ChatGPT / any)
 * reach the owner's helloo as an MCP server. Queried via the owner connection (the MCP endpoint is
 * unauthenticated at the session level; the token IS the auth), like the other identity tables.
 */

/** Mint a fresh MCP token for an owner (reusing is fine — a user can have several). */
export async function createMcpToken(env: AppEnv, ownerId: string, label?: string): Promise<string> {
  const token = `hmcp_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  await getDb(env.DATABASE_URL).insert(mcpToken).values({ token, ownerId, label: label ?? null });
  return token;
}

/** Resolve the owner a token belongs to (and stamp last-used), or null. */
export async function resolveMcpOwner(env: AppEnv, token: string): Promise<string | null> {
  const db = getDb(env.DATABASE_URL);
  const rows = await db
    .select({ ownerId: mcpToken.ownerId })
    .from(mcpToken)
    .where(eq(mcpToken.token, token))
    .limit(1);
  const owner = rows[0]?.ownerId ?? null;
  if (owner) {
    await db.update(mcpToken).set({ lastUsedAt: new Date() }).where(eq(mcpToken.token, token)).catch(() => {});
  }
  return owner;
}
