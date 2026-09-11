import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config: no R2 incremental cache (the app is dynamic — force-dynamic
// pages + API routes), so no extra Cloudflare resources are needed to go live.
export default defineCloudflareConfig({});
