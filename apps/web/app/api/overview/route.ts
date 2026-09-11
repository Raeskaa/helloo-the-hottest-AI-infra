import { listMemory, listPeople } from "@helloo/memory";
import { getConnections } from "@helloo/integrations";
import { listOpenApprovals } from "@helloo/trust";
import { recentEvents } from "@helloo/db";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Dashboard counts + what needs the user + recent activity. */
export async function GET(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const env = appEnv();
  const [memory, people, conn, approvals, events] = await Promise.all([
    listMemory(env, owner).then((a) => a.length).catch(() => 0),
    listPeople(env, owner, 1000).then((p) => p.length).catch(() => 0),
    getConnections(env, owner).then((c) => c.accounts.filter((a) => a.status === "ACTIVE").length).catch(() => 0),
    listOpenApprovals(env, owner).then((r) => r.length).catch(() => 0),
    recentEvents(env.DATABASE_URL, owner, 8).catch(() => []),
  ]);
  return Response.json({
    counts: { memory, people, connections: conn, approvals },
    recent: events,
  });
}
