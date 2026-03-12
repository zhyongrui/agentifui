ALTER TABLE users
  ADD COLUMN IF NOT EXISTS image text;

CREATE TABLE IF NOT EXISTS better_auth_accounts (
  id varchar(120) PRIMARY KEY,
  account_id varchar(255) NOT NULL,
  provider_id varchar(120) NOT NULL,
  user_id varchar(120) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS better_auth_accounts_user_idx
  ON better_auth_accounts (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS better_auth_accounts_provider_account_unique
  ON better_auth_accounts (provider_id, account_id);

CREATE TABLE IF NOT EXISTS better_auth_sessions (
  id varchar(120) PRIMARY KEY,
  user_id varchar(120) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  token text NOT NULL,
  ip_address varchar(64),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS better_auth_sessions_user_idx
  ON better_auth_sessions (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS better_auth_sessions_token_unique
  ON better_auth_sessions (token);

CREATE TABLE IF NOT EXISTS better_auth_verifications (
  id varchar(120) PRIMARY KEY,
  identifier varchar(255) NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS better_auth_verifications_identifier_unique
  ON better_auth_verifications (identifier);
