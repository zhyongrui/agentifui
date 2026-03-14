DO $$
BEGIN
  CREATE TYPE workspace_artifact_kind AS ENUM ('text', 'markdown', 'json', 'table', 'link');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE workspace_artifact_source AS ENUM (
    'assistant_response',
    'tool_output',
    'user_upload'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE workspace_artifact_status AS ENUM ('draft', 'stable');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS workspace_artifacts (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id varchar(120) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id varchar(120) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id varchar(120) NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 0,
  title varchar(255) NOT NULL,
  kind workspace_artifact_kind NOT NULL,
  source workspace_artifact_source NOT NULL,
  status workspace_artifact_status NOT NULL DEFAULT 'draft',
  summary text,
  mime_type varchar(255),
  size_bytes integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_artifacts_tenant_idx
  ON workspace_artifacts (tenant_id);
CREATE INDEX IF NOT EXISTS workspace_artifacts_user_idx
  ON workspace_artifacts (user_id);
CREATE INDEX IF NOT EXISTS workspace_artifacts_conversation_idx
  ON workspace_artifacts (conversation_id);
CREATE INDEX IF NOT EXISTS workspace_artifacts_run_idx
  ON workspace_artifacts (run_id, sequence);
