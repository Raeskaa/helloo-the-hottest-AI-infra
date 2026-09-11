import { relations, sql } from "drizzle-orm";
import { pgTable, text, integer, boolean, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { hello } from "./membrane";

/**
 * People graph (v1 People / entity resolution, Q17) — the contacts helloo knows and the many
 * surfaces each person shows up on. `person` is the canonical entity; `person_identity` is one
 * (channel, value) it resolves to — an email, a Slack/Telegram handle, a phone number. Unifying
 * "Manish" across WhatsApp + emails + phones = several `person_identity` rows pointing at one
 * `person`. Tenancy is enforced below the model by RLS (owner_id), same as the membrane.
 */

/** Arbitrary per-person metadata (e.g. legacy provenance, is_self flags, notes). */
export type PersonMeta = Record<string, unknown>;

/** A canonical person/contact the user knows. One row per real person, per owner. */
export const person = pgTable(
  "person",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    helloId: text("hello_id")
      .notNull()
      .references(() => hello.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("person"),
    /** Human-facing name. */
    displayName: text("display_name").notNull(),
    /** Lowercased/trimmed name used for matching + dedup. */
    norm: text("norm").notNull(),
    /** True for the user themselves. */
    isSelf: boolean("is_self").notNull().default(false),
    /** How often this person has been referenced (carried from legacy, grown by extraction). */
    mentions: integer("mentions").notNull().default(0),
    firstSeen: timestamp("first_seen", { withTimezone: true }).defaultNow().notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    meta: jsonb("meta").$type<PersonMeta>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // One canonical person per normalized name per owner — makes import + resolution idempotent.
    uniqueIndex("person_owner_norm_uidx").on(t.ownerId, t.norm),
    index("person_hello_idx").on(t.helloId),
  ],
);

/** One surface a person is reachable/known on: (channel, value) -> person. The resolution edges. */
export const personIdentity = pgTable(
  "person_identity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    helloId: text("hello_id")
      .notNull()
      .references(() => hello.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    /** e.g. "email", "telegram", "slack", "phone", "whatsapp". */
    channel: text("channel").notNull(),
    /** Raw handle/address/number as seen. */
    value: text("value").notNull(),
    /** Normalized form used for matching + dedup. */
    norm: text("norm").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // The same identity resolves to at most one person per owner.
    uniqueIndex("person_identity_owner_channel_norm_uidx").on(t.ownerId, t.channel, t.norm),
    index("person_identity_person_idx").on(t.personId),
  ],
);

export const personRelations = relations(person, ({ one, many }) => ({
  owner: one(user, { fields: [person.ownerId], references: [user.id] }),
  hello: one(hello, { fields: [person.helloId], references: [hello.id] }),
  identities: many(personIdentity),
}));

export const personIdentityRelations = relations(personIdentity, ({ one }) => ({
  person: one(person, { fields: [personIdentity.personId], references: [person.id] }),
}));
