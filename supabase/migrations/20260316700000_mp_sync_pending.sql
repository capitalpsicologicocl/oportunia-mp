-- Estado de sincronización por lotes (evita timeout HTTP)

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS mp_sync_pending jsonb;
