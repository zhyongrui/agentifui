DO $$ BEGIN
  CREATE TYPE tenant_status AS ENUM ('active', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE group_member_role AS ENUM ('member', 'manager');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE auth_provider AS ENUM ('password', 'sso');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mfa_type AS ENUM ('totp');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_level AS ENUM ('info', 'warning', 'critical');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE auth_session_status AS ENUM ('active', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE auth_challenge_kind AS ENUM ('mfa_setup', 'mfa_login');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tenants (
  id varchar(120) PRIMARY KEY,
  slug varchar(64) NOT NULL,
  name varchar(120) NOT NULL,
  status tenant_status NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_unique ON tenants (slug);

CREATE TABLE IF NOT EXISTS groups (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id),
  slug varchar(64) NOT NULL,
  name varchar(120) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS groups_tenant_slug_unique ON groups (tenant_id, slug);
CREATE INDEX IF NOT EXISTS groups_tenant_idx ON groups (tenant_id);

CREATE TABLE IF NOT EXISTS users (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id),
  email varchar(255) NOT NULL,
  display_name varchar(120) NOT NULL,
  status user_status NOT NULL DEFAULT 'pending',
  password_hash text,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  is_email_verified boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_unique ON users (tenant_id, email);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);

CREATE TABLE IF NOT EXISTS group_members (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id),
  group_id varchar(120) NOT NULL REFERENCES groups(id),
  user_id varchar(120) NOT NULL REFERENCES users(id),
  role group_member_role NOT NULL DEFAULT 'member',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS group_members_group_user_unique ON group_members (group_id, user_id);
CREATE INDEX IF NOT EXISTS group_members_tenant_idx ON group_members (tenant_id);

CREATE TABLE IF NOT EXISTS auth_identities (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id),
  user_id varchar(120) NOT NULL REFERENCES users(id),
  provider auth_provider NOT NULL,
  provider_user_id varchar(255) NOT NULL,
  email varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_identities_tenant_idx ON auth_identities (tenant_id);
CREATE INDEX IF NOT EXISTS auth_identities_user_idx ON auth_identities (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_provider_user_unique
  ON auth_identities (provider, provider_user_id);

CREATE TABLE IF NOT EXISTS invitations (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id),
  invited_by_user_id varchar(120) REFERENCES users(id),
  email varchar(255) NOT NULL,
  token_hash text NOT NULL,
  status invitation_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitations_tenant_idx ON invitations (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_hash_unique ON invitations (token_hash);

CREATE TABLE IF NOT EXISTS mfa_factors (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id),
  user_id varchar(120) NOT NULL REFERENCES users(id),
  type mfa_type NOT NULL DEFAULT 'totp',
  secret_encrypted text NOT NULL,
  enabled_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfa_factors_tenant_idx ON mfa_factors (tenant_id);
CREATE INDEX IF NOT EXISTS mfa_factors_user_idx ON mfa_factors (user_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) REFERENCES tenants(id),
  actor_user_id varchar(120) REFERENCES users(id),
  action varchar(120) NOT NULL,
  level audit_level NOT NULL DEFAULT 'info',
  entity_type varchar(120) NOT NULL,
  entity_id varchar(120),
  ip_address varchar(64),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_tenant_idx ON audit_events (tenant_id);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id),
  user_id varchar(120) NOT NULL REFERENCES users(id),
  session_token_hash text NOT NULL,
  status auth_session_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_token_hash_unique ON auth_sessions (session_token_hash);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id varchar(120) PRIMARY KEY,
  tenant_id varchar(120) NOT NULL REFERENCES tenants(id),
  user_id varchar(120) REFERENCES users(id),
  email varchar(255),
  kind auth_challenge_kind NOT NULL,
  token_hash text NOT NULL,
  secret_encrypted text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_challenges_user_idx ON auth_challenges (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS auth_challenges_token_hash_unique ON auth_challenges (token_hash);
