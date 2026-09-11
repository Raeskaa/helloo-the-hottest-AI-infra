import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Lets `next dev` see Cloudflare bindings (env/secrets) locally. No-op in prod build.
initOpenNextCloudflareForDev();
