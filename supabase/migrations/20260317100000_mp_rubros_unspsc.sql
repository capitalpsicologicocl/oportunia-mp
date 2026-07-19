-- Fase C: rubros MP con códigos UNSPSC reales para matching en descubrimiento
-- IMPORTANTE: soltar la restricción antigua ANTES de los UPDATE (varios mp-* → mismo UNSPSC).

ALTER TABLE selected_rubros
  DROP CONSTRAINT IF EXISTS selected_rubros_organization_id_codigo_unspsc_key;

UPDATE selected_rubros SET codigo_unspsc = '80101500'
  WHERE codigo_unspsc = 'mp-consultoria-gestion-empresas';
UPDATE selected_rubros SET codigo_unspsc = '80101500'
  WHERE codigo_unspsc = 'mp-gestion-proyectos';
UPDATE selected_rubros SET codigo_unspsc = '80101600'
  WHERE codigo_unspsc = 'mp-consultoria-rrhh';
UPDATE selected_rubros SET codigo_unspsc = '80111500'
  WHERE codigo_unspsc = 'mp-ventas-marketing';
UPDATE selected_rubros SET codigo_unspsc = '80101500'
  WHERE codigo_unspsc = 'mp-gerencial-salud';
UPDATE selected_rubros SET codigo_unspsc = '86101600'
  WHERE codigo_unspsc = 'mp-formacion-cientifica';
UPDATE selected_rubros SET codigo_unspsc = '86101500'
  WHERE codigo_unspsc = 'mp-formacion-no-cientifica';
UPDATE selected_rubros SET codigo_unspsc = '86101800'
  WHERE codigo_unspsc = 'mp-desarrollo-rrhh';
UPDATE selected_rubros SET codigo_unspsc = '86101700'
  WHERE codigo_unspsc = 'mp-aprendizaje-distancia';
UPDATE selected_rubros SET codigo_unspsc = '86101500'
  WHERE codigo_unspsc = 'mp-educacion-adultos';
UPDATE selected_rubros SET codigo_unspsc = '80101500'
  WHERE codigo_unspsc = 'mp-consultoria';
UPDATE selected_rubros SET codigo_unspsc = '80101900'
  WHERE codigo_unspsc = 'mp-planificacion-factibilidad';

-- Filas idénticas (mismo org + UNSPSC + nombre)
DELETE FROM selected_rubros a
USING selected_rubros b
WHERE a.organization_id = b.organization_id
  AND a.codigo_unspsc = b.codigo_unspsc
  AND a.nombre = b.nombre
  AND a.ctid > b.ctid;

-- Varios nombres comerciales MP pueden compartir el mismo UNSPSC
ALTER TABLE selected_rubros
  DROP CONSTRAINT IF EXISTS selected_rubros_org_codigo_nombre_key;

ALTER TABLE selected_rubros
  ADD CONSTRAINT selected_rubros_org_codigo_nombre_key
  UNIQUE (organization_id, codigo_unspsc, nombre);
