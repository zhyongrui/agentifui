DO $$
BEGIN
  CREATE TYPE quota_scope AS ENUM ('tenant', 'group', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS workspace_quota_limits (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope quota_scope NOT NULL,
  scope_id varchar(120) NOT NULL,
  scope_label varchar(120) NOT NULL,
  monthly_limit integer NOT NULL DEFAULT 1000,
  base_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_quota_limits_tenant_scope_unique
  ON workspace_quota_limits (tenant_id, scope, scope_id);
CREATE INDEX IF NOT EXISTS workspace_quota_limits_tenant_idx
  ON workspace_quota_limits (tenant_id);
