import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  integer,
  bigserial,
  real,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Membrane record layer — ADR-0002 (Option B: versioned bi-temporal `atom` + append-only `audit`).
 * Tenant boundary (owner_id / hello_id) is enforced below the model by RLS — see `packages/db/rls.sql`.
 */

/** The membrane: who may see an atom. Enforced by RLS + recall-time filter. */
export const visibility = pgEnum("visibility", ["private", "shared", "org"]);
/** Non-destructive lifecycle: edits supersede, forgets tombstone — never erase (except GDPR shred). */
export const atomStatus = pgEnum("atom_status", ["active", "superseded", "forgotten"]);
/** Trust/action events recorded in the append-only audit log. */
export const auditKind = pgEnum("audit_kind", [
  "tool_call",
  "permission_request",
  "permission_decision",
  "termination",
]);

/** A typed fact's structured object, e.g. { value: "email" }. */
export type AtomObject = Record<string, unknown>;
/** Where a fact came from (event/source spans + who asserted it). */
export interface AtomProvenance {
  source: string;
  spans?: string[];
  assertedBy: string;
}
/** Kind-specific payload on an audit row. */
export type AuditPayload = Record<string, unknown>;

/** The tenant/runtime handle — one hello per owner in v1 (ADR-0004). Maps to the future Durable Object. */
export const hello = pgTable(
  "hello",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("hello_owner_uidx").on(t.ownerId)],
);

/**
 * `atom` — bi-temporal fact, versioned in place. Each row is one version of a logical atom (`atomId`).
 * "Current" = rows WHERE expired_at IS NULL AND status = 'active'. Edit = insert a new version +
 * expire the prior. Forget = new version with status 'forgotten'. Time-travel = as-of `created_at`.
 */
export const atom = pgTable(
  "atom",
  {
    /** Unique id of THIS version. */
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Stable id of the logical atom across its versions. */
    atomId: text("atom_id")
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    version: integer("version").notNull().default(1),

    // tenancy
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    helloId: text("hello_id")
      .notNull()
      .references(() => hello.id, { onDelete: "cascade" }),
    orgId: text("org_id"),

    // the fact
    subject: text("subject").notNull(),
    predicate: text("predicate").notNull(),
    object: jsonb("object").$type<AtomObject>().notNull(),
    factText: text("fact_text").notNull(),

    // bi-temporal
    validAt: timestamp("valid_at", { withTimezone: true }).defaultNow().notNull(),
    invalidAt: timestamp("invalid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiredAt: timestamp("expired_at", { withTimezone: true }),

    // membrane + signal
    visibility: visibility("visibility").notNull().default("private"),
    confidence: real("confidence").notNull().default(1),
    salience: real("salience").notNull().default(0),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),

    // lifecycle
    status: atomStatus("status").notNull().default("active"),
    supersedes: text("supersedes"),
    provenance: jsonb("provenance").$type<AtomProvenance[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [
    uniqueIndex("atom_atomId_version_uidx").on(t.atomId, t.version),
    // tenant-leading composite indexes (RLS filters on hello_id / owner_id first)
    index("atom_current_idx")
      .on(t.helloId, t.predicate)
      .where(sql`${t.expiredAt} is null and ${t.status} = 'active'`),
    index("atom_owner_atomId_idx").on(t.ownerId, t.atomId),
  ],
);

/** `audit` — append-only trust/action log (ADR-0002 B.2). Never carries memory changes. */
export const audit = pgTable(
  "audit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    helloId: text("hello_id")
      .notNull()
      .references(() => hello.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
    kind: auditKind("kind").notNull(),
    requestId: text("request_id"),
    payload: jsonb("payload").$type<AuditPayload>().notNull().default(sql`'{}'::jsonb`),
    /** Hex digest chaining this row to the previous — tamper-evidence (nullable in v1). */
    digest: text("digest"),
  },
  (t) => [index("audit_hello_ts_idx").on(t.helloId, t.ts)],
);

export const helloRelations = relations(hello, ({ one, many }) => ({
  owner: one(user, { fields: [hello.ownerId], references: [user.id] }),
  atoms: many(atom),
  audits: many(audit),
}));

export const atomRelations = relations(atom, ({ one }) => ({
  owner: one(user, { fields: [atom.ownerId], references: [user.id] }),
  hello: one(hello, { fields: [atom.helloId], references: [hello.id] }),
}));

export const auditRelations = relations(audit, ({ one }) => ({
  owner: one(user, { fields: [audit.ownerId], references: [user.id] }),
  hello: one(hello, { fields: [audit.helloId], references: [hello.id] }),
}));
