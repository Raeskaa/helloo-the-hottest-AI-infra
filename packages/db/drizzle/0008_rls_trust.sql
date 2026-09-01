-- Custom SQL migration file, put your code below! --
-- Membrane (ADR-0003) for the trust tables: tenant isolation below the model.

ALTER TABLE "permission_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permission_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY "permission_request_tenant_isolation" ON "permission_request"
  USING ("owner_id" = current_setting('app.owner_id', true))
  WITH CHECK ("owner_id" = current_setting('app.owner_id', true));

ALTER TABLE "policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "policy_tenant_isolation" ON "policy"
  USING ("owner_id" = current_setting('app.owner_id', true))
  WITH CHECK ("owner_id" = current_setting('app.owner_id', true));