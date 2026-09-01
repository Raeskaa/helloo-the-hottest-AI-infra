export {
  ensureHello,
  assertAtom,
  currentAtoms,
  appendAudit,
  type Atom,
  type AuditRow,
  type Visibility,
  type AuditKind,
  type AssertAtomInput,
  type AppendAuditInput,
} from "./repository";
export { extractFacts, EXTRACTION_MODEL, type ExtractedFact } from "./extract";
export { ingestText, listMemory, type IngestResult } from "./ingest";
export {
  reconcileFact,
  type ReconcileAction,
  type ReconcileOutcome,
} from "./reconcile";
export {
  embedDocuments,
  embedQuery,
  EMBEDDING_MODEL,
  EMBEDDING_DIMS,
} from "./embedding";
export { recall, type RecallHit } from "./recall";
export {
  membraneSelfTest,
  type MembraneSelfTestResult,
  ingestSelfTest,
  type IngestSelfTestResult,
  reconcileSelfTest,
  type ReconcileSelfTestResult,
  recallSelfTest,
  type RecallSelfTestResult,
} from "./selftest";
