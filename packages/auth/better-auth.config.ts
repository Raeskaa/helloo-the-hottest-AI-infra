// Used ONLY by the Better Auth CLI (`pnpm db:generate`) to introspect the schema
// from the plugins and write it into @helloo/db. Never imported by a Worker at
// runtime — runs in Node, so it reads process.env.
import { createAuth } from "./src/index";

export const auth = createAuth({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "cli-only-not-a-real-secret",
});
