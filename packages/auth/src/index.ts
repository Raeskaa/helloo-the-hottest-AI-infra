import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, emailOTP, magicLink, organization, phoneNumber } from "better-auth/plugins";
import { getDb } from "@helloo/db";
import type { AppEnv } from "@helloo/core";
import { sendEmail } from "./email";
import { sendSms } from "./sms";

/** Build the enabled social providers from whatever keys are present. */
function socialProviders(env: AppEnv) {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    providers.apple = { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET };
  }
  return providers;
}

/**
 * One helloo = one verified identity. Sign-in methods: email OTP + magic link
 * + social, plus phone OTP (SMS) and email+password for the medikle apps. The
 * bearer plugin issues token sessions for native (RN) clients; the organization
 * plugin backs the family/workspace membrane. Users are stored in our own
 * Postgres — the user is ours, not a vendor's.
 */
export function createAuth(env: AppEnv) {
  const db = getDb(env.DATABASE_URL);

  return betterAuth({
    appName: "helloo",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg" }),

    emailAndPassword: { enabled: true },
    socialProviders: socialProviders(env),

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh once/day
    },

    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 60 * 10, // 10 min
        async sendVerificationOTP({ email, otp }) {
          await sendEmail(env, {
            to: email,
            subject: `Your helloo code: ${otp}`,
            html: `<p>Your helloo sign-in code is <b style="font-size:20px">${otp}</b>. It expires in 10 minutes.</p>`,
          });
        },
      }),
      magicLink({
        async sendMagicLink({ email, url }) {
          await sendEmail(env, {
            to: email,
            subject: "Sign in to helloo",
            html: `<p><a href="${url}">Click here to sign in to helloo</a>. This link expires shortly.</p>`,
          });
        },
      }),
      // Phone OTP (SMS) — the family-identity path for the medikle apps. A
      // phone-only user still needs the required unique email on `user`, so we
      // mint a stable placeholder at verification (they can add a real email
      // later). SMS via Twilio; dev falls back to console (see sms.ts).
      phoneNumber({
        otpLength: 6,
        expiresIn: 60 * 10, // 10 min
        async sendOTP({ phoneNumber: to, code }) {
          await sendSms(env, { to, body: `Your helloo code is ${code}. It expires in 10 minutes.` });
        },
        signUpOnVerification: {
          getTempEmail: (phone) => `${phone.replace(/[^0-9]/g, "")}@phone.helloo.local`,
          getTempName: (phone) => phone,
        },
      }),
      // Token sessions for native (React Native) clients: exposes the session
      // token via `set-auth-token` and accepts `Authorization: Bearer`.
      bearer(),
      organization(),
    ],

    trustedOrigins: [env.BETTER_AUTH_URL],
  });
}

export type Auth = ReturnType<typeof createAuth>;
