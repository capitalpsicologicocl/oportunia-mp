-- Registro de intentos cron (diagnóstico cuando last_mp_sync_*_cron_at sigue null)

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS last_cron_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_cron_error text,
  ADD COLUMN IF NOT EXISTS last_cron_summary jsonb;
