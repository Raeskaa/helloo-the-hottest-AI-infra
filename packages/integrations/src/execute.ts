import type { AppEnv } from "@helloo/core";
import { composioClient } from "./composio";

export interface ToolResult {
  successful: boolean;
  data: unknown;
  error: string | null;
}

/**
 * Execute a Composio tool action for a user. Called ONLY after the trust gate allows it —
 * this is the real side effect on the user's account. Manual execution requires the tool's
 * specific toolkit version, so we look it up (it changes rarely).
 */
export async function executeAction(
  env: AppEnv,
  ownerId: string,
  slug: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const composio = composioClient(env);
  const tool = await composio.tools.getRawComposioToolBySlug(slug);
  const res = await composio.tools.execute(slug, {
    userId: ownerId,
    arguments: args,
    version: tool.version,
  });
  return { successful: res.successful, data: res.data, error: res.error };
}
