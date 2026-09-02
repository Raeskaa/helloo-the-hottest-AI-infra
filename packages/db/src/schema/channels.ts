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
