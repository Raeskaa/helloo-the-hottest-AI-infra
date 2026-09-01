import { and, cosineDistance, eq, inArray, isNull, sql } from "drizzle-orm";
import { atom, atomEmbedding } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";
import { withTenant, type Tx } from "./db";
import { embedQuery } from "./embedding";
import type { Atom } from "./repository";

export interface RecallHit {
  atom: Atom;
  /** Reciprocal-rank-fusion score (higher = better); combines the semantic + keyword signals. */
  score: number;
  /** 1-based rank in each signal, or null if that signal didn't surface it. */
  signals: { vectorRank: number | null; keywordRank: number | null };
}

/** RRF constant — dampens the weight of low ranks (standard ~60). */
const RRF_K = 60;
/** Candidates to pull from each signal before fusing. */
const CANDIDATES = 25;

async function vectorRankedIds(tx: Tx, qvec: number[]): Promise<string[]> {
  const rows = await tx
    .select({ id: atom.id })
    .from(atom)
    .innerJoin(atomEmbedding, eq(atomEmbedding.atomId, atom.id))
    .where(and(eq(atom.status, "active"), isNull(atom.expiredAt)))
    .orderBy(cosineDistance(atomEmbedding.embedding, qvec))
    .limit(CANDIDATES);
  return rows.map((r) => r.id);
}

async function keywordRankedIds(tx: Tx, query: string): Promise<string[]> {
  const tsv = sql`to_tsvector('english', ${atom.factText})`;
  const tsq = sql`plainto_tsquery('english', ${query})`;
  const rows = await tx
    .select({ id: atom.id })
    .from(atom)
    .where(and(eq(atom.status, "active"), isNull(atom.expiredAt), sql`${tsv} @@ ${tsq}`))
    .orderBy(sql`ts_rank(${tsv}, ${tsq}) desc`)
    .limit(CANDIDATES);
  return rows.map((r) => r.id);
}

interface Fused {
  score: number;
  vectorRank: number | null;
  keywordRank: number | null;
}

/**
 * Multi-signal recall (ADR-0005; SYSTEM-MAP §4 "never single-vector"): fuse dense semantic
 * (pgvector cosine) and lexical (Postgres full-text) rankings via Reciprocal Rank Fusion,
 * tenant-scoped by RLS. Atoms carry `provenance`, so each hit answers "why do you know this".
 * Graph/multi-hop signal and an LLM reranker are the next slices.
 */
export async function recall(
  env: AppEnv,
  ownerId: string,
  query: string,
  k = 8,
): Promise<RecallHit[]> {
  const qvec = await embedQuery(env, query);

  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    // Sequential: a single tx connection can't multiplex concurrent queries.
    const vecIds = await vectorRankedIds(tx, qvec);
    const kwIds = await keywordRankedIds(tx, query);

    const fused = new Map<string, Fused>();
    const add = (id: string, rank: number, signal: "vector" | "keyword") => {
      const cur = fused.get(id) ?? { score: 0, vectorRank: null, keywordRank: null };
      cur.score += 1 / (RRF_K + rank);
      if (signal === "vector") cur.vectorRank = rank;
      else cur.keywordRank = rank;
      fused.set(id, cur);
    };
    vecIds.forEach((id, i) => add(id, i + 1, "vector"));
    kwIds.forEach((id, i) => add(id, i + 1, "keyword"));

    const topIds = [...fused.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, k)
      .map(([id]) => id);
    if (topIds.length === 0) return [];

    const rows = await tx.select().from(atom).where(inArray(atom.id, topIds));
    const byId = new Map(rows.map((r) => [r.id, r]));

    const hits: RecallHit[] = [];
    for (const id of topIds) {
      const row = byId.get(id);
      const f = fused.get(id);
      if (!row || !f) continue;
      hits.push({
        atom: row,
        score: Number(f.score.toFixed(6)),
        signals: { vectorRank: f.vectorRank, keywordRank: f.keywordRank },
      });
    }
    return hits;
  });
}
