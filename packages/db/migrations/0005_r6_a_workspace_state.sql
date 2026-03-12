DO $$ BEGIN
  CREATE TYPE workspace_app_launch_status AS ENUM ('handoff_ready');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS workspace_user_preferences (
  user_id varchar(120) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  favorite_app_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  recent_app_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_active_group_id varchar(120) REFERENCES groups(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_user_preferences_tenant_idx
  ON workspace_user_preferences (tenant_id);

CREATE TABLE IF NOT EXISTS workspace_app_launches (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id varchar(120) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id varchar(120) NOT NULL REFERENCES workspace_apps(id) ON DELETE CASCADE,
  attributed_group_id varchar(120) NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  status workspace_app_launch_status NOT NULL DEFAULT 'handoff_ready',
  launch_url text NOT NULL,
  launched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_app_launches_tenant_idx
  ON workspace_app_launches (tenant_id);
CREATE INDEX IF NOT EXISTS workspace_app_launches_user_idx
  ON workspace_app_launches (user_id);
CREATE INDEX IF NOT EXISTS workspace_app_launches_app_idx
  ON workspace_app_launches (app_id);
