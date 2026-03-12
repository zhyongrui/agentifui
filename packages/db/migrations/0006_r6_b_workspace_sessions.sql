ALTER TYPE workspace_app_launch_status ADD VALUE IF NOT EXISTS 'conversation_ready';

DO $$ BEGIN
  CREATE TYPE conversation_status AS ENUM ('active', 'archived', 'deleted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE run_type AS ENUM ('workflow', 'agent', 'generation');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE run_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'stopped');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS conversations (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id varchar(120) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id varchar(120) NOT NULL REFERENCES workspace_apps(id) ON DELETE CASCADE,
  active_group_id varchar(120) REFERENCES groups(id) ON DELETE SET NULL,
  external_id varchar(255),
  title varchar(512) NOT NULL,
  status conversation_status NOT NULL DEFAULT 'active',
  pinned boolean NOT NULL DEFAULT false,
  client_id text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_client_id_unique
  ON conversations (client_id);
CREATE INDEX IF NOT EXISTS conversations_tenant_user_idx
  ON conversations (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS conversations_app_idx
  ON conversations (app_id);
CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
  ON conversations (user_id, updated_at);

CREATE TABLE IF NOT EXISTS runs (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id varchar(120) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  app_id varchar(120) NOT NULL REFERENCES workspace_apps(id) ON DELETE CASCADE,
  user_id varchar(120) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_group_id varchar(120) REFERENCES groups(id) ON DELETE SET NULL,
  type run_type NOT NULL,
  triggered_from varchar(32) NOT NULL DEFAULT 'app_launch',
  status run_status NOT NULL DEFAULT 'pending',
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  elapsed_time integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  total_steps integer NOT NULL DEFAULT 0,
  trace_id varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS runs_trace_id_unique
  ON runs (trace_id);
CREATE INDEX IF NOT EXISTS runs_tenant_app_idx
  ON runs (tenant_id, app_id);
CREATE INDEX IF NOT EXISTS runs_conversation_idx
  ON runs (conversation_id);
CREATE INDEX IF NOT EXISTS runs_user_created_idx
  ON runs (user_id, created_at);

ALTER TABLE workspace_app_launches
  ADD COLUMN IF NOT EXISTS conversation_id varchar(120) REFERENCES conversations(id) ON DELETE SET NULL;
ALTER TABLE workspace_app_launches
  ADD COLUMN IF NOT EXISTS run_id varchar(120) REFERENCES runs(id) ON DELETE SET NULL;
ALTER TABLE workspace_app_launches
  ADD COLUMN IF NOT EXISTS trace_id varchar(64);

CREATE INDEX IF NOT EXISTS workspace_app_launches_conversation_idx
  ON workspace_app_launches (conversation_id);
