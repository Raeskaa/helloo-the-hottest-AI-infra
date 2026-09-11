import { converse } from "@helloo/agent";
import { ingestText } from "@helloo/memory";
import { loadHistory, saveHistory, type ChatTurn } from "@helloo/channels";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";
import { jsonBody } from "@/lib/req";

export const dynamic = "force-dynamic";

// Web chat persists server-side (chat_session, channel "web", keyed by owner) so history survives
// refreshes and is shared across devices — mirroring the Telegram short-term memory.
const CHANNEL = "web";
const KEEP = 24; // stored turns; the last 8 are passed to the model as context.

/** Load the persisted conversation. */
export async function GET(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const messages = await loadHistory(appEnv(), CHANNEL, owner).catch((): ChatTurn[] => []);
  return Response.json({ messages });
}

/** One agent turn: { message } -> { reply, pendingApprovals }. Writes are gated; history is persisted. */
export async function POST(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const body = await jsonBody(req);
  const message = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) return Response.json({ error: "message required" }, { status: 400 });
  const env = appEnv();
  const history = await loadHistory(env, CHANNEL, owner).catch((): ChatTurn[] => []);
  const result = await converse(env, owner, message, { history: history.slice(-8) });
  const updated = [
    ...history,
    { role: "user" as const, text: message },
    { role: "assistant" as const, text: result.reply },
  ].slice(-KEEP);
  await saveHistory(env, CHANNEL, owner, owner, updated).catch(() => {});
  void ingestText(env, owner, message).catch(() => {});
  return Response.json({ reply: result.reply, pendingApprovals: result.pendingApprovals.length });
}
