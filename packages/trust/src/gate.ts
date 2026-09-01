import { permissionRequest } from "@helloo/db/schema";
import { ensureHello, withTenant } from "@helloo/db";
import type { AppEnv } from "@helloo/core";
import type { GateResult, ProposedAction, RiskLevel } from "./types";
import { matchPolicy } from "./policy";
import { appendTrustAudit } from "./audit";

function inferRisk(a: ProposedAction): RiskLevel {
  if (a.risk) return a.risk;
  return a.actsExternally ? "high" : "low";
}

/**
 * Rule of Two + action tiers (HUB-TRUST): an action needs a human gate if it holds all three
 * of the trifecta, OR it acts externally, OR it is high/irreversible risk. Read-only / internal
 * / reversible actions run autonomously (logged, not gated) — the anti-approval-fatigue rule.
 */
export function requiresGate(a: ProposedAction): boolean {
  const trifecta =
    Number(a.actsExternally) + Number(a.touchesSensitive) + Number(a.readsUntrusted);
  const risk = inferRisk(a);
  return trifecta >= 3 || a.actsExternally || risk === "high" || risk === "irreversible";
}

/**
 * The gate every acting feature calls before doing anything. Autonomous actions are allowed and
 * logged; gated actions are allowed only by a standing policy, else they raise an approval
 * request (the approve-before-act handshake, keyed by request id).
 */
export async function gate(
  env: AppEnv,
  ownerId: string,
  action: ProposedAction,
): Promise<GateResult> {
  const risk = inferRisk(action);

  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const helloId = await ensureHello(tx, ownerId);

    if (!requiresGate(action)) {
      await appendTrustAudit(tx, ownerId, helloId, "tool_call", {
        tool: action.tool,
        args: action.args,
        tier: "autonomous",
      });
      return {
        decision: "allow",
        tier: "autonomous",
        reason: "autonomous tier (read-only / internal / reversible)",
      };
    }

    const match = await matchPolicy(tx, helloId, action);
    if (match) {
      await appendTrustAudit(tx, ownerId, helloId, "permission_decision", {
        tool: action.tool,
        decision: match.effect,
        via: "policy",
        policyId: match.id,
      });
      return {
        decision: match.effect === "deny" ? "deny" : "allow",
        tier: "gated",
        reason: match.effect === "deny" ? "denied by standing policy" : "allowed by standing policy",
        policyId: match.id,
      };
    }

    const inserted = await tx
      .insert(permissionRequest)
      .values({
        ownerId,
        helloId,
        tool: action.tool,
        actionClass: action.actionClass,
        contact: action.contact,
        args: action.args,
        risk,
        reason: action.reason,
        untrustedArgs: action.untrustedArgs ?? [],
      })
      .returning();
    const req = inserted[0];
    if (!req) throw new Error("gate: failed to create permission_request");

    await appendTrustAudit(tx, ownerId, helloId, "permission_request", {
      requestId: req.id,
      tool: action.tool,
      risk,
    });
    return { decision: "needs_approval", tier: "gated", reason: "awaiting approval", requestId: req.id };
  });
}
