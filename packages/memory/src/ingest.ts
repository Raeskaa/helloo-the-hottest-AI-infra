import type { AppEnv } from "@helloo/core";
import { withTenant } from "@helloo/db";
import { currentAtoms, ensureHello, type Atom } from "./repository";
import { extractFacts } from "./extract";
import { embedDocuments } from "./embedding";
import { reconcileFact } from "./reconcile";

export interface IngestResult {
  /** How many candidate facts the model proposed. */
  extracted: number;
  /** New beliefs (no prior atom for that subject+predicate). */
  added: number;
  /** Contradicted beliefs superseded by a new version. */
  updated: number;
  /** Already-believed facts, reinforced but not duplicated. */
  unchanged: number;
  /** The atoms touched this call (added, new versions, and reinforced ones). */
  atoms: Atom[];
}

/**
 * Write path (ADR-0002): raw text -> extract candidate facts -> reconcile each against the
 * current belief (ADD / UPDATE-supersede / NOOP-reinforce), all in one tenant-scoped
 * transaction so intra-batch duplicates collapse too.
 */
export async function ingestText(
  env: AppEnv,
  ownerId: string,
  text: string,
  source = "conversation",
): Promise<IngestResult> {
  const facts = await extractFacts(env, text);
  // Embed outside the transaction so no external call is held inside a tx (ADR-0005).
  const embeddings = await embedDocuments(
    env,
    facts.map((f) => f.factText),
  );

  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const helloId = await ensureHello(tx, ownerId);
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    const atoms: Atom[] = [];
    for (const [i, fact] of facts.entries()) {
      const outcome = await reconcileFact(tx, ownerId, helloId, fact, source, embeddings[i]);
      if (outcome.action === "add") added += 1;
      else if (outcome.action === "update") updated += 1;
      else unchanged += 1;
      atoms.push(outcome.atom);
    }
    return { extracted: facts.length, added, updated, unchanged, atoms };
  });
}

/** Read path (MVP): the owner's current beliefs, newest first. */
export async function listMemory(env: AppEnv, ownerId: string): Promise<Atom[]> {
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const helloId = await ensureHello(tx, ownerId);
    return currentAtoms(tx, helloId);
  });
}
