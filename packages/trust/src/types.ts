import {
  riskLevel as riskLevelEnum,
  requestStatus as requestStatusEnum,
  policyEffect as policyEffectEnum,
  permissionRequest,
  policy,
  type ActionArgs,
  type PolicyScope,
} from "@helloo/db/schema";

export type RiskLevel = (typeof riskLevelEnum.enumValues)[number];
export type RequestStatus = (typeof requestStatusEnum.enumValues)[number];
export type PolicyEffect = (typeof policyEffectEnum.enumValues)[number];
export type PermissionRequest = typeof permissionRequest.$inferSelect;
export type Policy = typeof policy.$inferSelect;
export type { ActionArgs, PolicyScope };

/**
 * A proposed action the agent wants to take. The three booleans are the Rule-of-Two trifecta
 * (HUB-TRUST): holding all three forces a human gate. `contact`/`actionClass` scope the
 * "always allow for X" policy that an approval can write.
 */
export interface ProposedAction {
  tool: string;
  args: ActionArgs;
  reason?: string;
  /** Sends/writes to an external account. */
  actsExternally: boolean;
  /** Reads sensitive/private data. */
  touchesSensitive: boolean;
  /** Arguments derived from untrusted input. */
  readsUntrusted: boolean;
  /** Names of the untrusted-derived args (extra scrutiny in the preview). */
  untrustedArgs?: string[];
  /** Explicit risk; inferred when omitted. */
  risk?: RiskLevel;
  /** Coarse class for policy scoping, e.g. "email_send". */
  actionClass?: string;
  /** Counterparty, for "always allow for this contact". */
  contact?: string;
}

export type GateDecision = "allow" | "needs_approval" | "deny";
export type GateTier = "autonomous" | "gated";

export interface GateResult {
  decision: GateDecision;
  tier: GateTier;
  reason: string;
  /** Present when decision === "needs_approval". */
  requestId?: string;
  /** Present when a standing policy decided it. */
  policyId?: string;
}
