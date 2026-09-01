import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { atom, type AtomProvenance } from "@helloo/db/schema";
import type { Tx } from "./db";
import { assertAtom, type Atom } from "./repository";
import { EXTRACTION_MODEL, type ExtractedFact } from "./extract";

/**
 * Write-time reconciliation (ADR-0002 / HUB-MEMORY step 3): a new fact is matched against
 * the current belief for the same (subject, predicate) and routed to:
 *   - add    — no current belief exists            -> new atom (version 1)
 *   - update — a different value is believed        -> supersede old + open a new version
 *   - noop   — the same value is already believed   -> reinforce (last_confirmed_at, salience)
 * Never erases: supersession keeps full history + provenance. DELETE (forget) is a separate,
 * user-initiated action. v1 matches on normalized (subject, predicate) equality; semantic
 * matching arrives with the recall/embedding layer.
 */

export type ReconcileAction = "add" | "update" | "noop";
export interface ReconcileOutcome {
  action: ReconcileAction;
  atom: Atom;
}

const norm = (s: string): string => s.trim().toLowerCase();

function valueOf(a: Atom): string {
  const v = a.object["value"];
  return typeof v === "string" ? v : JSON.stringify(a.object);
}

/** The current active belief for a (subject, predicate), if any. */
async function currentBelief(
  tx: Tx,
  helloId: string,
  subject: string,
  predicate: string,
): Promise<Atom | undefined> {
  const rows = await tx
    .select()
    .from(atom)
    .where(
      and(
        eq(atom.helloId, helloId),
        eq(atom.status, "active"),
        isNull(atom.expiredAt),
        sql`lower(${atom.subject}) = ${norm(subject)}`,
        sql`lower(${atom.predicate}) = ${norm(predicate)}`,
      ),
    )
    .orderBy(desc(atom.version))
    .limit(1);
  return rows[0];
}

export async function reconcileFact(
  tx: Tx,
  ownerId: string,
  helloId: string,
  fact: ExtractedFact,
  source: string,
): Promise<ReconcileOutcome> {
  const provenance: AtomProvenance[] = [{ source, assertedBy: EXTRACTION_MODEL }];
  const existing = await currentBelief(tx, helloId, fact.subject, fact.predicate);

  // ADD — nothing believed yet.
  if (!existing) {
    const created = await assertAtom(tx, {
      ownerId,
      helloId,
      subject: fact.subject,
      predicate: fact.predicate,
      object: { value: fact.value },
      factText: fact.factText,
      confidence: fact.confidence,
      provenance,
    });
    return { action: "add", atom: created };
  }

  // NOOP — same value already believed; reinforce on confirmation (not on retrieval).
  if (norm(valueOf(existing)) === norm(fact.value)) {
    const reinforced = await tx
      .update(atom)
      .set({
        lastConfirmedAt: new Date(),
        salience: sql`least(${atom.salience} + 0.1, 1)`,
        confidence: Math.max(existing.confidence, fact.confidence),
      })
      .where(eq(atom.id, existing.id))
      .returning();
    return { action: "noop", atom: reinforced[0] ?? existing };
  }

  // UPDATE — a different value: supersede the old belief, open a new version.
  const now = new Date();
  await tx
    .update(atom)
    .set({ status: "superseded", expiredAt: now, invalidAt: now })
    .where(eq(atom.id, existing.id));
  const opened = await tx
    .insert(atom)
    .values({
      atomId: existing.atomId,
      version: existing.version + 1,
      ownerId,
      helloId,
      subject: fact.subject,
      predicate: fact.predicate,
      object: { value: fact.value },
      factText: fact.factText,
      confidence: fact.confidence,
      provenance,
      supersedes: existing.id,
      visibility: existing.visibility,
    })
    .returning();
  const row = opened[0];
  if (!row) throw new Error("reconcileFact: supersede insert returned no row");
  return { action: "update", atom: row };
}
