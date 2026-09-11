import { setDefaultAccount } from "@helloo/integrations";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";
import { jsonBody } from "@/lib/req";

export const dynamic = "force-dynamic";

/** Make one account the default for its app: { account } (label or id). */
export async function POST(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const body = await jsonBody(req);
  const account = typeof body.account === "string" ? body.account : "";
  if (!account) return Response.json({ error: "account required" }, { status: 400 });
  return Response.json(await setDefaultAccount(appEnv(), owner, account));
}
