import type { AppEnv } from "@helloo/core";
import { executeAction } from "./execute";

/**
 * Pull contacts out of the user's Gmail — the senders of recent messages — as (name, email) pairs.
 * The raw feed for the people graph's auto-fill; resolution/unification happens in @helloo/memory.
 */

export interface ExtractedContact {
  name: string;
  email: string;
}

/** Parse an RFC "Display Name <addr@x>" (or a bare address) into a contact. */
function parseAddress(raw: string): ExtractedContact | null {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  if (m) {
    const email = (m[2] ?? "").trim();
    if (!email.includes("@")) return null;
    const name = (m[1] ?? "").replace(/^"|"$/g, "").trim();
    return { name, email };
  }
  const bare = raw.trim();
  return bare.includes("@") ? { name: "", email: bare } : null;
}

function messagesOf(data: unknown): unknown[] {
  if (data !== null && typeof data === "object" && "messages" in data && Array.isArray(data.messages)) {
    return data.messages;
  }
  return [];
}

/** Recent Gmail senders as unique contacts (routes to the default Gmail account). */
export async function fetchGmailContacts(
  env: AppEnv,
  ownerId: string,
  limit = 25,
): Promise<ExtractedContact[]> {
  const res = await executeAction(env, ownerId, "GMAIL_FETCH_EMAILS", { max_results: limit });
  if (!res.successful) return [];
  const byEmail = new Map<string, ExtractedContact>();
  for (const m of messagesOf(res.data)) {
    if (m === null || typeof m !== "object") continue;
    const sender = "sender" in m && typeof m.sender === "string" ? m.sender : "";
    const contact = parseAddress(sender);
    if (!contact) continue;
    const key = contact.email.toLowerCase();
    // Keep the first non-empty name we see for an address.
    const existing = byEmail.get(key);
    if (!existing || (existing.name.length === 0 && contact.name.length > 0)) {
      byEmail.set(key, contact);
    }
  }
  return [...byEmail.values()];
}
