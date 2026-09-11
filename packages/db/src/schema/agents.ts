import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { hello } from "./membrane";

/**
 * User-defined agents (VERSIONS v2 "make an agent"). Each is a named persona the user creates —
 * a system-prompt addition + an optional toolkit scope — that the main helloo can delegate to
 * ("ask my Recruiter agent to draft a cold email"). Actions a sub-agent proposes still go through
 * the trust gate. Tenant-isolated by RLS on owner_id.
 */
export const agent = pgTable(
  "agent",
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
    name: text("name").notNull(),
    /** Lowercased name for lookup/dedup. */
    norm: text("norm").notNull(),
    description: text("description"),
    /** The persona / instructions appended to the base system prompt when this agent runs. */
    persona: text("persona").notNull(),
    /** Toolkits this agent may use (subset of connected); null = all the user's connected toolkits. */
    toolkits: jsonb("toolkits").$type<string[] | null>(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agent_owner_norm_uidx").on(t.ownerId, t.norm),
    index("agent_owner_idx").on(t.ownerId).where(sql`${t.status} = 'active'`),
  ],
);
