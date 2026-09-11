import { listMemory } from "@helloo/memory";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The membrane view: how many memories are private vs shared/org, and the non-private ones listed. */
export async function GET(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const atoms = await listMemory(appEnv(), owner);
  const counts = { private: 0, shared: 0, org: 0 };
  const exposed: Array<{ id: string; text: string; visibility: string }> = [];
  for (const a of atoms) {
    const v = a.visibility;
    if (v === "shared" || v === "org") {
      counts[v] += 1;
      exposed.push({ id: a.id, text: a.factText, visibility: v });
    } else {
      counts.private += 1;
    }
  }
  return Response.json({ counts, exposed });
}
