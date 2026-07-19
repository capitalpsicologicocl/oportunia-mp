-- Historial: procesos fuera del dashboard activo (terminales / cerradas antiguas)
ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS dashboard_archived_at timestamptz;

-- Keywords adicionales (organización default)
INSERT INTO keywords (organization_id, categoria, palabra, activa)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Consultoría', 'seminario', true),
  ('00000000-0000-0000-0000-000000000001', 'Consultoría', 'jornada', true),
  ('00000000-0000-0000-0000-000000000001', 'RRHH', 'mentoría', true),
  ('00000000-0000-0000-0000-000000000001', 'Facilitación', 'relatoría', true),
  ('00000000-0000-0000-0000-000000000001', 'Facilitación', 'transcripción', true)
ON CONFLICT (organization_id, categoria, palabra) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_processes_dashboard_active
  ON processes (organization_id, tipo, dashboard_archived_at, fecha_publicacion DESC NULLS LAST)
  WHERE synced_via_dashboard = true;
