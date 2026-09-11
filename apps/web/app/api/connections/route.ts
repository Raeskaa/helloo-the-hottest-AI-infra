import { getConnections, SUPPORTED_TOOLKITS, TOOLKIT_LABELS } from "@helloo/integrations";
import { appEnv } from "@/lib/env";
import { ownerFromRequest, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Connected accounts (with multi-account detail) + what can still be connected. */
export async function GET(req: Request): Promise<Response> {
  const owner = await ownerFromRequest(req);
  if (!owner) return unauthorized();
  const { toolkits, accounts } = await getConnections(appEnv(), owner);
  const connectable = SUPPORTED_TOOLKITS.filter((t) => !toolkits.includes(t)).map((t) => ({
    slug: t,
    label: TOOLKIT_LABELS[t] ?? t,
  }));
  const withLabels = accounts.map((a) => ({ ...a, appLabel: TOOLKIT_LABELS[a.toolkit] ?? a.toolkit }));
  return Response.json({ accounts: withLabels, connectable });
}
