import { and, cosineDistance, eq, isNull, sql } from "drizzle-orm";
import { atom, atomEmbedding } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";
import { withTenant } from "./db";
import { embedQuery } from "./embedding";
import type { Atom } from "./repository";

export interface RecallHit {
  atom: Atom;
  /** Cosine similarity in [0,1]; higher is closer. */
  score: number;
}

/**
 * Semantic recall (ADR-0005, v1): embed the query, rank the caller's ACTIVE atoms by cosine
 * similarity over the pgvector index, tenant-scoped by RLS. Atoms carry `provenance`, so each
 * hit answers "why do you know this". v1 is vector-only; keyword+RRF fusion, multi-hop, and a
 * reranker are the next slices (HUB-MEMORY mandates multi-signal).
 */
export async function recall(
  env: AppEnv,
  ownerId: string,
  query: string,
  k = 8,
): Promise<RecallHit[]> {
  const qvec = await embedQuery(env, query);

  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const distance = cosineDistance(atomEmbedding.embedding, qvec);
    const rows = await tx
      .select({ atom, score: sql<number>`1 - (${distance})` })
      .from(atom)
      .innerJoin(atomEmbedding, eq(atomEmbedding.atomId, atom.id))
      .where(and(eq(atom.status, "active"), isNull(atom.expiredAt)))
      .orderBy(distance)
      .limit(k);

    return rows.map((r) => ({ atom: r.atom, score: Number(r.score) }));
  });
}
