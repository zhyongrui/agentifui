create table if not exists workspace_app_tool_overrides (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  app_id varchar(120) not null references workspace_apps(id) on delete cascade,
  tool_name varchar(160) not null,
  enabled boolean not null,
  updated_by_user_id varchar(120) references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_app_tool_overrides_tenant_app_tool_unique
  on workspace_app_tool_overrides (tenant_id, app_id, tool_name);

create index if not exists workspace_app_tool_overrides_tenant_idx
  on workspace_app_tool_overrides (tenant_id);

create index if not exists workspace_app_tool_overrides_app_idx
  on workspace_app_tool_overrides (app_id);
