import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { schema } from "@helloo/db";
import type { AppEnv } from "@helloo/core";
import type { ProposedAction } from "./types";
import { gate } from "./gate";
import { listOpenApprovals, decide } from "./approvals";

export interface TrustSelfTestResult {
  readTier: string;
  readDecision: string;
  send1Decision: string;
  openAfterSend: number;
  policyWritten: boolean;
  openAfterDecision: number;
  send2Decision: string;
  send2ViaPolicy: boolean;
}

/**
 * Proves the approve-before-act handshake over the WS path: a read runs autonomously; an
 * external send raises an approval; approving with "always_for" writes a policy; the same send
 * is then auto-allowed by that policy. Creates + cleans up a throwaway user.
 */
export async function trustSelfTest(env: AppEnv): Promise<TrustSelfTestResult> {
  const ownerA = `selftest-${crypto.randomUUID()}`;
  const setupPool = new Pool({ connectionString: env.DATABASE_URL });

  const sendAction: ProposedAction = {
    tool: "gmail.send",
    args: { to: "priya@example.com", subject: "hi", body: "confirming Tuesday" },
    actsExternally: true,
    touchesSensitive: false,
    readsUntrusted: false,
    actionClass: "email_send",
    contact: "priya@example.com",
    reason: "confirm the meeting",
  };

  try {
    const sdb = drizzle(setupPool, { schema });
    await sdb.insert(schema.user).values({
      id: ownerA,
      name: "trust-selftest",
      email: `${ownerA}@selftest.local`,
      emailVerified: false,
    });

    try {
      const read = await gate(env, ownerA, {
        tool: "calendar.read",
        args: {},
        actsExternally: false,
        touchesSensitive: true,
        readsUntrusted: false,
      });

      const send1 = await gate(env, ownerA, sendAction);
      const openAfterSend = (await listOpenApprovals(env, ownerA)).length;

      if (!send1.requestId) throw new Error("expected an approval request for the external send");
      const decision = await decide(env, ownerA, send1.requestId, {
        decision: "allow",
        reviewer: "owner",
        rememberScope: "always_for",
      });
      const openAfterDecision = (await listOpenApprovals(env, ownerA)).length;

      const send2 = await gate(env, ownerA, sendAction);

      return {
        readTier: read.tier,
        readDecision: read.decision,
        send1Decision: send1.decision,
        openAfterSend,
        policyWritten: decision.policyWritten,
        openAfterDecision,
        send2Decision: send2.decision,
        send2ViaPolicy: Boolean(send2.policyId),
      };
    } finally {
      await sdb.delete(schema.user).where(eq(schema.user.id, ownerA));
    }
  } finally {
    await setupPool.end();
  }
}
