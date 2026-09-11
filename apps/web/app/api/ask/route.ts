import { converse, type HistoryMessage } from "@helloo/agent";
import { ingestText } from "@helloo/memory";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";
import { jsonBody } from "@/lib/req";

export const dynamic = "force-dynamic";

function toHistory(v: unknown): HistoryMessage[] {
  if (!Array.isArray(v)) return [];
  const out: HistoryMessage[] = [];
  for (const m of v) {
    if (m === null || typeof m !== "object") continue;
    const role = "role" in m && (m.role === "user" || m.role === "assistant") ? m.role : null;
    const text = "text" in m && typeof m.text === "string" ? m.text : null;
    if (role && text) out.push({ role, text });
  }
  return out.slice(-8);
}

/** One agent turn: { message, history? } -> { reply, pendingApprovals }. Writes are gated. */
export async function POST(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const body = await jsonBody(req);
  const message = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) return Response.json({ error: "message required" }, { status: 400 });
  const env = appEnv();
  const result = await converse(env, owner, message, { history: toHistory(body.history) });
  void ingestText(env, owner, message).catch(() => {});
  return Response.json({ reply: result.reply, pendingApprovals: result.pendingApprovals.length });
}
