import type { AppEnv } from "@helloo/core";

/**
 * Send an SMS via Twilio. Dev fallback: with no TWILIO_ACCOUNT_SID set, the
 * message is logged to the console so phone OTP sign-in still works locally
 * without any SMS provider configured (mirrors sendEmail).
 */
export async function sendSms(
  env: AppEnv,
  msg: { to: string; body: string },
): Promise<void> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) {
    console.log(`\n[sms:dev] to=${msg.to}\n${msg.body}\n`);
    return;
  }
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: msg.to, From: env.TWILIO_FROM, Body: msg.body }),
    },
  );
  if (!res.ok) {
    throw new Error(`sms send failed: ${res.status} ${await res.text()}`);
  }
}
