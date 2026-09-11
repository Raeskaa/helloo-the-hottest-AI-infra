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
