import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { schema } from "@helloo/db";
import { ingestText } from "@helloo/memory";
import type { AppEnv } from "@helloo/core";
import { converse } from "./converse";

export interface ConverseSelfTestResult {
  recallTurn: { reply: string; recalledCount: number };
  actionTurn: { reply: string; pending: Array<{ tool: string; summary: string }> };
}

/**
 * Proves the daily loop over the WS path: seed memory, ask a question (grounded recall),
 * then request an action (routed through the trust gate → pending approval). Creates and
 * cleans up a throwaway user.
 */
export async function converseSelfTest(env: AppEnv): Promise<ConverseSelfTestResult> {
  const ownerA = `selftest-${crypto.randomUUID()}`;
  const setupPool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const sdb = drizzle(setupPool, { schema });
    await sdb.insert(schema.user).values({
      id: ownerA,
      name: "converse-selftest",
      email: `${ownerA}@selftest.local`,
      emailVerified: false,
    });
    try {
      await ingestText(env, ownerA, "I live in Lyon and I work as a chef.", "selftest");

      const recallTurn = await converse(env, ownerA, "Where do I live?");
      const actionTurn = await converse(
        env,
        ownerA,
        "Email priya@example.com and let her know I'll be 10 minutes late.",
      );

      return {
        recallTurn: { reply: recallTurn.reply, recalledCount: recallTurn.recalled.length },
        actionTurn: {
          reply: actionTurn.reply,
          pending: actionTurn.pendingApprovals.map((p) => ({ tool: p.tool, summary: p.summary })),
        },
      };
    } finally {
      await sdb.delete(schema.user).where(eq(schema.user.id, ownerA));
    }
  } finally {
    await setupPool.end();
  }
}
