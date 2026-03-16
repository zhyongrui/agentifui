alter table workspace_comments
  add column mentions jsonb not null default '[]'::jsonb;

create type workspace_notification_type as enum ('comment_mention');
create type workspace_notification_status as enum ('unread', 'read');

create table workspace_notifications (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  user_id varchar(120) not null references users(id) on delete cascade,
  actor_user_id varchar(120) references users(id) on delete set null,
  type workspace_notification_type not null,
  status workspace_notification_status not null default 'unread',
  conversation_id varchar(120) not null references conversations(id) on delete cascade,
  comment_id varchar(120) not null references workspace_comments(id) on delete cascade,
  target_type workspace_comment_target_type not null,
  target_id varchar(120) not null,
  actor_display_name varchar(160),
  preview text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index workspace_notifications_tenant_idx
  on workspace_notifications (tenant_id);

create index workspace_notifications_user_idx
  on workspace_notifications (user_id, status, created_at);

create index workspace_notifications_conversation_idx
  on workspace_notifications (conversation_id, created_at);

create index workspace_notifications_comment_idx
  on workspace_notifications (comment_id);
