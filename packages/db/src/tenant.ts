import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { withDbRetry } from "./retry";

type Schema = typeof schema;
export type TenantDb = NeonDatabase<Schema>;
/** The transaction handle every tenant-scoped repository call runs inside. */
export type Tx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

/**
 * Run `fn` in a transaction whose tenant context is pinned to `ownerId`, so every statement
 * is filtered by the RLS policies (ADR-0003). Uses the Neon Pool (WebSocket) driver because
 * `SET LOCAL` and the query must share one transaction; `set_config(..., true)` scopes the GUC
 * to this transaction (PgBouncer-safe). `databaseUrl` MUST be the non-owner (`helloo_app`) url.
 *
 * Never run tenant reads/writes outside this — a bare query has no tenant and sees nothing.
 */
export async function withTenant<T>(
  databaseUrl: string,
  ownerId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  // The whole transaction is atomic, so retrying on a transient connect error is safe.
  return withDbRetry(async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const db = drizzle(pool, { schema });
      return await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.owner_id', ${ownerId}, true)`);
        return await fn(tx);
      });
    } finally {
      await pool.end();
    }
  });
}
