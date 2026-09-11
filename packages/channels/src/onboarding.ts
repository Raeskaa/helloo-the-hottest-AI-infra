import { and, eq } from "drizzle-orm";
import { getDb } from "@helloo/db";
import { channelOnboarding, channelLink } from "@helloo/db/schema";
import type { AppEnv } from "@helloo/core";

/**
 * Channel onboarding state machine (pre-auth). Lets a brand-new user sign up from inside a channel:
 * ask email → send OTP → verify → create the account + a confirmed `channel_link`. Read/written via
 * the owner connection (no RLS — there is no owner yet), like the other identity tables.
 */

export type OnboardingStage = "awaiting_email" | "awaiting_otp";
export interface OnboardingState {
  stage: OnboardingStage;
  email: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_RE = /^\s*(\d{6})\s*$/;

/** True if the text is a plausible email address. */
export function looksLikeEmail(text: string): boolean {
  return EMAIL_RE.test(text.trim());
}
/** Extract a 6-digit OTP from the text, or null. */
export function extractOtp(text: string): string | null {
  const m = OTP_RE.exec(text);
  return m?.[1] ?? null;
}

function toStage(v: string): OnboardingStage {
  return v === "awaiting_otp" ? "awaiting_otp" : "awaiting_email";
}

/** Current onboarding state for a chat, or null if none in progress. */
export async function getOnboarding(
  env: AppEnv,
  channel: string,
  externalId: string,
): Promise<OnboardingState | null> {
  const rows = await getDb(env.DATABASE_URL)
    .select({ stage: channelOnboarding.stage, email: channelOnboarding.email })
    .from(channelOnboarding)
    .where(and(eq(channelOnboarding.channel, channel), eq(channelOnboarding.externalId, externalId)))
    .limit(1);
  const row = rows[0];
  return row ? { stage: toStage(row.stage), email: row.email } : null;
}

/** Begin onboarding: record that we're waiting for the user's email. */
export async function startOnboarding(env: AppEnv, channel: string, externalId: string): Promise<void> {
  await getDb(env.DATABASE_URL)
    .insert(channelOnboarding)
    .values({ channel, externalId, stage: "awaiting_email", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [channelOnboarding.channel, channelOnboarding.externalId],
      set: { stage: "awaiting_email", email: null, updatedAt: new Date() },
    });
}

/** Advance to awaiting the OTP, storing the email it was sent to. */
export async function setAwaitingOtp(
  env: AppEnv,
  channel: string,
  externalId: string,
  email: string,
): Promise<void> {
  await getDb(env.DATABASE_URL)
    .insert(channelOnboarding)
    .values({ channel, externalId, stage: "awaiting_otp", email, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [channelOnboarding.channel, channelOnboarding.externalId],
      set: { stage: "awaiting_otp", email, updatedAt: new Date() },
    });
}

/** Onboarding done (or abandoned): drop the state row. */
export async function clearOnboarding(env: AppEnv, channel: string, externalId: string): Promise<void> {
  await getDb(env.DATABASE_URL)
    .delete(channelOnboarding)
    .where(and(eq(channelOnboarding.channel, channel), eq(channelOnboarding.externalId, externalId)));
}

/** Bind a chat to an owner as a confirmed link (used after OTP verification). */
export async function bindChannel(
  env: AppEnv,
  channel: string,
  ownerId: string,
  externalId: string,
): Promise<void> {
  await getDb(env.DATABASE_URL)
    .insert(channelLink)
    .values({ ownerId, channel, externalId, linkCode: null })
    .onConflictDoNothing();
}
