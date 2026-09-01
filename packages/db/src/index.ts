import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/** Edge-native Neon Postgres client (HTTP driver — no persistent connection). */
export function getDb(url: string) {
  return drizzle(neon(url), { schema });
}

export type DB = ReturnType<typeof getDb>;
export * as schema from "./schema";
