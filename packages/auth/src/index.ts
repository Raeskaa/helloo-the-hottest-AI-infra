import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, magicLink, organization } from "better-auth/plugins";
import { getDb } from "@helloo/db";
import type { AppEnv } from "@helloo/core";
import { sendEmail } from "./email";

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
 * One helloo = one verified identity. Passwordless: email OTP + magic link +
 * social. The organization plugin backs the (later) Slack-style workspaces.
 * Users are stored in our own Postgres — the user is ours, not a vendor's.
 */
export function createAuth(env: AppEnv) {
  const db = getDb(env.DATABASE_URL);

  return betterAuth({
    appName: "helloo",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg" }),

    emailAndPassword: { enabled: false },
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
      organization(),
    ],

    trustedOrigins: [env.BETTER_AUTH_URL],
  });
}

export type Auth = ReturnType<typeof createAuth>;
