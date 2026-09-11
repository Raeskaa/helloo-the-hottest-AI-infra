-- Custom SQL migration file, put your code below! --
-- People graph (ADR-0003 membrane): tenant isolation by Row-Level Security, same pattern as `atom`.
-- Context set per transaction via `select set_config('app.owner_id', <id>, true)` (see withTenant).
-- FORCE so the owner role can't bypass; the app connects as the non-owner `helloo_app` role.

-- person ------------------------------------------------------------------
ALTER TABLE "person" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "person" FORCE ROW LEVEL SECURITY;
CREATE POLICY "person_tenant_isolation" ON "person"
  USING ("owner_id" = current_setting('app.owner_id', true))
  WITH CHECK ("owner_id" = current_setting('app.owner_id', true));

-- person_identity ---------------------------------------------------------
ALTER TABLE "person_identity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "person_identity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "person_identity_tenant_isolation" ON "person_identity"
  USING ("owner_id" = current_setting('app.owner_id', true))
  WITH CHECK ("owner_id" = current_setting('app.owner_id', true));

-- Grant the app role table access (RLS still constrains rows). No-op if the role is absent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'helloo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "person" TO "helloo_app";
    GRANT SELECT, INSERT, UPDATE, DELETE ON "person_identity" TO "helloo_app";
  END IF;
END
$$;