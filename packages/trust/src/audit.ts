import { audit, auditKind as auditKindEnum, type AuditPayload } from "@helloo/db/schema";
import type { Tx } from "@helloo/db";

export type AuditKind = (typeof auditKindEnum.enumValues)[number];

/** Append one row to the immutable audit spine (HUB-TRUST). */
export async function appendTrustAudit(
  tx: Tx,
  ownerId: string,
  helloId: string,
  kind: AuditKind,
  payload: AuditPayload,
): Promise<void> {
  await tx.insert(audit).values({ ownerId, helloId, kind, payload });
}
