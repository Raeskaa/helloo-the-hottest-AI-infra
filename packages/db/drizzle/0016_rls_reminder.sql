-- Custom SQL migration file, put your code below! --
-- Reminder scheduler (ADR-0003 membrane): tenant isolation by RLS, same pattern as `atom`.
-- Writes go through withTenant (app role, FORCE RLS); the cron reads across tenants via the owner
-- connection, which bypasses RLS. Context set per tx via set_config('app.owner_id', <id>, true).

ALTER TABLE "reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminder" FORCE ROW LEVEL SECURITY;
CREATE POLICY "reminder_tenant_isolation" ON "reminder"
  USING ("owner_id" = current_setting('app.owner_id', true))
  WITH CHECK ("owner_id" = current_setting('app.owner_id', true));

-- Grant the app role table access (RLS still constrains rows). No-op if the role is absent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'helloo_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "reminder" TO "helloo_app";
  END IF;
END
$$;