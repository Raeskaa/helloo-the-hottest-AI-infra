import { relations } from "drizzle-orm";
import { pgTable, pgEnum, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { hello } from "./membrane";

/**
 * Trust layer (HUB-TRUST): the approve-before-act handshake + shared policy store. The audit
 * log (`membrane.audit`) is the immutable spine; these two tables are the open queue and the
 * "always allow for X" rules. Tenant boundary enforced by RLS — see the trust RLS migration.
 */

/** Action risk tier (HUB-TRUST action tiers). */
export const riskLevel = pgEnum("risk_level", ["low", "med", "high", "irreversible"]);
/** Lifecycle of a permission request. */
export const requestStatus = pgEnum("request_status", ["open", "allowed", "denied", "expired"]);
/** A policy either permits or forbids a scope. */
export const policyEffect = pgEnum("policy_effect", ["allow", "deny"]);

/** The arguments a proposed action carries (tool-specific). */
export type ActionArgs = Record<string, unknown>;
/** What a policy applies to; any subset narrows the match. */
export interface PolicyScope {
  tool?: string;
  actionClass?: string;
  contact?: string;
}

/** `permission_request` — the approve-before-act queue (open = the Approvals inbox). */
export const permissionRequest = pgTable(
  "permission_request",
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
    tool: text("tool").notNull(),
    actionClass: text("action_class"),
    contact: text("contact"),
    args: jsonb("args").$type<ActionArgs>().notNull(),
    risk: riskLevel("risk").notNull(),
    reason: text("reason"),
    /** Names of args derived from untrusted input (flagged for extra scrutiny). */
    untrustedArgs: jsonb("untrusted_args").$type<string[]>().notNull().default([]),
    status: requestStatus("status").notNull().default("open"),
    reviewer: text("reviewer"),
    rationale: text("rationale"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("permission_request_queue_idx").on(t.helloId, t.status)],
);

/** `policy` — the shared allow/deny store; "always allow for X" writes here (also read by v3 federation). */
export const policy = pgTable(
  "policy",
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
    scope: jsonb("scope").$type<PolicyScope>().notNull(),
    effect: policyEffect("effect").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    sourceRequestId: text("source_request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("policy_lookup_idx").on(t.helloId, t.effect)],
);

export const permissionRequestRelations = relations(permissionRequest, ({ one }) => ({
  owner: one(user, { fields: [permissionRequest.ownerId], references: [user.id] }),
  hello: one(hello, { fields: [permissionRequest.helloId], references: [hello.id] }),
}));

export const policyRelations = relations(policy, ({ one }) => ({
  owner: one(user, { fields: [policy.ownerId], references: [user.id] }),
  hello: one(hello, { fields: [policy.helloId], references: [hello.id] }),
}));
