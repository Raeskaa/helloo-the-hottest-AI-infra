import { and, desc, eq } from "drizzle-orm";
import { permissionRequest } from "@helloo/db/schema";
import { ensureHello, withTenant } from "@helloo/db";
import type { AppEnv } from "@helloo/core";
import type { PermissionRequest, PolicyScope } from "./types";
import { writePolicy } from "./policy";
import { appendTrustAudit } from "./audit";

/** The Approvals inbox: consequential actions awaiting a decision, newest first. */
export async function listOpenApprovals(
  env: AppEnv,
  ownerId: string,
): Promise<PermissionRequest[]> {
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const helloId = await ensureHello(tx, ownerId);
    return tx
      .select()
      .from(permissionRequest)
      .where(and(eq(permissionRequest.helloId, helloId), eq(permissionRequest.status, "open")))
      .orderBy(desc(permissionRequest.createdAt));
  });
}

export type RememberScope = "once" | "always_for";

export interface DecideInput {
  decision: "allow" | "deny";
  reviewer?: string;
  rationale?: string;
  /** "always_for" writes a standing policy so this ask never repeats. */
  rememberScope?: RememberScope;
}

export interface DecideResult {
  request: PermissionRequest;
  policyWritten: boolean;
}

/**
 * Record a human decision on one open request: update the queue row, append the immutable
 * permission_decision event (keyed by request id → replayable handshake), and optionally
 * write the "always allow for X" policy.
 */
export async function decide(
  env: AppEnv,
  ownerId: string,
  requestId: string,
  input: DecideInput,
): Promise<DecideResult> {
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const helloId = await ensureHello(tx, ownerId);
    const found = await tx
      .select()
      .from(permissionRequest)
      .where(and(eq(permissionRequest.id, requestId), eq(permissionRequest.helloId, helloId)))
      .limit(1);
    const req = found[0];
    if (!req) throw new Error("decide: request not found");
    if (req.status !== "open") throw new Error(`decide: request already ${req.status}`);

    const status = input.decision === "allow" ? "allowed" : "denied";
    const updatedRows = await tx
      .update(permissionRequest)
      .set({
        status,
        reviewer: input.reviewer,
        rationale: input.rationale,
        decidedAt: new Date(),
      })
      .where(eq(permissionRequest.id, requestId))
      .returning();
    const updated = updatedRows[0] ?? req;

    await appendTrustAudit(tx, ownerId, helloId, "permission_decision", {
      requestId,
      decision: input.decision,
      reviewer: input.reviewer ?? null,
      rememberScope: input.rememberScope ?? "once",
    });

    let policyWritten = false;
    if (input.decision === "allow" && input.rememberScope === "always_for") {
      const scope: PolicyScope = req.contact ? { contact: req.contact } : { tool: req.tool };
      await writePolicy(tx, ownerId, helloId, scope, "allow", requestId);
      policyWritten = true;
    }

    return { request: updated, policyWritten };
  });
}
