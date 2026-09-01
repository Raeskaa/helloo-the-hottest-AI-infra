// Used ONLY by the Better Auth CLI (`npm run db:generate`) to introspect the
// schema from the plugins. Never imported by the Worker at runtime. Runs in
// Node, so it reads process.env.
import { createAuth } from "./src/auth";

export const auth = createAuth({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "cli-only-not-a-real-secret",
});
