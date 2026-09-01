/**
 * The environment/bindings every Worker in helloo receives. Kept here so
 * apps (composition) and packages (domain) share one contract.
 * Secrets are supplied via .dev.vars locally and `wrangler secret put` in prod.
 */
export interface AppEnv {
  // core (required)
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  /** Owner/admin Neon connection — used by auth (owns its tables; bypasses RLS). */
  DATABASE_URL: string;
  /**
   * Non-owner (`helloo_app`) Neon connection — the ONLY url the membrane uses.
   * RLS binds because this role lacks BYPASSRLS (ADR-0003). Never the owner url here.
   */
  APP_DATABASE_URL: string;

  // email (optional — dev falls back to console)
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;

  // LLM for the memory fact-pipeline (provider-agnostic via the AI SDK; Gemini today).
  GEMINI_API_KEY?: string;

  // Integrations / tool execution (Composio) — connect + act on the user's real accounts.
  COMPOSIO_API_KEY?: string;

  // social (optional — each provider enables when both keys are present)
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
}
