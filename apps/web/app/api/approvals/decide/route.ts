import { decide } from "@helloo/trust";
import { executeAction } from "@helloo/integrations";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";
import { jsonBody } from "@/lib/req";

export const dynamic = "force-dynamic";

/** Decide one request: { id, decision: "allow"|"deny", rememberScope? }. On allow, execute for real. */
export async function POST(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const body = await jsonBody(req);
  const id = typeof body.id === "string" ? body.id : "";
  const decision = body.decision === "allow" || body.decision === "deny" ? body.decision : null;
  if (!id || !decision) return Response.json({ error: "id and decision required" }, { status: 400 });
  const rememberScope = body.rememberScope === "always_for" ? "always_for" : "once";

  const env = appEnv();
  const result = await decide(env, owner, id, { decision, rememberScope, reviewer: owner });
  if (result.request.status === "allowed") {
    const execution = await executeAction(env, owner, result.request.tool, result.request.args);
    return Response.json({ ...result, execution });
  }
  return Response.json(result);
}
