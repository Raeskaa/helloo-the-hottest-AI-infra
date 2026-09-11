import { and, eq, notInArray } from "drizzle-orm";
import { getDb } from "@helloo/db";
import { connection } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";
import { composioClient, composioUserId } from "./composio";

/** Get an existing composio-managed auth config for a toolkit, or create one. */
async function getOrCreateAuthConfig(env: AppEnv, toolkit: string): Promise<string> {
  const composio = composioClient(env);
  const list = await composio.authConfigs.list({});
  const found = list.items.find((c) => c.toolkit.slug === toolkit);
  if (found) return found.id;
  const created = await composio.authConfigs.create(toolkit, { type: "use_composio_managed_auth" });
  return created.id;
}

export interface ConnectionLink {
  /** The URL the user opens to authorize the account. */
  redirectUrl: string;
  connectionId: string;
}

/**
 * Start connecting a toolkit (e.g. "gmail") for a user: returns the OAuth redirect URL. The
 * user authorizes in a browser (an OAuth grant — always the user's own action); the connection
 * then flips to ACTIVE and its tools become executable.
 */
export async function initiateConnection(
  env: AppEnv,
  ownerId: string,
  toolkit: string,
): Promise<ConnectionLink> {
  const composio = composioClient(env);
  const authConfigId = await getOrCreateAuthConfig(env, toolkit);
  // allowMultiple so reconnecting a toolkit whose token EXPIRED (a prior account already exists)
  // returns a fresh link instead of erroring — otherwise the connect flow can't heal an expired account.
  const link = await composio.connectedAccounts.link(await composioUserId(env, ownerId), authConfigId, {
    allowMultiple: true,
  });
  if (!link.redirectUrl) {
    throw new Error(`Composio returned no redirect URL for ${toolkit}`);
  }
  return { redirectUrl: link.redirectUrl, connectionId: link.id };
}

export interface Connection {
  toolkit: string;
  status: string;
  connectionId: string;
}

/** The user's connected accounts (status ACTIVE ones are usable). */
export async function listConnections(env: AppEnv, ownerId: string): Promise<Connection[]> {
  const composio = composioClient(env);
  const res = await composio.connectedAccounts.list({ userIds: [await composioUserId(env, ownerId)] });
  return res.items.map((c) => ({
    toolkit: c.toolkit.slug,
    status: c.status,
    connectionId: c.id,
  }));
}

/** Toolkit slugs the user has an ACTIVE connection for. */
export async function connectedToolkits(env: AppEnv, ownerId: string): Promise<string[]> {
  const connections = await listConnections(env, ownerId);
  return connections.filter((c) => c.status === "ACTIVE").map((c) => c.toolkit);
}

// ── Multi-account support ────────────────────────────────────────────────────
// A user can connect several accounts of the same toolkit (e.g. 4 Google accounts). We mirror
// Composio's connected accounts into our `connection` table, keep exactly one default per toolkit,
// and route tool execution to that default (executeAction passes its connectedAccountId).

export interface OwnerConnection {
  toolkit: string;
  connectedAccountId: string;
  label: string;
  isDefault: boolean;
  status: string;
}

function shortId(id: string): string {
  return id.replace(/^ca_/, "").slice(0, 6);
}

/** Ensure each toolkit with ACTIVE accounts has exactly one default. */
async function ensureDefaults(env: AppEnv, ownerId: string): Promise<void> {
  const db = getDb(env.DATABASE_URL);
  const rows = await db
    .select()
    .from(connection)
    .where(and(eq(connection.ownerId, ownerId), eq(connection.status, "ACTIVE")));
  const byToolkit = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byToolkit.get(r.toolkit) ?? [];
    list.push(r);
    byToolkit.set(r.toolkit, list);
  }
  for (const list of byToolkit.values()) {
    const defaults = list.filter((r) => r.isDefault);
    const first = list[0];
    if (defaults.length === 0 && first) {
      await db.update(connection).set({ isDefault: true }).where(eq(connection.id, first.id));
    } else if (defaults.length > 1) {
      for (const extra of defaults.slice(1)) {
        await db.update(connection).set({ isDefault: false }).where(eq(connection.id, extra.id));
      }
    }
  }
}

/**
 * Mirror the owner's Composio connected accounts into `connection` (upsert live ones, drop stale),
 * keep one default per toolkit, and return the ACTIVE toolkit slugs. A drop-in for connectedToolkits
 * that also refreshes the account table — called once at the start of a turn.
 */
export async function syncConnections(env: AppEnv, ownerId: string): Promise<string[]> {
  const composio = composioClient(env);
  const userId = await composioUserId(env, ownerId);
  const res = await composio.connectedAccounts.list({ userIds: [userId] });
  const db = getDb(env.DATABASE_URL);
  const liveIds: string[] = [];
  for (const a of res.items) {
    liveIds.push(a.id);
    const label = a.alias && a.alias.length > 0 ? a.alias : `${a.toolkit.slug} ${shortId(a.id)}`;
    await db
      .insert(connection)
      .values({
        ownerId,
        toolkit: a.toolkit.slug,
        connectedAccountId: a.id,
        label,
        status: a.status,
        isDefault: false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [connection.ownerId, connection.connectedAccountId],
        set: { status: a.status, toolkit: a.toolkit.slug, updatedAt: new Date() },
      });
  }
  // Drop accounts that no longer exist in Composio.
  if (liveIds.length > 0) {
    await db
      .delete(connection)
      .where(and(eq(connection.ownerId, ownerId), notInArray(connection.connectedAccountId, liveIds)));
  } else {
    await db.delete(connection).where(eq(connection.ownerId, ownerId));
  }
  await ensureDefaults(env, ownerId);
  return [...new Set(res.items.filter((a) => a.status === "ACTIVE").map((a) => a.toolkit.slug))];
}

/** The owner's connected accounts (from our table), soonest-connected first. */
export async function listAccounts(env: AppEnv, ownerId: string): Promise<OwnerConnection[]> {
  const rows = await getDb(env.DATABASE_URL)
    .select({
      toolkit: connection.toolkit,
      connectedAccountId: connection.connectedAccountId,
      label: connection.label,
      isDefault: connection.isDefault,
      status: connection.status,
    })
    .from(connection)
    .where(eq(connection.ownerId, ownerId));
  return rows;
}

/** The connectedAccountId to use for a toolkit (its ACTIVE default), or null. */
export async function defaultAccountId(
  env: AppEnv,
  ownerId: string,
  toolkit: string,
): Promise<string | null> {
  const rows = await getDb(env.DATABASE_URL)
    .select({ id: connection.connectedAccountId })
    .from(connection)
    .where(
      and(
        eq(connection.ownerId, ownerId),
        eq(connection.toolkit, toolkit),
        eq(connection.status, "ACTIVE"),
        eq(connection.isDefault, true),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Make one account the default for its toolkit (match by label substring or account id). */
export async function setDefaultAccount(
  env: AppEnv,
  ownerId: string,
  target: string,
): Promise<{ ok: boolean; toolkit?: string; label?: string }> {
  const db = getDb(env.DATABASE_URL);
  const matches = await db
    .select()
    .from(connection)
    .where(
      and(
        eq(connection.ownerId, ownerId),
        eq(connection.status, "ACTIVE"),
      ),
    );
  const hit =
    matches.find((r) => r.connectedAccountId === target) ??
    matches.find((r) => r.label.toLowerCase().includes(target.toLowerCase()));
  if (!hit) return { ok: false };
  await db
    .update(connection)
    .set({ isDefault: false })
    .where(and(eq(connection.ownerId, ownerId), eq(connection.toolkit, hit.toolkit)));
  await db.update(connection).set({ isDefault: true }).where(eq(connection.id, hit.id));
  return { ok: true, toolkit: hit.toolkit, label: hit.label };
}

/** Rename an account (match by current label substring or account id). */
export async function labelAccount(
  env: AppEnv,
  ownerId: string,
  target: string,
  newLabel: string,
): Promise<boolean> {
  const db = getDb(env.DATABASE_URL);
  const matches = await db
    .select()
    .from(connection)
    .where(eq(connection.ownerId, ownerId));
  const hit =
    matches.find((r) => r.connectedAccountId === target) ??
    matches.find((r) => r.label.toLowerCase().includes(target.toLowerCase()));
  if (!hit) return false;
  await db.update(connection).set({ label: newLabel }).where(eq(connection.id, hit.id));
  return true;
}
