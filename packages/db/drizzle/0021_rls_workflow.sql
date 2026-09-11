-- Custom SQL migration file, put your code below! --
-- Workflow (ADR-0003 membrane): tenant isolation by RLS, same pattern as reminder. Writes via
-- withTenant; the cron reads across tenants via the owner connection (bypasses RLS).

ALTER TABLE "workflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workflow_tenant_isolation" ON "workflow"
  USING ("owner_id" = current_setting('app.owner_id', true))
  WITH CHECK ("owner_id" = current_setting('app.owner_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'helloo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "workflow" TO "helloo_app";
  END IF;
END
$$;