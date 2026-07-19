-- Auth multi-usuario + campos empresa

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS nombre_fantasia text;

CREATE TABLE IF NOT EXISTS org_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rut text NOT NULL,
  rut_dv text NOT NULL,
  nombre text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, rut, rut_dv)
);

CREATE INDEX IF NOT EXISTS idx_org_users_org ON org_users(organization_id);
