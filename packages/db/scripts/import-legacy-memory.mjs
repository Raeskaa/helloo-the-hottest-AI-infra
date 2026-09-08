// One-off migration: helloo-brain (Supabase) `memories` + `entities` -> helloo-platform (Neon) `atom` + `atom_embedding`.
// Reads Supabase via REST (creds from helloo-brain/.dev.vars), embeds via Gemini (key from apps/api/.dev.vars),
// writes to Neon via pg (owner connection, bypasses RLS for a bulk admin import). Idempotent: clears prior
// `helloo-brain` provenance rows for the owner before importing. No secrets are hard-coded.
//
//   DATABASE_URL='<neon owner direct url>' OWNER_ID='<helloo user id>' IMPORT_LIMIT=20 node scripts/import-legacy-memory.mjs
import { readFileSync } from "node:fs";
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
const apiEnv = parseEnv("/Users/design/helloo-platform/apps/api/.dev.vars");
const SUPA_URL = brainEnv.SUPABASE_URL || brainEnv.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = brainEnv.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI = process.env.GEMINI_API_KEY || apiEnv.GEMINI_API_KEY;
const NEON = process.env.DATABASE_URL;
const OWNER = process.env.OWNER_ID || "TbB6dfSkhmq87rK5ze0O4jIqPNBdOzjW";
const LIMIT = Number(process.env.IMPORT_LIMIT || 0); // 0 = all
if (!SUPA_URL || !SUPA_KEY || !GEMINI || !NEON) {
  console.error("missing creds", { SUPA_URL: !!SUPA_URL, SUPA_KEY: !!SUPA_KEY, GEMINI: !!GEMINI, NEON: !!NEON });
  process.exit(1);
}
const sh = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

async function supaAll(table, cols) {
  let rows = [], from = 0;
  for (;;) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${cols}&limit=1000&offset=${from}`, { headers: sh });
    if (!r.ok) throw new Error(`supabase ${table} ${r.status}`);
    const batch = await r.json();
    rows = rows.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
    if (LIMIT && rows.length >= LIMIT) break;
  }
  return LIMIT ? rows.slice(0, LIMIT) : rows;
}

async function embedBatch(texts) {
  const requests = texts.map((t) => ({
    model: "models/gemini-embedding-001",
    content: { parts: [{ text: t }] },
    outputDimensionality: 768,
    taskType: "RETRIEVAL_DOCUMENT",
  }));
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requests }) },
  );
  if (!r.ok) throw new Error(`embed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).embeddings.map((e) => e.values);
}

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const uuid = () => crypto.randomUUID();

async function main() {
  const client = new pg.Client({ connectionString: NEON, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // owner's hello (create if missing)
  let hello = (await client.query("select id from hello where owner_id=$1 limit 1", [OWNER])).rows[0];
  if (!hello) {
    const id = uuid();
    await client.query("insert into hello (id, owner_id) values ($1,$2)", [id, OWNER]);
    hello = { id };
  }
  const helloId = hello.id;

  // idempotent: clear a previous import for this owner
  const del = await client.query(
    "delete from atom where owner_id=$1 and provenance @> '[{\"source\":\"helloo-brain\"}]'::jsonb",
    [OWNER],
  );
  console.log(`cleared ${del.rowCount} prior imported atoms`);

  // build the item list: memories + entities
  const memories = await supaAll("memories", "text,type,scope,created_at");
  const entities = LIMIT ? [] : await supaAll("entities", "name,email,scope");
  const items = [
    ...memories.filter((m) => m.text && m.text.trim()).map((m) => ({
      subject: "mahesh",
      predicate: m.type || "note",
      factText: m.text.trim(),
      visibility: (m.scope || "private").startsWith("team") ? "shared" : "private",
      prov: { source: "helloo-brain", kind: "memory", type: m.type, at: m.created_at },
    })),
    ...entities.filter((e) => e.name).map((e) => ({
      subject: e.name,
      predicate: "known_person",
      factText: `${e.name} is a person Mahesh knows${e.email ? ` (${e.email})` : ""}.`,
      visibility: (e.scope || "private").startsWith("team") ? "shared" : "private",
      prov: { source: "helloo-brain", kind: "entity" },
    })),
  ];
  console.log(`importing ${items.length} items (${memories.length} memories, ${entities.length} entities)`);

  let done = 0;
  for (const batch of chunk(items, 100)) {
    const vecs = await embedBatch(batch.map((i) => i.factText));
    for (let i = 0; i < batch.length; i++) {
      const it = batch[i];
      const atomId = uuid();
      await client.query(
        `insert into atom (id, atom_id, version, owner_id, hello_id, subject, predicate, object, fact_text, visibility, confidence, provenance)
         values ($1,$1,1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)`,
        [atomId, OWNER, helloId, it.subject, it.predicate, JSON.stringify({ value: it.factText }), it.factText, it.visibility, 0.8, JSON.stringify([{ source: "helloo-brain", assertedBy: "import", ...it.prov }])],
      );
      await client.query(
        "insert into atom_embedding (atom_id, owner_id, hello_id, embedding, model) values ($1,$2,$3,$4::vector,$5)",
        [atomId, OWNER, helloId, `[${vecs[i].join(",")}]`, "gemini-embedding-001"],
      );
    }
    done += batch.length;
    console.log(`  ${done}/${items.length}`);
  }
  await client.end();
  console.log("DONE");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
