create type knowledge_source_kind as enum ('url', 'markdown', 'file');
create type knowledge_source_scope as enum ('tenant', 'group');
create type knowledge_ingestion_status as enum ('queued', 'processing', 'succeeded', 'failed');

create table knowledge_sources (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  group_id varchar(120) references groups(id) on delete set null,
  owner_user_id varchar(120) not null references users(id) on delete cascade,
  title varchar(255) not null,
  source_kind knowledge_source_kind not null,
  source_uri text,
  scope knowledge_source_scope not null,
  labels jsonb not null default '[]'::jsonb,
  status knowledge_ingestion_status not null default 'queued',
  chunk_count integer not null default 0,
  last_error text,
  updated_source_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_sources_tenant_idx on knowledge_sources (tenant_id);
create index knowledge_sources_group_idx on knowledge_sources (group_id);
create index knowledge_sources_owner_idx on knowledge_sources (owner_user_id);
create index knowledge_sources_status_idx on knowledge_sources (tenant_id, status, updated_at);
