import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * `channel_link` — maps an external channel identity (a Telegram chat, an SMS number, …) to a
 * helloo owner, so an inbound message can be routed to the right agent. This is an identity
 * table like the auth tables: queried by the (unauthenticated) webhook via the owner connection,
 * so it carries NO RLS. A `link_code` row is created (pending) when a signed-in user starts
 * linking; the webhook confirms it, filling `external_id`.
 */
export const channelLink = pgTable(
  "channel_link",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // e.g. "telegram"
    externalId: text("external_id"), // set once confirmed (null while pending)
    linkCode: text("link_code"), // set while pending (null once confirmed)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // one owner per (channel, external identity), among confirmed links
    uniqueIndex("channel_link_identity_uidx")
      .on(t.channel, t.externalId)
      .where(sql`${t.externalId} is not null`),
    index("channel_link_code_idx").on(t.linkCode),
  ],
);

export const channelLinkRelations = relations(channelLink, ({ one }) => ({
  owner: one(user, { fields: [channelLink.ownerId], references: [user.id] }),
}));

/**
 * `composio_identity` — maps a helloo owner to the Composio external user id that holds their
 * connected accounts. Defaults to the owner id; set to a different id to reuse connections made
 * under a prior identity (e.g. a migrated account). Identity plumbing like channel_link: no RLS.
 */
export const composioIdentity = pgTable("composio_identity", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  composioUserId: text("composio_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const composioIdentityRelations = relations(composioIdentity, ({ one }) => ({
  owner: one(user, { fields: [composioIdentity.ownerId], references: [user.id] }),
}));

/**
 * `channel_onboarding` — transient state for a channel chat that has no owner yet, so a brand-new
 * user can sign up from inside the channel: ask email → send OTP → verify → create the account +
 * `channel_link`. Pre-auth (no user row exists yet), so like the identity tables it carries NO RLS
 * and is read/written by the webhook via the owner connection. A row is deleted once linked.
 */
export const channelOnboarding = pgTable(
  "channel_onboarding",
  {
    channel: text("channel").notNull(), // e.g. "telegram"
    externalId: text("external_id").notNull(), // the chat id
    stage: text("stage").notNull(), // "awaiting_email" | "awaiting_otp"
    email: text("email"), // captured once the user sends it
    attempts: text("attempts"), // reserved for rate-limiting (unused in v1)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("channel_onboarding_identity_uidx").on(t.channel, t.externalId)],
);
