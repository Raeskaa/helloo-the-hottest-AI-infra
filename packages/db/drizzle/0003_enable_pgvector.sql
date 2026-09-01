-- Custom SQL migration file, put your code below! --
-- pgvector for the recall index (ADR-0005). Must precede the atom_embedding table.
CREATE EXTENSION IF NOT EXISTS vector;