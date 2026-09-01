import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { schema } from "@helloo/db";
import { atom } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";
import { withTenant, type Tx } from "@helloo/db";
import { assertAtom, currentAtoms, ensureHello } from "./repository";
import { ingestText, listMemory } from "./ingest";
import { reconcileFact } from "./reconcile";
import { recall } from "./recall";

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

export interface IngestSelfTestResult {
  extracted: number;
  written: number;
  readBack: Array<{ subject: string; predicate: string; object: unknown; confidence: number }>;
}

/**
 * Proves the write path over the WS driver only (Gemini extract -> atoms -> read back),
 * bypassing auth/neon-http. Creates and cleans up a throwaway user. Dev-only.
 */
export async function ingestSelfTest(env: AppEnv, text: string): Promise<IngestSelfTestResult> {
  const ownerA = `selftest-${crypto.randomUUID()}`;
  const setupPool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const sdb = drizzle(setupPool, { schema });
    await sdb.insert(schema.user).values({
      id: ownerA,
      name: "ingest-selftest",
      email: `${ownerA}@selftest.local`,
      emailVerified: false,
    });
    try {
      const result = await ingestText(env, ownerA, text, "selftest");
      const readBack = await listMemory(env, ownerA);
      return {
        extracted: result.extracted,
        written: result.atoms.length,
        readBack: readBack.map((a) => ({
          subject: a.subject,
          predicate: a.predicate,
          object: a.object,
          confidence: a.confidence,
        })),
      };
    } finally {
      await sdb.delete(schema.user).where(eq(schema.user.id, ownerA));
    }
  } finally {
    await setupPool.end();
  }
}

export interface ReconcileSelfTestResult {
  actions: string[];
  current: Array<{ predicate: string; object: unknown; version: number }>;
  totalRows: number;
  historyKept: boolean;
}

/**
 * Deterministic proof of the reconciler over the WS path (no auth, no LLM): the same
 * (subject,predicate) with a new value supersedes; a repeat is a noop; history is retained.
 */
export async function reconcileSelfTest(env: AppEnv): Promise<ReconcileSelfTestResult> {
  const ownerA = `selftest-${crypto.randomUUID()}`;
  const setupPool = new Pool({ connectionString: env.DATABASE_URL });
  const f = (predicate: string, value: string, confidence = 0.9) => ({
    subject: "user",
    predicate,
    value,
    factText: `user ${predicate} ${value}`,
    confidence,
  });
  try {
    const sdb = drizzle(setupPool, { schema });
    await sdb.insert(schema.user).values({
      id: ownerA,
      name: "reconcile-selftest",
      email: `${ownerA}@selftest.local`,
      emailVerified: false,
    });
    try {
      return await withTenant(env.APP_DATABASE_URL, ownerA, async (tx: Tx) => {
        const helloId = await ensureHello(tx, ownerA);
        const actions: string[] = [];
        actions.push((await reconcileFact(tx, ownerA, helloId, f("lives_in", "Paris"), "selftest")).action);
        actions.push((await reconcileFact(tx, ownerA, helloId, f("lives_in", "Lyon"), "selftest")).action);
        actions.push((await reconcileFact(tx, ownerA, helloId, f("lives_in", "Lyon"), "selftest")).action);
        actions.push((await reconcileFact(tx, ownerA, helloId, f("prefers", "tea"), "selftest")).action);
        const current = (await currentAtoms(tx, helloId)).map((a) => ({
          predicate: a.predicate,
          object: a.object,
          version: a.version,
        }));
        const allRows = await tx.select({ id: atom.id }).from(atom).where(eq(atom.helloId, helloId));
        return {
          actions,
          current,
          totalRows: allRows.length,
          historyKept: allRows.length > current.length,
        };
      });
    } finally {
      await sdb.delete(schema.user).where(eq(schema.user.id, ownerA));
    }
  } finally {
    await setupPool.end();
  }
}

export interface RecallSelfTestResult {
  ingested: { extracted: number; added: number; updated: number };
  queries: Array<{
    q: string;
    top: string | null;
    score: number | null;
    signals: { vectorRank: number | null; keywordRank: number | null } | null;
  }>;
}

/**
 * Proves semantic recall over the WS path (Gemini embed + pgvector), no auth: ingest a few
 * facts, then query and return the top hit per query. Creates + cleans up a throwaway user.
 */
export async function recallSelfTest(env: AppEnv): Promise<RecallSelfTestResult> {
  const ownerA = `selftest-${crypto.randomUUID()}`;
  const setupPool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const sdb = drizzle(setupPool, { schema });
    await sdb.insert(schema.user).values({
      id: ownerA,
      name: "recall-selftest",
      email: `${ownerA}@selftest.local`,
      emailVerified: false,
    });
    try {
      const r = await ingestText(
        env,
        ownerA,
        "I live in Lyon, I work as a chef, and on weekends I love hiking in the Alps.",
        "selftest",
      );
      // Mix of semantic-only ("job" ~ chef) and lexical ("Lyon", "chef") queries to exercise both signals.
      const qs = ["Where does the user live?", "What is the user's job?", "hiking", "chef"];
      const queries: RecallSelfTestResult["queries"] = [];
      for (const q of qs) {
        const hits = await recall(env, ownerA, q, 1);
        const top = hits[0];
        queries.push({
          q,
          top: top ? top.atom.factText : null,
          score: top ? Number(top.score.toFixed(4)) : null,
          signals: top ? top.signals : null,
        });
      }
      return { ingested: { extracted: r.extracted, added: r.added, updated: r.updated }, queries };
    } finally {
      await sdb.delete(schema.user).where(eq(schema.user.id, ownerA));
    }
  } finally {
    await setupPool.end();
  }
}
