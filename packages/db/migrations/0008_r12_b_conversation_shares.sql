DO $$
BEGIN
  CREATE TYPE conversation_share_status AS ENUM ('active', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE conversation_share_access AS ENUM ('read_only');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS workspace_conversation_shares (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id varchar(120) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  creator_user_id varchar(120) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_group_id varchar(120) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status conversation_share_status NOT NULL DEFAULT 'active',
  access conversation_share_access NOT NULL DEFAULT 'read_only',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS workspace_conversation_shares_tenant_idx
  ON workspace_conversation_shares (tenant_id);
CREATE INDEX IF NOT EXISTS workspace_conversation_shares_conversation_idx
  ON workspace_conversation_shares (conversation_id);
CREATE INDEX IF NOT EXISTS workspace_conversation_shares_shared_group_idx
  ON workspace_conversation_shares (shared_group_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_conversation_shares_conversation_group_unique
  ON workspace_conversation_shares (conversation_id, shared_group_id);
