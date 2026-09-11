import { and, asc, eq } from "drizzle-orm";
import { getDb, withTenant, ensureHello } from "@helloo/db";
import { workflow } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";

/**
 * Event-triggered workflows. Writes go through `withTenant` (RLS); the cron reads active workflows
 * across tenants on the owner connection (bypasses RLS) and fires them. v1 trigger = new Gmail.
 */

export interface CreateWorkflowInput {
  name: string;
  matchFrom?: string;
  matchSubject?: string;
  instruction: string;
  channel?: string;
}
export interface WorkflowRow {
  id: string;
  name: string;
  triggerType: string;
  matchFrom: string | null;
  matchSubject: string | null;
  instruction: string;
  channel: string;
  status: string;
}
/** An active workflow as the cron sees it (no tenant context). */
export interface ActiveWorkflow extends WorkflowRow {
  ownerId: string;
  lastSeenId: string | null;
}

export async function createWorkflow(
  env: AppEnv,
  ownerId: string,
  input: CreateWorkflowInput,
): Promise<{ id: string }> {
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const helloId = await ensureHello(tx, ownerId);
    const rows = await tx
      .insert(workflow)
      .values({
        ownerId,
        helloId,
        name: input.name,
        triggerType: "email",
        matchFrom: input.matchFrom && input.matchFrom.length > 0 ? input.matchFrom : null,
        matchSubject: input.matchSubject && input.matchSubject.length > 0 ? input.matchSubject : null,
        instruction: input.instruction,
        channel: input.channel ?? "telegram",
      })
      .returning({ id: workflow.id });
    const row = rows[0];
    if (!row) throw new Error("failed to create workflow");
    return { id: row.id };
  });
}

export async function listWorkflows(env: AppEnv, ownerId: string): Promise<WorkflowRow[]> {
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    return tx
      .select({
        id: workflow.id,
        name: workflow.name,
        triggerType: workflow.triggerType,
        matchFrom: workflow.matchFrom,
        matchSubject: workflow.matchSubject,
        instruction: workflow.instruction,
        channel: workflow.channel,
        status: workflow.status,
      })
      .from(workflow)
      .orderBy(asc(workflow.createdAt));
  });
}

/** Delete (or, with pause, deactivate) a workflow the owner owns. Returns whether a row changed. */
export async function deleteWorkflow(env: AppEnv, ownerId: string, id: string): Promise<boolean> {
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const rows = await tx.delete(workflow).where(eq(workflow.id, id)).returning({ id: workflow.id });
    return rows.length > 0;
  });
}

/** All active email-triggered workflows across tenants (cron scan, owner connection). */
export async function activeEmailWorkflows(env: AppEnv): Promise<ActiveWorkflow[]> {
  return getDb(env.DATABASE_URL)
    .select({
      id: workflow.id,
      ownerId: workflow.ownerId,
      name: workflow.name,
      triggerType: workflow.triggerType,
      matchFrom: workflow.matchFrom,
      matchSubject: workflow.matchSubject,
      instruction: workflow.instruction,
      channel: workflow.channel,
      status: workflow.status,
      lastSeenId: workflow.lastSeenId,
    })
    .from(workflow)
    .where(and(eq(workflow.status, "active"), eq(workflow.triggerType, "email")));
}

/** Record the newest handled message id (dedup baseline / advance). */
export async function markWorkflowSeen(env: AppEnv, id: string, lastSeenId: string): Promise<void> {
  await getDb(env.DATABASE_URL)
    .update(workflow)
    .set({ lastSeenId, updatedAt: new Date() })
    .where(eq(workflow.id, id));
}
