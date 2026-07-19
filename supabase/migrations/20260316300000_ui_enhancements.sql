-- UI enhancements: gestión links, campos descriptivos, fechas ejecución

ALTER TABLE kanban_cards
  ADD COLUMN IF NOT EXISTS fechas_ejecucion text,
  ADD COLUMN IF NOT EXISTS link_propuesta_tecnica text,
  ADD COLUMN IF NOT EXISTS link_carpeta_interna text,
  ADD COLUMN IF NOT EXISTS campos_descriptivos_json jsonb NOT NULL DEFAULT '{}'::jsonb;
