-- Custom SQL migration file, put your code below! --
-- Full-text keyword signal for multi-signal recall (ADR-0005 follow-up; SYSTEM-MAP §4).
-- Functional GIN index on the English tsvector of fact_text; the recall query uses the
-- identical expression so the index applies. 'english' is a constant -> expression is immutable.
CREATE INDEX "atom_fact_text_fts_idx" ON "atom"
  USING gin (to_tsvector('english', "fact_text"));