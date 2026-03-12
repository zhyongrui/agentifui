DO $$ BEGIN
  CREATE TYPE workspace_app_kind AS ENUM ('chat', 'analysis', 'automation', 'governance');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE workspace_app_status AS ENUM ('ready', 'beta');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS workspace_apps (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug varchar(64) NOT NULL,
  name varchar(120) NOT NULL,
  summary text NOT NULL,
  kind workspace_app_kind NOT NULL,
  status workspace_app_status NOT NULL,
  short_code varchar(12) NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  launch_cost integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_apps_tenant_slug_unique
  ON workspace_apps (tenant_id, slug);
CREATE INDEX IF NOT EXISTS workspace_apps_tenant_idx
  ON workspace_apps (tenant_id);

CREATE TABLE IF NOT EXISTS workspace_group_app_grants (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id varchar(120) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  app_id varchar(120) NOT NULL REFERENCES workspace_apps(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_group_app_grants_group_app_unique
  ON workspace_group_app_grants (group_id, app_id);
CREATE INDEX IF NOT EXISTS workspace_group_app_grants_tenant_idx
  ON workspace_group_app_grants (tenant_id);
