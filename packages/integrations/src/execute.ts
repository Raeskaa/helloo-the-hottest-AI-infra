import type { AppEnv } from "@helloo/core";
import { composioClient, composioUserId } from "./composio";
import { defaultAccountId } from "./connections";

export interface ToolResult {
  successful: boolean;
  data: unknown;
  error: string | null;
}

/** The toolkit slug a tool belongs to (e.g. GMAIL_SEND_EMAIL -> "gmail"). */
function toolkitOf(slug: string): string {
  const head = slug.split("_")[0];
  return head ? head.toLowerCase() : slug.toLowerCase();
}

/**
 * Execute a Composio tool action for a user. Used both for autonomous reads and (after the trust
 * gate allows it) for writes. Routes to the toolkit's DEFAULT connected account when the user has
 * several of the same kind (e.g. multiple Google accounts); falls back to Composio's own resolution
 * when there's no tracked default. Manual execution needs the tool's version, so we look it up.
 */
export async function executeAction(
  env: AppEnv,
  ownerId: string,
  slug: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const composio = composioClient(env);
  const tool = await composio.tools.getRawComposioToolBySlug(slug);
  const accountId = await defaultAccountId(env, ownerId, toolkitOf(slug)).catch((): null => null);
  const res = await composio.tools.execute(slug, {
    userId: await composioUserId(env, ownerId),
    arguments: args,
    version: tool.version,
    ...(accountId ? { connectedAccountId: accountId } : {}),
  });
  return { successful: res.successful, data: res.data, error: res.error };
}
