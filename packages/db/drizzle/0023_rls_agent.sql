-- Custom SQL migration file, put your code below! --
-- User-defined agents (ADR-0003 membrane): tenant isolation by RLS. Writes via withTenant.

ALTER TABLE "agent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "agent_tenant_isolation" ON "agent"
  USING ("owner_id" = current_setting('app.owner_id', true))
  WITH CHECK ("owner_id" = current_setting('app.owner_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'helloo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "agent" TO "helloo_app";
  END IF;
END
$$;