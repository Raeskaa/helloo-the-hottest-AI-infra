// One-off admin script: create the non-owner runtime role `helloo_app` so RLS actually
// binds (the Neon owner role has BYPASSRLS — see ADR-0003). Idempotent.
//
//   ADMIN_DATABASE_URL=<owner/direct url>  APP_DB_PASSWORD=<generated>  node scripts/create-app-role.mjs
//
// The password is read from the env — it is NEVER written into this file or any migration.
import pg from "pg";

const admin = process.env.ADMIN_DATABASE_URL;
const password = process.env.APP_DB_PASSWORD; // optional: only sets/rotates the password when present
if (!admin) {
  console.error("Set ADMIN_DATABASE_URL (owner/direct url)");
  process.exit(1);
}
if (password && !/^[0-9a-f]{24,}$/.test(password)) {
  console.error("APP_DB_PASSWORD must be a long hex string (safe to inline in DDL)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: admin, ssl: { rejectUnauthorized: false } });
await client.connect();

const who = await client.query(
  "select current_user as u, rolbypassrls, rolsuper from pg_roles where rolname = current_user",
);
console.log("connected as", who.rows[0]);
const owner = who.rows[0].u;

await client.query(`DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'helloo_app') THEN
    CREATE ROLE helloo_app LOGIN NOBYPASSRLS;
  END IF;
END $$;`);
if (password) {
  await client.query(`ALTER ROLE helloo_app WITH LOGIN NOBYPASSRLS PASSWORD '${password}'`);
  console.log("password set/rotated");
} else {
  console.log("no APP_DB_PASSWORD given — grants only, password unchanged");
}

await client.query(`GRANT USAGE ON SCHEMA public TO helloo_app`);
await client.query(
  `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "hello", "atom", "audit", "atom_embedding" TO helloo_app`,
);
await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO helloo_app`);
// Future membrane tables (created by the owner in migrations) are granted automatically.
await client.query(
  `ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO helloo_app`,
);
await client.query(
  `ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO helloo_app`,
);

const check = await client.query("select rolbypassrls from pg_roles where rolname = 'helloo_app'");
console.log("helloo_app ready — bypassrls:", check.rows[0].rolbypassrls);
await client.end();
