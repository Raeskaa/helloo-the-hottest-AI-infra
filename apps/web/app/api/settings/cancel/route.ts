import { cancelReminder, deleteWorkflow } from "@helloo/scheduler";
import { deleteAgent } from "@helloo/agent";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";
import { jsonBody } from "@/lib/req";

export const dynamic = "force-dynamic";

/** Remove a standing item: { kind: "reminder"|"workflow"|"agent", id }. */
export async function POST(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const body = await jsonBody(req);
  const kind = body.kind;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const env = appEnv();
  if (kind === "reminder") return Response.json({ done: await cancelReminder(env, owner, id) });
  if (kind === "workflow") return Response.json({ done: await deleteWorkflow(env, owner, id) });
  if (kind === "agent") return Response.json({ done: await deleteAgent(env, owner, id) });
  return Response.json({ error: "unknown kind" }, { status: 400 });
}
