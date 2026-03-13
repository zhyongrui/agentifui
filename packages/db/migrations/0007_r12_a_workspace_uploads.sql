CREATE TABLE IF NOT EXISTS workspace_uploaded_files (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id varchar(120) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id varchar(120) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  storage_provider varchar(32) NOT NULL,
  storage_key text NOT NULL,
  file_name varchar(255) NOT NULL,
  content_type varchar(255) NOT NULL,
  size_bytes integer NOT NULL,
  sha256 varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_uploaded_files_tenant_idx
  ON workspace_uploaded_files (tenant_id);
CREATE INDEX IF NOT EXISTS workspace_uploaded_files_user_idx
  ON workspace_uploaded_files (user_id);
CREATE INDEX IF NOT EXISTS workspace_uploaded_files_conversation_idx
  ON workspace_uploaded_files (conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_uploaded_files_storage_key_unique
  ON workspace_uploaded_files (storage_key);
