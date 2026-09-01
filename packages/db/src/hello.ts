import { eq } from "drizzle-orm";
import { hello } from "./schema";
import type { Tx } from "./tenant";

/** Get this owner's hello, creating it on first use (one per owner in v1 — ADR-0004). */
export async function ensureHello(tx: Tx, ownerId: string): Promise<string> {
  const existing = await tx
    .select({ id: hello.id })
    .from(hello)
    .where(eq(hello.ownerId, ownerId))
    .limit(1);
  const found = existing[0];
  if (found) return found.id;

  const inserted = await tx.insert(hello).values({ ownerId }).returning({ id: hello.id });
  const row = inserted[0];
  if (!row) throw new Error("ensureHello: insert returned no row");
  return row.id;
}
