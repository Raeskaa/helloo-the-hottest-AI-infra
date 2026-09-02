import { z } from "zod";

/** A normalized inbound channel message (SYSTEM-MAP §"Channel adapters"). */
export interface InboundMessage {
  chatId: string;
  text: string;
  /** The payload after `/start ` when the user opens a deep link, else null. */
  startPayload: string | null;
}

// Telegram sends untrusted JSON — validate it, never trust its shape.
const updateSchema = z.object({
  message: z
    .object({
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
      text: z.string().optional(),
    })
    .optional(),
});

/** Parse a Telegram webhook update into a normalized message, or null if it isn't a text message. */
export function parseTelegramUpdate(update: unknown): InboundMessage | null {
  const parsed = updateSchema.safeParse(update);
  if (!parsed.success) return null;
  const message = parsed.data.message;
  const text = message?.text;
  if (!message || !text) return null;
  const chatId = String(message.chat.id);
  const start = /^\/start(?:\s+(\S+))?/.exec(text);
  return { chatId, text, startPayload: start ? (start[1] ?? "") : null };
}

/** Send a text reply to a Telegram chat. Returns whether Telegram accepted it. */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return res.ok;
}
