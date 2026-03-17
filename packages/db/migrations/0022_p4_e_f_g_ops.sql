do $$
begin
  create type billing_plan_status as enum ('active', 'grace', 'hard_stop');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type billing_adjustment_kind as enum ('credit_grant', 'temporary_limit_raise', 'meter_correction');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type policy_exception_scope as enum ('tenant', 'group', 'app', 'runtime');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type policy_detector_type as enum ('secret', 'pii', 'regulated_term', 'exfiltration_pattern');
exception
  when duplicate_object then null;
end
$$;

create table if not exists tenant_billing_plans (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  name varchar(120) not null,
  currency varchar(8) not null default 'USD',
  monthly_credit_limit integer not null default 1000,
  soft_limit_percent integer not null default 80,
  hard_stop_enabled boolean not null default true,
  grace_credit_buffer integer not null default 100,
  storage_limit_bytes integer not null default 104857600,
  monthly_export_limit integer not null default 100,
  feature_flags jsonb not null default '[]'::jsonb,
  status billing_plan_status not null default 'active',
  updated_by_user_id varchar(120) references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tenant_billing_plans_tenant_unique
  on tenant_billing_plans (tenant_id);
create index if not exists tenant_billing_plans_tenant_idx
  on tenant_billing_plans (tenant_id);

create table if not exists tenant_billing_adjustments (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  kind billing_adjustment_kind not null,
  credit_delta integer not null,
  expires_at timestamptz,
  reason text,
  created_by_user_id varchar(120) references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tenant_billing_adjustments_tenant_idx
  on tenant_billing_adjustments (tenant_id);
create index if not exists tenant_billing_adjustments_expiry_idx
  on tenant_billing_adjustments (tenant_id, expires_at);

create table if not exists tenant_policy_exceptions (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  scope policy_exception_scope not null,
  scope_id varchar(120),
  detector policy_detector_type not null,
  label varchar(255) not null,
  expires_at timestamptz,
  review_history jsonb not null default '[]'::jsonb,
  created_by_user_id varchar(120) references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tenant_policy_exceptions_tenant_idx
  on tenant_policy_exceptions (tenant_id);
create index if not exists tenant_policy_exceptions_scope_idx
  on tenant_policy_exceptions (tenant_id, scope, scope_id);

create table if not exists tenant_policy_evaluations (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  scope varchar(32) not null,
  outcome varchar(32) not null,
  reasons jsonb not null default '[]'::jsonb,
  detector_matches jsonb not null default '[]'::jsonb,
  exception_ids jsonb not null default '[]'::jsonb,
  trace_id varchar(64),
  run_id varchar(120),
  conversation_id varchar(120),
  created_at timestamptz not null default now()
);

create index if not exists tenant_policy_evaluations_tenant_idx
  on tenant_policy_evaluations (tenant_id);
create index if not exists tenant_policy_evaluations_trace_idx
  on tenant_policy_evaluations (trace_id, created_at);

create table if not exists operator_annotations (
  id varchar(120) primary key,
  tenant_id varchar(120) references tenants(id) on delete cascade,
  trace_id varchar(64),
  run_id varchar(120),
  note text not null,
  created_by_user_id varchar(120) references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists operator_annotations_tenant_idx
  on operator_annotations (tenant_id);
create index if not exists operator_annotations_trace_idx
  on operator_annotations (trace_id, created_at);
create index if not exists operator_annotations_run_idx
  on operator_annotations (run_id, created_at);
