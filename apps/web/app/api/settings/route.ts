import { listReminders, listWorkflows } from "@helloo/scheduler";
import { listAgents } from "@helloo/agent";
import { appEnv } from "@/lib/env";
import { userFromRequest, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Account + the user's standing config: reminders, workflows, custom agents. */
export async function GET(req: Request): Promise<Response> {
  const user = await userFromRequest(req);
  if (!user) return unauthorized();
  const env = appEnv();
  const [reminders, workflows, agents] = await Promise.all([
    listReminders(env, user.id).catch(() => []),
    listWorkflows(env, user.id).catch(() => []),
    listAgents(env, user.id).catch(() => []),
  ]);
  return Response.json({
    email: user.email,
    reminders: reminders.map((r) => ({ id: r.id, body: r.body, repeat: r.repeat, when: r.nextRunAt.toISOString() })),
    workflows: workflows.map((w) => ({ id: w.id, name: w.name, instruction: w.instruction })),
    agents: agents.map((a) => ({ name: a.name, description: a.description })),
  });
}
