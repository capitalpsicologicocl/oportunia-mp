-- Catálogo UNSPSC (subset inicial — ampliar por cliente)
CREATE TABLE IF NOT EXISTS unspsc_catalog (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  categoria text
);

CREATE INDEX IF NOT EXISTS idx_unspsc_catalog_nombre ON unspsc_catalog USING gin (to_tsvector('spanish', nombre));

INSERT INTO unspsc_catalog (codigo, nombre, categoria) VALUES
  ('86101600', 'Servicios de capacitación en gestión', 'Capacitación'),
  ('86101500', 'Servicios de capacitación comercial', 'Capacitación'),
  ('86101800', 'Servicios de capacitación en recursos humanos', 'Capacitación'),
  ('86101700', 'Servicios de capacitación en informática', 'Capacitación'),
  ('86101900', 'Servicios de capacitación en ventas', 'Capacitación'),
  ('86102000', 'Servicios de capacitación en seguridad industrial', 'Capacitación'),
  ('86102100', 'Servicios de capacitación en primeros auxilios', 'Capacitación'),
  ('86102200', 'Servicios de capacitación en idiomas', 'Capacitación'),
  ('86102300', 'Servicios de capacitación en habilidades blandas', 'Capacitación'),
  ('80101500', 'Servicios de consultoría en gestión', 'Consultoría'),
  ('80101600', 'Servicios de consultoría en recursos humanos', 'Consultoría'),
  ('80111500', 'Servicios de consultoría en marketing', 'Consultoría'),
  ('80101700', 'Servicios de consultoría en tecnología de información', 'Consultoría'),
  ('80101800', 'Servicios de consultoría en desarrollo organizacional', 'Consultoría'),
  ('80101900', 'Servicios de consultoría en calidad', 'Consultoría'),
  ('80102000', 'Servicios de consultoría en comunicaciones', 'Consultoría'),
  ('92101500', 'Servicios de salud mental', 'Bienestar'),
  ('92101600', 'Servicios de psicología', 'Bienestar'),
  ('92101700', 'Servicios de terapia ocupacional', 'Bienestar'),
  ('92101800', 'Servicios de medicina preventiva', 'Bienestar')
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE unspsc_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unspsc_catalog_read_all" ON unspsc_catalog FOR SELECT TO authenticated, anon
  USING (true);
