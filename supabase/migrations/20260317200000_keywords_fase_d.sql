-- Fase D: keywords adicionales para huecos de descubrimiento (OTEC / consultoría / bienestar)
INSERT INTO keywords (organization_id, categoria, palabra, activa)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Capacitación', 'congreso', true),
  ('00000000-0000-0000-0000-000000000001', 'Capacitación', 'charla', true),
  ('00000000-0000-0000-0000-000000000001', 'Capacitación', 'entrenamiento', true),
  ('00000000-0000-0000-0000-000000000001', 'Bienestar', 'psicoeducación', true),
  ('00000000-0000-0000-0000-000000000001', 'RRHH', 'mentorias', true),
  ('00000000-0000-0000-0000-000000000001', 'Facilitación', 'relator', true),
  ('00000000-0000-0000-0000-000000000001', 'Facilitación', 'monitoreo', true)
ON CONFLICT (organization_id, categoria, palabra) DO NOTHING;
