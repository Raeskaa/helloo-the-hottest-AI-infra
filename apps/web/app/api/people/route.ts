import { listPeople, findPeople } from "@helloo/memory";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The user's contacts (or search with ?q=…). */
export async function GET(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const env = appEnv();
  const q = new URL(req.url).searchParams.get("q");
  const people = q && q.trim().length > 0 ? await findPeople(env, owner, q, 30) : await listPeople(env, owner, 100);
  return Response.json({ people });
}
