import { recentEvents } from "@helloo/db";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Recent operational events for the user (workflow fires, reminders, tool/turn errors). */
export async function GET(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const events = await recentEvents(appEnv().DATABASE_URL, owner, 50);
  return Response.json({ events });
}
