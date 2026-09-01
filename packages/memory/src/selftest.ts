import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { schema } from "@helloo/db";
import { atom } from "@helloo/db/schema";
import { withTenant, type Tx } from "./db";
import { assertAtom, currentAtoms, ensureHello } from "./repository";

export interface MembraneSelfTestResult {
  /** Atoms owner A can see after writing one (should be >= 1). */
  ownerAInserted: number;
  /** Atoms a different owner can see of A's data (MUST be 0 — the membrane). */
  visibleToStranger: number;
  /** True iff the membrane held: stranger saw nothing. */
  isolated: boolean;
}

/**
 * Proves the membrane below the model: owner A writes an atom and reads it back; a
 * different owner, in their own tenant context, sees zero of A's rows. Creates and
 * cleans up a throwaway user (cascade removes its hello + atoms). No auth needed.
 *
 * @param appUrl   non-owner (`helloo_app`) url — all tenant reads/writes go through it.
 * @param adminUrl owner url — only to create/remove the throwaway user (app role can't touch `user`).
 */
export async function membraneSelfTest(
  appUrl: string,
  adminUrl: string,
): Promise<MembraneSelfTestResult> {
  const ownerA = `selftest-${crypto.randomUUID()}`;
  const stranger = `selftest-${crypto.randomUUID()}`;
  const setupPool = new Pool({ connectionString: adminUrl });

  try {
    const sdb = drizzle(setupPool, { schema });
    await sdb.insert(schema.user).values({
      id: ownerA,
      name: "membrane-selftest",
      email: `${ownerA}@selftest.local`,
      emailVerified: false,
    });

    try {
      const ownerAInserted = await withTenant(appUrl, ownerA, async (tx: Tx) => {
        const helloId = await ensureHello(tx, ownerA);
        await assertAtom(tx, {
          ownerId: ownerA,
          helloId,
          subject: "selftest",
          predicate: "membrane_holds",
          object: { value: true },
          factText: "membrane self-test fact",
          provenance: [{ source: "selftest", assertedBy: "selftest" }],
        });
        return (await currentAtoms(tx, helloId)).length;
      });

      const visibleToStranger = await withTenant(appUrl, stranger, async (tx: Tx) => {
        return (await tx.select({ id: atom.id }).from(atom)).length;
      });

      return {
        ownerAInserted,
        visibleToStranger,
        isolated: visibleToStranger === 0,
      };
    } finally {
      // Cascade removes the throwaway user's hello + atoms.
      await sdb.delete(schema.user).where(eq(schema.user.id, ownerA));
    }
  } finally {
    await setupPool.end();
  }
}
