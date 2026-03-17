alter type run_timeline_event_type add value if not exists 'branch_created';
alter type run_timeline_event_type add value if not exists 'plan_step_updated';
alter type run_timeline_event_type add value if not exists 'workflow_paused';
alter type run_timeline_event_type add value if not exists 'workflow_resumed';

create type workflow_version_status as enum ('draft', 'published', 'archived', 'rolled_back');
create type workflow_permission_role as enum ('author', 'reviewer', 'publisher', 'runner');

create table workflow_definitions (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  slug varchar(120) not null,
  title varchar(255) not null,
  description text,
  current_version_id varchar(120),
  created_by_user_id varchar(120) not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workflow_definitions_tenant_slug_unique
  on workflow_definitions (tenant_id, slug);
create index workflow_definitions_tenant_idx
  on workflow_definitions (tenant_id);

create table workflow_definition_versions (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  workflow_id varchar(120) not null references workflow_definitions(id) on delete cascade,
  version_number integer not null,
  status workflow_version_status not null default 'draft',
  rolled_back_from_version_id varchar(120),
  document jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workflow_definition_versions_workflow_version_unique
  on workflow_definition_versions (workflow_id, version_number);
create index workflow_definition_versions_tenant_idx
  on workflow_definition_versions (tenant_id);
create index workflow_definition_versions_workflow_idx
  on workflow_definition_versions (workflow_id, created_at);

create table workflow_definition_permissions (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  workflow_id varchar(120) not null references workflow_definitions(id) on delete cascade,
  user_email varchar(255) not null,
  role workflow_permission_role not null,
  created_at timestamptz not null default now()
);

create unique index workflow_definition_permissions_workflow_user_role_unique
  on workflow_definition_permissions (workflow_id, user_email, role);
create index workflow_definition_permissions_tenant_idx
  on workflow_definition_permissions (tenant_id);
