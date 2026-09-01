import { Composio } from "@composio/core";
import type { AppEnv } from "@helloo/core";

/**
 * Composio client (integrations / tool execution — SYSTEM-MAP §"Integrations"). We pass the
 * helloo `ownerId` straight through as Composio's external user id, so a user's connected
 * accounts and tool executions are scoped to them.
 */
export function composioClient(env: AppEnv): Composio {
  if (!env.COMPOSIO_API_KEY) {
    throw new Error("COMPOSIO_API_KEY is required for integrations");
  }
  return new Composio({ apiKey: env.COMPOSIO_API_KEY });
}
