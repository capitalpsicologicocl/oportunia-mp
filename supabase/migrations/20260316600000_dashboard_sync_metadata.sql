-- Metadatos de sincronización manual del dashboard (no importación CSV)

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS last_mp_sync_at timestamptz;

ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS synced_via_dashboard boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_processes_dashboard_sync
  ON processes (organization_id, synced_via_dashboard, fecha_publicacion DESC NULLS LAST);
