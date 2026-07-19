-- OportunIA MP — schema inicial (single-tenant por instancia)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE process_tipo AS ENUM ('licitacion', 'compra_agil');
CREATE TYPE api_key_status AS ENUM ('valid', 'invalid', 'expired', 'no_credits', 'missing');
CREATE TYPE postulabilidad AS ENUM ('alta', 'media', 'baja', 'no_aplica', 'pendiente', 'revisar');
CREATE TYPE kanban_columna AS ENUM (
  'preevaluacion',
  'preparacion_pt',
  'ejecucion',
  'cierre',
  'pagada'
);
CREATE TYPE notification_tipo AS ENUM (
  'adjudicacion_propia',
  'estado_cambio',
  'api_key_error',
  'ingesta_error'
);
CREATE TYPE modalidad_otec AS ENUM ('presencial', 'elearning', 'mixta');
CREATE TYPE custom_field_type AS ENUM ('text', 'number');
CREATE TYPE sync_run_status AS ENUM ('running', 'success', 'partial', 'failed');

-- Organización (una fila por instancia)
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Mi organización',
  rut text,
  rut_dv text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  anthropic_api_key_encrypted text,
  anthropic_api_key_status api_key_status NOT NULL DEFAULT 'missing',
  chilecompra_ticket text,
  otec_fields_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Perfiles vinculados a auth.users
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name text,
  email text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Keywords del filtro (template base + personalización)
CREATE TABLE keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  categoria text NOT NULL,
  palabra text NOT NULL,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, categoria, palabra)
);

-- Rubros UNSPSC seleccionados por la organización
CREATE TABLE selected_rubros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  codigo_unspsc text NOT NULL,
  nombre text NOT NULL,
  sugerido_por_rut boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo_unspsc)
);

-- Procesos unificados (Licitaciones + Compras Ágiles)
CREATE TABLE processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  codigo_externo text NOT NULL,
  tipo process_tipo NOT NULL,
  estado text,
  nombre text NOT NULL,
  descripcion text,
  tipo_detalle text,
  monto_estimado bigint,
  monto_raw_api text,
  monto_sospechoso boolean NOT NULL DEFAULT false,
  organismo_nombre text,
  organismo_rut text,
  unidad_compra text,
  lugar_ejecucion text,
  fecha_publicacion timestamptz,
  fecha_cierre timestamptz,
  fecha_cierre_2 timestamptz,
  hora_cierre text,
  hora_cierre_2 text,
  dias_para_cierre integer,
  url_publica text,
  servicios_requeridos text,
  num_items integer,
  adjudicado_rut text,
  adjudicado_nombre text,
  adjudicado_a_mi boolean NOT NULL DEFAULT false,
  rubros_unspsc text[] DEFAULT '{}',
  content_hash text,
  num_personas text,
  modalidad_texto text,
  fechas_ejecucion text,
  requiere_arrendar_lugar text,
  coffee text,
  almuerzo text,
  permite_consorcio text,
  plazo_preguntas text,
  garantia_seriedad text,
  garantia_fiel_cumplimiento text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo_externo)
);

CREATE INDEX idx_processes_estado ON processes (organization_id, estado);
CREATE INDEX idx_processes_tipo ON processes (organization_id, tipo);
CREATE INDEX idx_processes_fecha_cierre ON processes (organization_id, fecha_cierre);
CREATE INDEX idx_processes_adjudicado_a_mi ON processes (organization_id, adjudicado_a_mi) WHERE adjudicado_a_mi = true;

-- Evaluación IA (una vez por proceso, solo si content_hash cambió)
CREATE TABLE ai_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL UNIQUE REFERENCES processes(id) ON DELETE CASCADE,
  relevancia_score integer CHECK (relevancia_score >= 0 AND relevancia_score <= 100),
  postulabilidad postulabilidad NOT NULL DEFAULT 'pendiente',
  razonamiento text,
  content_hash text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

-- Kanban CRM
CREATE TABLE kanban_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  process_id uuid NOT NULL UNIQUE REFERENCES processes(id) ON DELETE CASCADE,
  columna kanban_columna NOT NULL DEFAULT 'preevaluacion',
  orden integer NOT NULL DEFAULT 0,
  analisis_financiero text,
  costos jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado_interno text,
  responsable text,
  fecha_postulacion date,
  monto_ofertado bigint,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kanban_cards_columna ON kanban_cards (organization_id, columna, orden);

CREATE TABLE kanban_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_value text,
  field_type custom_field_type NOT NULL DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, field_key)
);

CREATE TABLE otec_fields (
  card_id uuid PRIMARY KEY REFERENCES kanban_cards(id) ON DELETE CASCADE,
  modalidad modalidad_otec,
  codigo_sence text,
  num_participantes integer,
  duracion_horas integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kanban_assignees (
  card_id uuid NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, profile_id)
);

-- Notificaciones (bandeja interna)
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  tipo notification_tipo NOT NULL,
  titulo text NOT NULL,
  mensaje text NOT NULL,
  process_id uuid REFERENCES processes(id) ON DELETE SET NULL,
  leida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_unread ON notifications (organization_id, leida, created_at DESC);

-- Auditoría de corridas de ingesta
CREATE TABLE sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status sync_run_status NOT NULL DEFAULT 'running',
  processes_fetched integer NOT NULL DEFAULT 0,
  processes_created integer NOT NULL DEFAULT 0,
  processes_updated integer NOT NULL DEFAULT 0,
  processes_evaluated_ia integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- Seed: organización por defecto para instancia single-tenant
INSERT INTO organizations (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Mi organización');
INSERT INTO org_settings (organization_id) VALUES ('00000000-0000-0000-0000-000000000001');

-- RLS básico (equipo interno de la instancia)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE selected_rubros ENABLE ROW LEVEL SECURITY;
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE otec_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own_org" ON profiles FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "processes_select_own_org" ON processes FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "notifications_select_own" ON notifications FOR SELECT TO authenticated
  USING (
    user_id IS NULL OR user_id = auth.uid()
    OR organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- Service role bypasses RLS for cron worker
