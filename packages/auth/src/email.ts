import type { AppEnv } from "@helloo/core";

/**
 * Send an email via Resend. Dev fallback: with no RESEND_API_KEY set, the
 * message is logged to the console so OTP / magic-link sign-in still works
 * locally without any email provider configured.
 */
export async function sendEmail(
  env: AppEnv,
  msg: { to: string; subject: string; html: string },
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`\n[email:dev] to=${msg.to}\nsubject=${msg.subject}\n${msg.html}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? "helloo <onboarding@resend.dev>",
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`email send failed: ${res.status} ${await res.text()}`);
  }
}
