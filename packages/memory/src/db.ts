import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import { schema } from "@helloo/db";

type Schema = typeof schema;
export type MembraneDb = NeonDatabase<Schema>;
/** The transaction handle every membrane repository call runs inside. */
export type Tx = Parameters<Parameters<MembraneDb["transaction"]>[0]>[0];

/**
 * Run `fn` inside a transaction whose tenant context is pinned to `ownerId` — every
 * statement is then filtered by the RLS policies (ADR-0003). Uses the Neon Pool
 * (WebSocket) driver because `SET LOCAL` and the query must share one transaction;
 * `set_config(..., true)` scopes the GUC to this transaction (PgBouncer-safe).
 *
 * Never run membrane reads/writes outside this — a bare query has no tenant and sees nothing.
 */
export async function withTenant<T>(
  databaseUrl: string,
  ownerId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
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
}
