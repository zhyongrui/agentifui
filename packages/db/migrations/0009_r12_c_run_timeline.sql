DO $$
BEGIN
  CREATE TYPE run_timeline_event_type AS ENUM (
    'run_created',
    'input_recorded',
    'run_started',
    'stop_requested',
    'output_recorded',
    'run_succeeded',
    'run_failed',
    'run_stopped'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS run_timeline_events (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id varchar(120) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id varchar(120) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id varchar(120) NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  event_type run_timeline_event_type NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS run_timeline_events_tenant_idx
  ON run_timeline_events (tenant_id);
CREATE INDEX IF NOT EXISTS run_timeline_events_run_idx
  ON run_timeline_events (run_id, created_at);
CREATE INDEX IF NOT EXISTS run_timeline_events_conversation_idx
  ON run_timeline_events (conversation_id, created_at);
