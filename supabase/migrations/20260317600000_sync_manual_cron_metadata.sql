-- Registro separado: última sync manual vs cron nocturno (por scope)

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS last_mp_sync_ca_manual_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_mp_sync_ca_cron_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_mp_sync_lic_manual_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_mp_sync_lic_cron_at timestamptz;

-- Syncs previas a esta migración se consideran manuales (no había cron registrado)
UPDATE org_settings
SET
  last_mp_sync_ca_manual_at = COALESCE(last_mp_sync_ca_manual_at, last_mp_sync_ca_at),
  last_mp_sync_lic_manual_at = COALESCE(last_mp_sync_lic_manual_at, last_mp_sync_lic_at)
WHERE last_mp_sync_ca_at IS NOT NULL OR last_mp_sync_lic_at IS NOT NULL;
