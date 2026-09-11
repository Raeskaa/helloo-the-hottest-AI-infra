import { and, eq } from "drizzle-orm";
import { getDb } from "@helloo/db";
import { chatSession } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";

/**
 * Short-term conversational context per channel chat — the last few turns, so follow-ups have
 * context. Stored in `chat_session` (owner connection, no RLS) now that turns run in the Worker
 * (the Durable Object was removed). The caller trims to the last N.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** Recent turns for a chat (oldest first), or []. */
export async function loadHistory(env: AppEnv, channel: string, externalId: string): Promise<ChatTurn[]> {
  const rows = await getDb(env.DATABASE_URL)
    .select({ messages: chatSession.messages })
    .from(chatSession)
    .where(and(eq(chatSession.channel, channel), eq(chatSession.externalId, externalId)))
    .limit(1);
  return rows[0]?.messages ?? [];
}

/** Replace the stored recent turns for a chat. */
export async function saveHistory(
  env: AppEnv,
  channel: string,
  externalId: string,
  ownerId: string,
  messages: ChatTurn[],
): Promise<void> {
  await getDb(env.DATABASE_URL)
    .insert(chatSession)
    .values({ channel, externalId, ownerId, messages, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [chatSession.channel, chatSession.externalId],
      set: { messages, ownerId, updatedAt: new Date() },
    });
}
