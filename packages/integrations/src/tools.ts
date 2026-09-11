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
  gmail: [
    "GMAIL_FETCH_EMAILS", // read: list/search the inbox (supports a query)
    "GMAIL_FETCH_MESSAGE_BY_THREAD_ID", // read: pull a full thread before replying
    "GMAIL_SEND_EMAIL", // write: new email (irreversible)
    "GMAIL_REPLY_TO_THREAD", // write: reply in-thread (irreversible)
  ],
  googlecalendar: [
    "GOOGLECALENDAR_EVENTS_LIST", // read: events in a window
    "GOOGLECALENDAR_FIND_FREE_SLOTS", // read: when is the user free
    "GOOGLECALENDAR_CREATE_EVENT", // write: add an event
    "GOOGLECALENDAR_UPDATE_EVENT", // write: change an event
    "GOOGLECALENDAR_DELETE_EVENT", // write: remove an event (irreversible)
  ],
  slack: [
    "SLACK_FIND_CHANNELS", // read: resolve a channel name -> id
    "SLACK_FIND_USERS", // read: resolve a person -> id
    "SLACK_FETCH_CONVERSATION_HISTORY", // read: recent messages in a channel
    "SLACK_SEARCH_MESSAGES", // read: search across the workspace
    "SLACK_SEND_MESSAGE", // write: post a message
  ],
  googletasks: [
    "GOOGLETASKS_LIST_TASKS", // read
    "GOOGLETASKS_INSERT_TASK", // write: add a task
  ],
};

/** Human-facing labels for the toolkits helloo supports (used in the connect menu). */
export const TOOLKIT_LABELS: Record<string, string> = {
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  slack: "Slack",
  googletasks: "Google Tasks",
};

/** The toolkits helloo has curated tools for — the menu of what a user can connect. */
export const SUPPORTED_TOOLKITS: string[] = Object.keys(CURATED);

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
