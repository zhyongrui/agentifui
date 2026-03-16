alter table if exists workspace_app_tool_overrides
  add column if not exists timeout_ms integer;

alter table if exists workspace_app_tool_overrides
  add column if not exists max_attempts integer;

alter table if exists workspace_app_tool_overrides
  add column if not exists idempotency_scope varchar(32);
