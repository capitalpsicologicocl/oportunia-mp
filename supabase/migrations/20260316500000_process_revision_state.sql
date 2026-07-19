-- Estado de revisión en bandeja dashboard (no confundir con descartado Kanban)

DO $$ BEGIN
  CREATE TYPE proceso_estado_revision AS ENUM ('no_revisada', 'revisada', 'descartada');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS estado_revision proceso_estado_revision NOT NULL DEFAULT 'no_revisada';

CREATE INDEX IF NOT EXISTS idx_processes_estado_revision
  ON processes (organization_id, estado_revision);
