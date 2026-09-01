-- Custom SQL migration file, put your code below! --
-- Membrane (ADR-0003): tenant isolation enforced BELOW the model by Row-Level Security.
-- Context is set per transaction via `select set_config('app.owner_id', <id>, true)`
-- (see packages/memory withTenant). `current_setting('app.owner_id', true)` returns NULL
-- when unset -> every policy evaluates false -> zero rows (fail-closed).
-- FORCE is required because the app currently connects as the table owner, who would
-- otherwise bypass RLS. Hardening TODO: connect as a dedicated non-owner role.

-- hello -------------------------------------------------------------------
ALTER TABLE "hello" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hello" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hello_tenant_isolation" ON "hello"
  USING ("owner_id" = current_setting('app.owner_id', true))
  WITH CHECK ("owner_id" = current_setting('app.owner_id', true));

-- atom --------------------------------------------------------------------
ALTER TABLE "atom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "atom" FORCE ROW LEVEL SECURITY;
CREATE POLICY "atom_tenant_isolation" ON "atom"
  USING ("owner_id" = current_setting('app.owner_id', true))
  WITH CHECK ("owner_id" = current_setting('app.owner_id', true));

-- audit -------------------------------------------------------------------
ALTER TABLE "audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_tenant_isolation" ON "audit"
  USING ("owner_id" = current_setting('app.owner_id', true))
  WITH CHECK ("owner_id" = current_setting('app.owner_id', true));