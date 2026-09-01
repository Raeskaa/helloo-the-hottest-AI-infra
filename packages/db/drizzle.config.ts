import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/schema/auth.ts", "./src/schema/membrane.ts", "./src/schema/trust.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
