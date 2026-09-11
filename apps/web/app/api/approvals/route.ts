import { listOpenApprovals } from "@helloo/trust";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const requests = await listOpenApprovals(appEnv(), owner);
  return Response.json({ requests });
}
