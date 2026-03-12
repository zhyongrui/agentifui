DO $$ BEGIN
  CREATE TYPE rbac_role_scope AS ENUM ('platform', 'tenant', 'group', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE workspace_grant_subject_type AS ENUM ('group', 'user', 'role');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE workspace_grant_effect AS ENUM ('allow', 'deny');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rbac_roles (
  id varchar(64) PRIMARY KEY,
  name varchar(64) NOT NULL,
  display_name varchar(255) NOT NULL,
  description text,
  scope rbac_role_scope NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rbac_roles_name_unique
  ON rbac_roles (name);
CREATE INDEX IF NOT EXISTS rbac_roles_scope_idx
  ON rbac_roles (scope);

CREATE TABLE IF NOT EXISTS rbac_user_roles (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id varchar(120) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id varchar(64) NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rbac_user_roles_tenant_user_role_unique
  ON rbac_user_roles (tenant_id, user_id, role_id);
CREATE INDEX IF NOT EXISTS rbac_user_roles_tenant_idx
  ON rbac_user_roles (tenant_id);
CREATE INDEX IF NOT EXISTS rbac_user_roles_user_idx
  ON rbac_user_roles (user_id);

CREATE TABLE IF NOT EXISTS workspace_app_access_grants (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_id varchar(120) NOT NULL REFERENCES workspace_apps(id) ON DELETE CASCADE,
  subject_type workspace_grant_subject_type NOT NULL,
  subject_id varchar(120) NOT NULL,
  effect workspace_grant_effect NOT NULL DEFAULT 'allow',
  reason text,
  created_by_user_id varchar(120) REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_app_access_grants_tenant_app_subject_effect_unique
  ON workspace_app_access_grants (tenant_id, app_id, subject_type, subject_id, effect);
CREATE INDEX IF NOT EXISTS workspace_app_access_grants_app_idx
  ON workspace_app_access_grants (app_id);
CREATE INDEX IF NOT EXISTS workspace_app_access_grants_subject_idx
  ON workspace_app_access_grants (subject_type, subject_id);

INSERT INTO workspace_app_access_grants (
  id,
  tenant_id,
  app_id,
  subject_type,
  subject_id,
  effect,
  created_at
)
SELECT
  CONCAT('mig_0004_', app_id, '_', group_id),
  tenant_id,
  app_id,
  'group'::workspace_grant_subject_type,
  group_id,
  'allow'::workspace_grant_effect,
  created_at
FROM workspace_group_app_grants
ON CONFLICT (tenant_id, app_id, subject_type, subject_id, effect) DO NOTHING;
