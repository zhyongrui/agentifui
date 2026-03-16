create type knowledge_chunking_strategy as enum ('markdown_sections', 'paragraph_windows');

alter table knowledge_sources
  add column if not exists source_content text,
  add column if not exists chunking_strategy knowledge_chunking_strategy not null default 'paragraph_windows',
  add column if not exists chunk_target_chars integer not null default 1000,
  add column if not exists chunk_overlap_chars integer not null default 120,
  add column if not exists last_chunked_at timestamptz;

create table if not exists knowledge_source_chunks (
  id varchar(120) primary key,
  tenant_id varchar(120) not null references tenants(id) on delete cascade,
  source_id varchar(120) not null references knowledge_sources(id) on delete cascade,
  sequence integer not null,
  strategy knowledge_chunking_strategy not null,
  heading_path jsonb not null default '[]'::jsonb,
  preview text not null,
  content text not null,
  char_count integer not null,
  token_estimate integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_source_chunks_tenant_idx
  on knowledge_source_chunks (tenant_id);

create index if not exists knowledge_source_chunks_source_idx
  on knowledge_source_chunks (source_id, sequence);
