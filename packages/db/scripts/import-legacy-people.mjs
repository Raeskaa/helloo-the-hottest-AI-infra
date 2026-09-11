// One-off migration: helloo-brain (Supabase) `entities` -> helloo-platform (Neon) `person` +
// `person_identity`. Reads Supabase via REST (creds from helloo-brain), writes to Neon via pg
// (owner connection, bypasses RLS for a bulk admin import). Idempotent: clears prior `helloo-brain`
// provenance people for the owner first. No secrets are hard-coded.
//
//   DATABASE_URL='<neon owner url>' OWNER_ID='<helloo user id>' node scripts/import-legacy-people.mjs
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

function parseEnv(p) {
  const o = {};
  try {
    for (const l of readFileSync(p, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
      if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return o;
}

const brainEnv = { ...parseEnv("/Users/design/helloo-brain/.env.local"), ...parseEnv("/Users/design/helloo-brain/.dev.vars") };
const SUPA_URL = brainEnv.SUPABASE_URL || brainEnv.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = brainEnv.SUPABASE_SERVICE_ROLE_KEY;
const NEON = process.env.DATABASE_URL;
const OWNER = process.env.OWNER_ID || "TbB6dfSkhmq87rK5ze0O4jIqPNBdOzjW";
if (!SUPA_URL || !SUPA_KEY || !NEON) {
  console.error("missing creds", { SUPA_URL: !!SUPA_URL, SUPA_KEY: !!SUPA_KEY, NEON: !!NEON });
  process.exit(1);
}
const sh = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

async function supaAll(table, cols) {
  let rows = [], from = 0;
  for (;;) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${cols}&limit=1000&offset=${from}`, { headers: sh });
    if (!r.ok) throw new Error(`supabase ${table} ${r.status}: ${await r.text()}`);
    const batch = await r.json();
    rows = rows.concat(batch);
    if (batch.length < 1000) return rows;
    from += 1000;
  }
}

const norm = (s) => String(s ?? "").toLowerCase().trim();

const client = new pg.Client({ connectionString: NEON, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const hello = await client.query(`select id from hello where owner_id = $1 limit 1`, [OWNER]);
  if (hello.rows.length === 0) throw new Error(`no hello row for owner ${OWNER} — run the memory import first`);
  const helloId = hello.rows[0].id;

  const entities = (await supaAll("entities", "id,kind,name,norm,mentions,last_seen,meta,email")).filter(
    (e) => e.name && norm(e.name).length > 0,
  );
  console.log(`fetched ${entities.length} legacy entities`);

  // Idempotent: drop previously-imported people (identities cascade).
  const del = await client.query(`delete from person where owner_id = $1 and meta->>'source' = 'helloo-brain'`, [OWNER]);
  console.log(`cleared ${del.rowCount} prior imported people`);

  let people = 0, identities = 0;
  for (const e of entities) {
    const n = norm(e.norm || e.name);
    const meta = { ...(e.meta && typeof e.meta === "object" ? e.meta : {}), source: "helloo-brain", legacy_id: e.id };
    const isSelf = Boolean(e.meta && typeof e.meta === "object" && e.meta.is_self);
    const ins = await client.query(
      `insert into person (id, owner_id, hello_id, kind, display_name, norm, is_self, mentions, last_seen, meta)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (owner_id, norm) do nothing
       returning id`,
      [randomUUID(), OWNER, helloId, e.kind || "person", e.name, n, isSelf, e.mentions || 0, e.last_seen || null, meta],
    );
    if (ins.rows.length > 0) people += 1;
  }

  // Map every person's norm -> id (covers both freshly-inserted and any pre-existing), then attach emails.
  const map = new Map();
  const all = await client.query(`select id, norm from person where owner_id = $1`, [OWNER]);
  for (const row of all.rows) map.set(row.norm, row.id);

  for (const e of entities) {
    if (!e.email) continue;
    const personId = map.get(norm(e.norm || e.name));
    if (!personId) continue;
    const ident = await client.query(
      `insert into person_identity (id, owner_id, hello_id, person_id, channel, value, norm)
       values ($1,$2,$3,$4,'email',$5,$6)
       on conflict (owner_id, channel, norm) do nothing
       returning id`,
      [randomUUID(), OWNER, helloId, personId, e.email, norm(e.email)],
    );
    if (ident.rows.length > 0) identities += 1;
  }

  console.log(`imported ${people} people + ${identities} email identities for owner ${OWNER}`);
} finally {
  await client.end();
}
