import { listMemory, recall } from "@helloo/memory";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The caller's current beliefs, or semantic recall with ?q=… */
export async function GET(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const env = appEnv();
  const q = new URL(req.url).searchParams.get("q");
  if (q && q.trim().length > 0) {
    const hits = await recall(env, owner, q, 20);
    const items = hits.map((h) => ({
      id: h.atom.id,
      text: h.atom.factText,
      predicate: h.atom.predicate,
      visibility: h.atom.visibility,
      score: h.score,
      createdAt: h.atom.createdAt,
    }));
    return Response.json({ items });
  }
  const atoms = await listMemory(env, owner);
  const items = atoms.map((a) => ({
    id: a.id,
    text: a.factText,
    predicate: a.predicate,
    visibility: a.visibility,
    createdAt: a.createdAt,
  }));
  return Response.json({ items });
}
