import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "@helloo/auth";
import type { AppEnv } from "@helloo/core";

// apps/api is composition-only: it wires the domain packages to HTTP.
// Domain behaviour lives in packages/* (auth today; memory, trust, agent,
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

app.get("/", (c) =>
  c.json({ ok: true, service: "helloo-api", auth: "/api/auth/*", me: "/api/me" }),
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

export default app;
