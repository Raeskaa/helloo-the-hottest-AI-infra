import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AppEnv } from "@helloo/core";

/**
 * Cloudflare bindings (secrets/env) for this Worker, typed as our shared AppEnv contract. This is
 * the one isolated boundary where the framework's loosely-typed env is adapted to AppEnv.
 */
export function appEnv(): AppEnv {
  const { env } = getCloudflareContext();
  return env as unknown as AppEnv;
}
