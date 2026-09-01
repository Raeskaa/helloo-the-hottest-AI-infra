import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { makeRetryingFetch } from "./retry";

// The neon-http driver retries transient cold-start 5xx / network errors (see retry.ts).
neonConfig.fetchFunction = makeRetryingFetch();

/** Edge-native Neon Postgres client (HTTP driver — no persistent connection). */
export function getDb(url: string) {
  return drizzle(neon(url), { schema });
}

/** Trivial query to keep Neon's compute warm (used by the cron warm-up). */
export async function pingDb(url: string): Promise<void> {
  await getDb(url).execute(sql`select 1`);
}

export type DB = ReturnType<typeof getDb>;
export * as schema from "./schema";
export { withTenant, type Tx, type TenantDb } from "./tenant";
export { ensureHello } from "./hello";
export { withDbRetry, isTransientDbError, makeRetryingFetch } from "./retry";
