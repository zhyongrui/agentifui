create type connector_kind as enum ('web', 'google_drive', 'notion', 'confluence', 'file_drop');
create type connector_auth_type as enum ('none', 'oauth', 'token', 'service_account');
create type connector_status as enum ('active', 'paused', 'revoked');
create type connector_sync_status as enum ('queued', 'running', 'succeeded', 'partial_failure', 'cancelled', 'failed');

create table knowledge_connectors (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  group_id varchar(120) references groups(id) on delete set null,
  created_by_user_id varchar(120) not null references users(id) on delete cascade,
  title varchar(255) not null,
  kind connector_kind not null,
  scope knowledge_source_scope not null,
  status connector_status not null default 'active',
  auth_type connector_auth_type not null,
  cadence_minutes integer not null default 60,
  checkpoint_cursor text,
  checkpoint_updated_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_connectors_tenant_idx on knowledge_connectors (tenant_id);
create index knowledge_connectors_group_idx on knowledge_connectors (group_id);
create index knowledge_connectors_status_idx on knowledge_connectors (tenant_id, status, updated_at);

create table knowledge_connector_credentials (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  connector_id varchar(120) not null references knowledge_connectors(id) on delete cascade,
  auth_type connector_auth_type not null,
  secret_hash varchar(128),
  status connector_status not null default 'active',
  last_validated_at timestamptz,
  last_rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index knowledge_connector_credentials_connector_unique
  on knowledge_connector_credentials (connector_id);
create index knowledge_connector_credentials_tenant_idx
  on knowledge_connector_credentials (tenant_id);

create table knowledge_connector_sync_jobs (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  connector_id varchar(120) not null references knowledge_connectors(id) on delete cascade,
  requested_by_user_id varchar(120) references users(id) on delete set null,
  status connector_sync_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  checkpoint_before_cursor text,
  checkpoint_before_updated_at timestamptz,
  checkpoint_after_cursor text,
  checkpoint_after_updated_at timestamptz,
  summary jsonb not null default '{"createdSources":0,"updatedSources":0,"skippedSources":0,"failedSources":0}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index knowledge_connector_sync_jobs_tenant_idx
  on knowledge_connector_sync_jobs (tenant_id);
create index knowledge_connector_sync_jobs_connector_idx
  on knowledge_connector_sync_jobs (connector_id, created_at desc);

create table knowledge_connector_document_provenance (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  connector_id varchar(120) not null references knowledge_connectors(id) on delete cascade,
  knowledge_source_id varchar(120) not null references knowledge_sources(id) on delete cascade,
  external_document_id varchar(255) not null,
  external_updated_at timestamptz,
  last_sync_job_id varchar(120) references knowledge_connector_sync_jobs(id) on delete set null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index knowledge_connector_document_provenance_document_unique
  on knowledge_connector_document_provenance (connector_id, external_document_id);
create index knowledge_connector_document_provenance_tenant_idx
  on knowledge_connector_document_provenance (tenant_id);
create index knowledge_connector_document_provenance_source_idx
  on knowledge_connector_document_provenance (knowledge_source_id);
