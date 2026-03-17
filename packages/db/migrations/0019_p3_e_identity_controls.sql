create type sso_domain_claim_status as enum ('pending', 'approved', 'rejected');
create type access_request_status as enum ('pending', 'approved', 'rejected', 'transferred');
create type access_request_source as enum ('manual', 'sso_jit');
create type break_glass_session_status as enum ('active', 'expired', 'revoked');

create table sso_domain_claims (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id),
  domain varchar(255) not null,
  provider_id varchar(120) not null,
  status sso_domain_claim_status not null default 'pending',
  jit_user_status user_status not null default 'pending',
  requested_by_user_id varchar(120) not null references users(id),
  review_reason text,
  reviewed_by_user_id varchar(120) references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index sso_domain_claims_domain_unique on sso_domain_claims (domain);
create index sso_domain_claims_tenant_idx on sso_domain_claims (tenant_id);

create table admin_access_requests (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id),
  user_id varchar(120) references users(id),
  email varchar(255) not null,
  display_name varchar(120),
  source access_request_source not null default 'manual',
  status access_request_status not null default 'pending',
  reason text,
  domain_claim_id varchar(120) references sso_domain_claims(id),
  target_tenant_id varchar(120) references tenants(id),
  requested_by_user_id varchar(120) references users(id),
  reviewed_by_user_id varchar(120) references users(id),
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index admin_access_requests_tenant_idx on admin_access_requests (tenant_id);
create index admin_access_requests_user_idx on admin_access_requests (user_id);
create index admin_access_requests_email_idx on admin_access_requests (email);

create table admin_break_glass_sessions (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id),
  actor_user_id varchar(120) not null references users(id),
  reason text not null,
  justification text,
  status break_glass_session_status not null default 'active',
  expires_at timestamptz not null,
  reviewed_by_user_id varchar(120) references users(id),
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index admin_break_glass_sessions_tenant_idx on admin_break_glass_sessions (tenant_id);
create index admin_break_glass_sessions_actor_idx on admin_break_glass_sessions (actor_user_id);
