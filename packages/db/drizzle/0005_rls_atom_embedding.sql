-- Custom SQL migration file, put your code below! --
-- Membrane + ANN index for the recall index table (ADR-0003, ADR-0005).

ALTER TABLE "atom_embedding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "atom_embedding" FORCE ROW LEVEL SECURITY;
CREATE POLICY "atom_embedding_tenant_isolation" ON "atom_embedding"
  USING ("owner_id" = current_setting('app.owner_id', true))
  WITH CHECK ("owner_id" = current_setting('app.owner_id', true));

-- HNSW index for cosine similarity search (recall orders by embedding <=> query).
CREATE INDEX "atom_embedding_hnsw_idx" ON "atom_embedding"
  USING hnsw ("embedding" vector_cosine_ops);