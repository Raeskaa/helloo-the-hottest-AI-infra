import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "@helloo/auth";
import { ingestText, listMemory } from "@helloo/memory";
import type { AppEnv } from "@helloo/core";

// apps/api is composition-only: it wires the domain packages to HTTP.
// Domain behaviour lives in packages/* (auth, memory today; trust, agent,
// channels as they're built).
const app = new Hono<{ Bindings: AppEnv }>();

// Reflect the request origin with credentials so the browser client can hold
// the session cookie. In production, replace with an explicit allowlist.
app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "",
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

/** Resolve the signed-in owner id from the request, or null. */
async function ownerId(env: AppEnv, headers: Headers): Promise<string | null> {
  const session = await createAuth(env).api.getSession({ headers });
  return session?.user.id ?? null;
}

app.get("/", (c) =>
  c.json({ ok: true, service: "helloo-api", auth: "/api/auth/*", me: "/api/me", memory: "/api/memory" }),
);

// Better Auth owns every route under /api/auth/* (sign-in, OTP, social, session, org…).
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

// Example protected route — proves the session works end to end.
app.get("/api/me", async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  return c.json({ user: session.user, session: session.session });
});

// Memory write path: text -> extracted facts -> atoms (in the caller's tenant).
app.post("/api/memory/ingest", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ text?: unknown }>().catch(() => null);
  const text = body?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return c.json({ error: "text required" }, 400);
  }
  const result = await ingestText(c.env, owner, text);
  return c.json(result);
});

// Memory read path: the caller's current beliefs.
app.get("/api/memory", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  return c.json({ atoms: await listMemory(c.env, owner) });
});

export default app;
