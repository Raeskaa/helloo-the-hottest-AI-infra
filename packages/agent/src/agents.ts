import { asc, eq } from "drizzle-orm";
import { agent } from "@helloo/db/schema";
import { withTenant, ensureHello } from "@helloo/db";
import type { AppEnv } from "@helloo/core";

/**
 * User-defined agents (v2 "make an agent"): named personas the user creates that the main helloo can
 * delegate to. CRUD is tenant-scoped (withTenant/RLS). The runtime uses `getAgentByName` to load a
 * persona + toolkit scope and run it as a sub-agent (see converse's helloo_ask_agent).
 */

export interface CreateAgentInput {
  name: string;
  description?: string;
  persona: string;
  toolkits?: string[];
}
export interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  persona: string;
  toolkits: string[] | null;
  status: string;
}

export async function createAgent(env: AppEnv, ownerId: string, input: CreateAgentInput): Promise<{ id: string }> {
  const norm = input.name.toLowerCase().trim();
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const helloId = await ensureHello(tx, ownerId);
    const rows = await tx
      .insert(agent)
      .values({
        ownerId,
        helloId,
        name: input.name,
        norm,
        description: input.description ?? null,
        persona: input.persona,
        toolkits: input.toolkits && input.toolkits.length > 0 ? input.toolkits : null,
      })
      .onConflictDoUpdate({
        target: [agent.ownerId, agent.norm],
        set: {
          name: input.name,
          description: input.description ?? null,
          persona: input.persona,
          toolkits: input.toolkits && input.toolkits.length > 0 ? input.toolkits : null,
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning({ id: agent.id });
    const row = rows[0];
    if (!row) throw new Error("failed to create agent");
    return { id: row.id };
  });
}

export async function listAgents(env: AppEnv, ownerId: string): Promise<AgentRow[]> {
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    return tx
      .select({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        persona: agent.persona,
        toolkits: agent.toolkits,
        status: agent.status,
      })
      .from(agent)
      .where(eq(agent.status, "active"))
      .orderBy(asc(agent.createdAt));
  });
}

export async function getAgentByName(env: AppEnv, ownerId: string, name: string): Promise<AgentRow | null> {
  const norm = name.toLowerCase().trim();
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const rows = await tx
      .select({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        persona: agent.persona,
        toolkits: agent.toolkits,
        status: agent.status,
      })
      .from(agent)
      .where(eq(agent.norm, norm))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function deleteAgent(env: AppEnv, ownerId: string, name: string): Promise<boolean> {
  const norm = name.toLowerCase().trim();
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const rows = await tx.delete(agent).where(eq(agent.norm, norm)).returning({ id: agent.id });
    return rows.length > 0;
  });
}
