import { headers } from "next/headers";
import { createAuth } from "@helloo/auth";
import { appEnv } from "./env";

/** The signed-in owner id in a server component / page context, or null. */
export async function currentOwner(): Promise<string | null> {
  const session = await createAuth(appEnv()).api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/** The signed-in owner id for a request, or null. Used by every API route to scope data. */
export async function ownerFromRequest(req: Request): Promise<string | null> {
  const session = await createAuth(appEnv()).api.getSession({ headers: req.headers });
  return session?.user.id ?? null;
}

/** Standard 401 body. */
export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
