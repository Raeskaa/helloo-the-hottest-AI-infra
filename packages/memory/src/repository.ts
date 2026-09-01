import { and, desc, eq, isNull } from "drizzle-orm";
import {
  atom,
  audit,
  visibility as visibilityEnum,
  auditKind as auditKindEnum,
  type AtomObject,
  type AtomProvenance,
  type AuditPayload,
} from "@helloo/db/schema";
import { ensureHello, type Tx } from "@helloo/db";

export { ensureHello };
export type Visibility = (typeof visibilityEnum.enumValues)[number];
export type AuditKind = (typeof auditKindEnum.enumValues)[number];
export type Atom = typeof atom.$inferSelect;
export type AuditRow = typeof audit.$inferSelect;

export interface AssertAtomInput {
  ownerId: string;
  helloId: string;
  subject: string;
  predicate: string;
  object: AtomObject;
  factText: string;
  provenance: AtomProvenance[];
  visibility?: Visibility;
  confidence?: number;
}

/** Write a new fact as a fresh active atom (first version). Supersession comes in a later slice. */
export async function assertAtom(tx: Tx, input: AssertAtomInput): Promise<Atom> {
  const inserted = await tx
    .insert(atom)
    .values({
      ownerId: input.ownerId,
      helloId: input.helloId,
      subject: input.subject,
      predicate: input.predicate,
      object: input.object,
      factText: input.factText,
      provenance: input.provenance,
      visibility: input.visibility ?? "private",
      confidence: input.confidence ?? 1,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("assertAtom: insert returned no row");
  return row;
}

/** Current beliefs for a hello: active, not yet world-invalidated. */
export async function currentAtoms(tx: Tx, helloId: string): Promise<Atom[]> {
  return tx
    .select()
    .from(atom)
    .where(and(eq(atom.helloId, helloId), eq(atom.status, "active"), isNull(atom.expiredAt)))
    .orderBy(desc(atom.createdAt));
}

export interface AppendAuditInput {
  ownerId: string;
  helloId: string;
  kind: AuditKind;
  requestId?: string;
  payload?: AuditPayload;
}

/** Append one row to the trust/action log (ADR-0002 B.2). */
export async function appendAudit(tx: Tx, input: AppendAuditInput): Promise<AuditRow> {
  const inserted = await tx
    .insert(audit)
    .values({
      ownerId: input.ownerId,
      helloId: input.helloId,
      kind: input.kind,
      requestId: input.requestId,
      payload: input.payload ?? {},
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("appendAudit: insert returned no row");
  return row;
}
