import { createAuth } from "@helloo/auth";
import { appEnv } from "@/lib/env";

// Better Auth owns every /api/auth/* route (email-OTP sign-in, session, …), same-origin so the
// session cookie is set on helloo-web. Shares the Neon DB with helloo-api → the same user accounts.
export const dynamic = "force-dynamic";

function handler(req: Request): Promise<Response> {
  return createAuth(appEnv()).handler(req);
}

export { handler as GET, handler as POST };
