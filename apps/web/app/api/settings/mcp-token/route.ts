import { createMcpToken } from "@helloo/channels";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Mint an MCP token → the URL to add helloo to Claude/ChatGPT. */
export async function POST(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const token = await createMcpToken(appEnv(), owner, "web");
  // The MCP endpoint is served by the API worker (shared Neon → the token works there).
  return Response.json({ url: `https://helloo-api.getyourbumb.workers.dev/api/mcp/${token}` });
}
