import { initiateConnection } from "@helloo/integrations";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";
import { jsonBody } from "@/lib/req";

export const dynamic = "force-dynamic";

/** Start connecting a toolkit: { toolkit } -> { redirectUrl } the user opens to authorize. */
export async function POST(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const body = await jsonBody(req);
  const toolkit = typeof body.toolkit === "string" ? body.toolkit : "";
  if (!toolkit) return Response.json({ error: "toolkit required" }, { status: 400 });
  const link = await initiateConnection(appEnv(), owner, toolkit);
  return Response.json({ redirectUrl: link.redirectUrl });
}
