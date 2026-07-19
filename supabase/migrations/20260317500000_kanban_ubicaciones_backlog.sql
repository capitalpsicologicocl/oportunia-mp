-- Kanban card ubicaciones + backlog JSON columns

ALTER TABLE kanban_cards
  ADD COLUMN IF NOT EXISTS ubicaciones_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE kanban_cards
  ADD COLUMN IF NOT EXISTS backlog_json jsonb NOT NULL DEFAULT '[]'::jsonb;
