import { Hono } from "hono";
import { cors } from "hono/cors";
import { pingDb } from "@helloo/db";
import { createAuth } from "@helloo/auth";
import { ingestText, listMemory, recall } from "@helloo/memory";
import { listOpenApprovals, decide } from "@helloo/trust";
import { initiateConnection, listConnections, executeAction } from "@helloo/integrations";
import { HelloAgent } from "./hello-agent";
import type { AppEnv } from "@helloo/core";

// apps/api is composition-only: it wires the domain packages to HTTP.
// Domain behaviour lives in packages/*; the per-user runtime is the HelloAgent DO.
type Bindings = AppEnv & { HELLO_AGENT: DurableObjectNamespace };
const app = new Hono<{ Bindings: Bindings }>();

/** The caller's durable agent (one per user). */
function agentStub(env: Bindings, owner: string): DurableObjectStub {
  return env.HELLO_AGENT.get(env.HELLO_AGENT.idFromName(owner));
}

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

// Semantic recall: ?q=... [&k=8] -> ranked atoms with similarity + provenance.
app.get("/api/memory/recall", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const q = c.req.query("q");
  if (!q || q.trim().length === 0) return c.json({ error: "q required" }, 400);
  const kRaw = Number(c.req.query("k"));
  const k = Number.isFinite(kRaw) && kRaw > 0 ? Math.min(Math.floor(kRaw), 50) : 8;
  const hits = await recall(c.env, owner, q, k);
  return c.json({ hits });
});

// Approvals inbox: consequential actions awaiting the owner's decision.
app.get("/api/approvals", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  return c.json({ requests: await listOpenApprovals(c.env, owner) });
});

// Decide one request: { decision: "allow"|"deny", rememberScope?, rationale? }.
app.post("/api/approvals/:id", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ decision?: unknown; rememberScope?: unknown; rationale?: unknown }>().catch(() => null);
  const decision = body?.decision;
  if (decision !== "allow" && decision !== "deny") {
    return c.json({ error: "decision must be 'allow' or 'deny'" }, 400);
  }
  const rememberScope = body?.rememberScope === "always_for" ? "always_for" : "once";
  const rationale = typeof body?.rationale === "string" ? body.rationale : undefined;
  const result = await decide(c.env, owner, c.req.param("id"), {
    decision,
    rememberScope,
    rationale,
    reviewer: owner,
  });
  // On approval, execute the action for real (this is the side effect the gate was protecting).
  if (result.request.status === "allowed") {
    const execution = await executeAction(
      c.env,
      owner,
      result.request.tool,
      result.request.args,
    );
    return c.json({ ...result, execution });
  }
  return c.json(result);
});

// The daily loop runs in the caller's durable agent (recall → reason → gate → learn).
app.post("/api/converse", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ message?: unknown }>().catch(() => null);
  const message = body?.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    return c.json({ error: "message required" }, 400);
  }
  return agentStub(c.env, owner).fetch("https://hello-agent/turn", {
    method: "POST",
    headers: { "content-type": "application/json", "x-owner-id": owner },
    body: JSON.stringify({ message }),
  });
});

// Proactivity: schedule / read the Morning Brief (composed by the agent's DO alarm).
app.post("/api/brief/schedule", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  return agentStub(c.env, owner).fetch("https://hello-agent/schedule-brief", {
    method: "POST",
    headers: { "x-owner-id": owner },
  });
});

app.get("/api/brief", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  return agentStub(c.env, owner).fetch("https://hello-agent/last-brief", {
    headers: { "x-owner-id": owner },
  });
});

// Connect a real account (OAuth): { toolkit: "gmail" } -> a redirect URL the user opens.
app.post("/api/connect", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ toolkit?: unknown }>().catch(() => null);
  const toolkit = body?.toolkit;
  if (typeof toolkit !== "string" || toolkit.trim().length === 0) {
    return c.json({ error: "toolkit required (e.g. 'gmail')" }, 400);
  }
  return c.json(await initiateConnection(c.env, owner, toolkit));
});

// The user's connected accounts.
app.get("/api/connections", async (c) => {
  const owner = await ownerId(c.env, c.req.raw.headers);
  if (!owner) return c.json({ error: "unauthorized" }, 401);
  return c.json({ connections: await listConnections(c.env, owner) });
});

export { HelloAgent };

export default {
  fetch: app.fetch,
  // Cron warm-up: a trivial query keeps Neon's compute from suspending (prod only).
  async scheduled(_event: ScheduledController, env: AppEnv, _ctx: ExecutionContext): Promise<void> {
    try {
      await pingDb(env.DATABASE_URL);
    } catch {
      // best-effort; a failed warm-up just means the next real request wakes it.
    }
  },
};
