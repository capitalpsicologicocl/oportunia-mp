-- Kanban CRM enhancements: postulada column, pipeline filter, contacts, financial JSON

ALTER TYPE kanban_columna ADD VALUE IF NOT EXISTS 'postulada';

ALTER TABLE kanban_cards
  ADD COLUMN IF NOT EXISTS en_pipeline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descartado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descartado_at timestamptz,
  ADD COLUMN IF NOT EXISTS contacto_contraparte text,
  ADD COLUMN IF NOT EXISTS contacto_responsable text,
  ADD COLUMN IF NOT EXISTS contacto_email text,
  ADD COLUMN IF NOT EXISTS contacto_telefono text,
  ADD COLUMN IF NOT EXISTS contacto_direccion text,
  ADD COLUMN IF NOT EXISTS direccion_ejecucion text,
  ADD COLUMN IF NOT EXISTS analisis_financiero_json jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Solo procesos enviados explícitamente al CRM aparecen en el tablero
UPDATE kanban_cards SET en_pipeline = false WHERE en_pipeline IS DISTINCT FROM true;

CREATE INDEX IF NOT EXISTS idx_kanban_cards_pipeline
  ON kanban_cards (organization_id, en_pipeline, descartado)
  WHERE en_pipeline = true AND descartado = false;
