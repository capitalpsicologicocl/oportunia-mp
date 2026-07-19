-- Sync separada: Compra Ágil vs Licitaciones
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS last_mp_sync_ca_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_mp_sync_lic_at timestamptz,
  ADD COLUMN IF NOT EXISTS mp_sync_pending_ca jsonb,
  ADD COLUMN IF NOT EXISTS mp_sync_pending_lic jsonb;
