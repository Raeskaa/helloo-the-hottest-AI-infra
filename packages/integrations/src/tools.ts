import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import type { ToolSet } from "ai";
import type { AppEnv } from "@helloo/core";
import { composioUserId } from "./composio";

/**
 * A curated, high-value subset of each toolkit's actions — kept small so the model's context
 * stays focused. Reads and writes both; the agent gates writes. Extend this map to add tools.
 */
const CURATED: Record<string, string[]> = {
  gmail: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"],
  googlecalendar: ["GOOGLECALENDAR_EVENTS_LIST", "GOOGLECALENDAR_CREATE_EVENT"],
  slack: ["SLACK_SEND_MESSAGE"],
  googletasks: ["GOOGLETASKS_LIST_TASKS", "GOOGLETASKS_INSERT_TASK"],
};

/** Tool slugs that write/act externally (vs read). The agent routes these through the gate. */
export function isWriteTool(slug: string): boolean {
  return /(SEND|CREATE|UPDATE|DELETE|ADD|POST|REPLY|REMOVE|INSERT|MOVE|PATCH|TRASH|WRITE)/i.test(slug);
}

/**
 * Composio tools in AI-SDK format (correct schemas + a Composio executor) for the toolkits the
 * user has connected. The agent wraps each `execute` with the trust gate.
 */
export async function getComposioAiTools(
  env: AppEnv,
  ownerId: string,
  toolkits: string[],
): Promise<ToolSet> {
  const slugs = toolkits.flatMap((t) => CURATED[t] ?? []);
  if (slugs.length === 0 || !env.COMPOSIO_API_KEY) return {};
  const composio = new Composio({ apiKey: env.COMPOSIO_API_KEY, provider: new VercelProvider() });
  const userId = await composioUserId(env, ownerId);
  return composio.tools.get(userId, { tools: slugs });
}
