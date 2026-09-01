import type { AppEnv } from "@helloo/core";
import type { AtomProvenance } from "@helloo/db/schema";
import { withTenant } from "./db";
import { assertAtom, currentAtoms, ensureHello, type Atom } from "./repository";
import { extractFacts, EXTRACTION_MODEL } from "./extract";

export interface IngestResult {
  /** How many candidate facts the model proposed. */
  extracted: number;
  /** The atoms written this call. */
  atoms: Atom[];
}

/**
 * Write path (ADR-0002): raw text -> extract candidate facts -> append as atoms, all under
 * the owner's tenant context. Reconciliation (ADD/UPDATE/DELETE/NOOP against existing atoms)
 * is a later slice — v1 appends every extracted fact.
 */
export async function ingestText(
  env: AppEnv,
  ownerId: string,
  text: string,
  source = "conversation",
): Promise<IngestResult> {
  const facts = await extractFacts(env, text);

  const atoms = await withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const helloId = await ensureHello(tx, ownerId);
    const written: Atom[] = [];
    for (const fact of facts) {
      const provenance: AtomProvenance[] = [{ source, assertedBy: EXTRACTION_MODEL }];
      written.push(
        await assertAtom(tx, {
          ownerId,
          helloId,
          subject: fact.subject,
          predicate: fact.predicate,
          object: { value: fact.value },
          factText: fact.factText,
          confidence: fact.confidence,
          provenance,
        }),
      );
    }
    return written;
  });

  return { extracted: facts.length, atoms };
}

/** Read path (MVP): the owner's current beliefs, newest first. */
export async function listMemory(env: AppEnv, ownerId: string): Promise<Atom[]> {
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const helloId = await ensureHello(tx, ownerId);
    return currentAtoms(tx, helloId);
  });
}
