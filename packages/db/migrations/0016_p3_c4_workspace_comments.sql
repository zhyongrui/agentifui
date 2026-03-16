create type workspace_comment_target_type as enum ('message', 'run', 'artifact');

create table workspace_comments (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  user_id varchar(120) not null references users(id) on delete cascade,
  conversation_id varchar(120) not null references conversations(id) on delete cascade,
  target_type workspace_comment_target_type not null,
  target_id varchar(120) not null,
  content text not null,
  author_display_name varchar(160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspace_comments_tenant_idx
  on workspace_comments (tenant_id);

create index workspace_comments_conversation_idx
  on workspace_comments (conversation_id, created_at);

create index workspace_comments_target_idx
  on workspace_comments (target_type, target_id, created_at);

create index workspace_comments_user_idx
  on workspace_comments (user_id);
