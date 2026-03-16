import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { groups, tenants, users } from './core.js';

export const workspaceAppKindEnum = pgEnum('workspace_app_kind', [
  'chat',
  'analysis',
  'automation',
  'governance',
]);
export const workspaceAppStatusEnum = pgEnum('workspace_app_status', ['ready', 'beta']);
export const quotaScopeEnum = pgEnum('quota_scope', ['tenant', 'group', 'user']);
export const workspaceAppLaunchStatusEnum = pgEnum('workspace_app_launch_status', [
  'handoff_ready',
  'conversation_ready',
]);
export const conversationStatusEnum = pgEnum('conversation_status', [
  'active',
  'archived',
  'deleted',
]);
export const conversationShareStatusEnum = pgEnum('conversation_share_status', [
  'active',
  'revoked',
]);
export const conversationShareAccessEnum = pgEnum('conversation_share_access', ['read_only']);
export const runTypeEnum = pgEnum('run_type', ['workflow', 'agent', 'generation']);
export const runStatusEnum = pgEnum('run_status', [
  'pending',
  'running',
  'succeeded',
  'failed',
  'stopped',
]);
export const runTimelineEventTypeEnum = pgEnum('run_timeline_event_type', [
  'run_created',
  'input_recorded',
  'run_started',
  'stop_requested',
  'output_recorded',
  'run_succeeded',
  'run_failed',
  'run_stopped',
]);
export const workspaceArtifactKindEnum = pgEnum('workspace_artifact_kind', [
  'text',
  'markdown',
  'json',
  'table',
  'link',
]);
export const workspaceArtifactSourceEnum = pgEnum('workspace_artifact_source', [
  'assistant_response',
  'tool_output',
  'user_upload',
]);
export const workspaceArtifactStatusEnum = pgEnum('workspace_artifact_status', [
  'draft',
  'stable',
]);
export const knowledgeSourceKindEnum = pgEnum('knowledge_source_kind', [
  'url',
  'markdown',
  'file',
]);
export const knowledgeSourceScopeEnum = pgEnum('knowledge_source_scope', [
  'tenant',
  'group',
]);
export const knowledgeIngestionStatusEnum = pgEnum('knowledge_ingestion_status', [
  'queued',
  'processing',
  'succeeded',
  'failed',
]);
export const knowledgeChunkingStrategyEnum = pgEnum('knowledge_chunking_strategy', [
  'markdown_sections',
  'paragraph_windows',
]);

export const workspaceApps = pgTable(
  'workspace_apps',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    summary: text('summary').notNull(),
    kind: workspaceAppKindEnum('kind').notNull(),
    status: workspaceAppStatusEnum('status').notNull(),
    shortCode: varchar('short_code', { length: 12 }).notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    launchCost: integer('launch_cost').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    workspaceAppTenantSlugUnique: uniqueIndex('workspace_apps_tenant_slug_unique').on(
      table.tenantId,
      table.slug
    ),
    workspaceAppTenantIndex: index('workspace_apps_tenant_idx').on(table.tenantId),
  })
);

export const workspaceGroupAppGrants = pgTable(
  'workspace_group_app_grants',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    groupId: varchar('group_id', { length: 120 })
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    appId: varchar('app_id', { length: 120 })
      .notNull()
      .references(() => workspaceApps.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    workspaceGroupAppGrantUnique: uniqueIndex('workspace_group_app_grants_group_app_unique').on(
      table.groupId,
      table.appId
    ),
    workspaceGroupAppGrantTenantIndex: index('workspace_group_app_grants_tenant_idx').on(
      table.tenantId
    ),
  })
);

export const workspaceAppToolOverrides = pgTable(
  'workspace_app_tool_overrides',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    appId: varchar('app_id', { length: 120 })
      .notNull()
      .references(() => workspaceApps.id, { onDelete: 'cascade' }),
    toolName: varchar('tool_name', { length: 160 }).notNull(),
    enabled: boolean('enabled').notNull(),
    timeoutMs: integer('timeout_ms'),
    maxAttempts: integer('max_attempts'),
    idempotencyScope: varchar('idempotency_scope', { length: 32 }).$type<'conversation' | 'run' | null>(),
    updatedByUserId: varchar('updated_by_user_id', { length: 120 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    workspaceAppToolOverrideUnique: uniqueIndex('workspace_app_tool_overrides_tenant_app_tool_unique').on(
      table.tenantId,
      table.appId,
      table.toolName
    ),
    workspaceAppToolOverrideTenantIndex: index('workspace_app_tool_overrides_tenant_idx').on(
      table.tenantId
    ),
    workspaceAppToolOverrideAppIndex: index('workspace_app_tool_overrides_app_idx').on(table.appId),
  })
);

export const workspaceUserPreferences = pgTable(
  'workspace_user_preferences',
  {
    userId: varchar('user_id', { length: 120 })
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    favoriteAppIds: jsonb('favorite_app_ids').$type<string[]>().notNull().default([]),
    recentAppIds: jsonb('recent_app_ids').$type<string[]>().notNull().default([]),
    defaultActiveGroupId: varchar('default_active_group_id', { length: 120 }).references(
      () => groups.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    workspaceUserPreferencesTenantIndex: index('workspace_user_preferences_tenant_idx').on(
      table.tenantId
    ),
  })
);

export const workspaceQuotaLimits = pgTable(
  'workspace_quota_limits',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    scope: quotaScopeEnum('scope').notNull(),
    scopeId: varchar('scope_id', { length: 120 }).notNull(),
    scopeLabel: varchar('scope_label', { length: 120 }).notNull(),
    monthlyLimit: integer('monthly_limit').notNull().default(1000),
    baseUsed: integer('base_used').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    workspaceQuotaLimitsTenantScopeUnique: uniqueIndex('workspace_quota_limits_tenant_scope_unique').on(
      table.tenantId,
      table.scope,
      table.scopeId
    ),
    workspaceQuotaLimitsTenantIndex: index('workspace_quota_limits_tenant_idx').on(table.tenantId),
  })
);

export const conversations = pgTable(
  'conversations',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 120 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: varchar('app_id', { length: 120 })
      .notNull()
      .references(() => workspaceApps.id, { onDelete: 'cascade' }),
    activeGroupId: varchar('active_group_id', { length: 120 }).references(() => groups.id, {
      onDelete: 'set null',
    }),
    externalId: varchar('external_id', { length: 255 }),
    title: varchar('title', { length: 512 }).notNull(),
    status: conversationStatusEnum('status').notNull().default('active'),
    pinned: boolean('pinned').notNull().default(false),
    clientId: text('client_id'),
    inputs: jsonb('inputs').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    conversationsTenantUserIndex: index('conversations_tenant_user_idx').on(
      table.tenantId,
      table.userId
    ),
    conversationsAppIndex: index('conversations_app_idx').on(table.appId),
    conversationsUserUpdatedIndex: index('conversations_user_updated_idx').on(
      table.userId,
      table.updatedAt
    ),
    conversationsClientIdUnique: uniqueIndex('conversations_client_id_unique').on(table.clientId),
  })
);

export const runs = pgTable(
  'runs',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: varchar('conversation_id', { length: 120 })
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    appId: varchar('app_id', { length: 120 })
      .notNull()
      .references(() => workspaceApps.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 120 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeGroupId: varchar('active_group_id', { length: 120 }).references(() => groups.id, {
      onDelete: 'set null',
    }),
    type: runTypeEnum('type').notNull(),
    triggeredFrom: varchar('triggered_from', { length: 32 }).notNull().default('app_launch'),
    status: runStatusEnum('status').notNull().default('pending'),
    inputs: jsonb('inputs').$type<Record<string, unknown>>().notNull().default({}),
    outputs: jsonb('outputs').$type<Record<string, unknown>>().notNull().default({}),
    error: text('error'),
    elapsedTime: integer('elapsed_time').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    totalSteps: integer('total_steps').notNull().default(0),
    traceId: varchar('trace_id', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  table => ({
    runsTenantAppIndex: index('runs_tenant_app_idx').on(table.tenantId, table.appId),
    runsConversationIndex: index('runs_conversation_idx').on(table.conversationId),
    runsTraceIndex: uniqueIndex('runs_trace_id_unique').on(table.traceId),
    runsUserCreatedIndex: index('runs_user_created_idx').on(table.userId, table.createdAt),
  })
);

export const runTimelineEvents = pgTable(
  'run_timeline_events',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 120 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: varchar('conversation_id', { length: 120 })
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    runId: varchar('run_id', { length: 120 })
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    eventType: runTimelineEventTypeEnum('event_type').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    runTimelineEventsTenantIndex: index('run_timeline_events_tenant_idx').on(table.tenantId),
    runTimelineEventsRunIndex: index('run_timeline_events_run_idx').on(
      table.runId,
      table.createdAt
    ),
    runTimelineEventsConversationIndex: index('run_timeline_events_conversation_idx').on(
      table.conversationId,
      table.createdAt
    ),
  })
);

export const workspaceUploadedFiles = pgTable(
  'workspace_uploaded_files',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 120 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: varchar('conversation_id', { length: 120 })
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    storageProvider: varchar('storage_provider', { length: 32 }).notNull(),
    storageKey: text('storage_key').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 255 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    workspaceUploadedFilesTenantIndex: index('workspace_uploaded_files_tenant_idx').on(table.tenantId),
    workspaceUploadedFilesUserIndex: index('workspace_uploaded_files_user_idx').on(table.userId),
    workspaceUploadedFilesConversationIndex: index(
      'workspace_uploaded_files_conversation_idx'
    ).on(table.conversationId),
    workspaceUploadedFilesStorageKeyUnique: uniqueIndex(
      'workspace_uploaded_files_storage_key_unique'
    ).on(table.storageKey),
  })
);

export const workspaceArtifacts = pgTable(
  'workspace_artifacts',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 120 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: varchar('conversation_id', { length: 120 })
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    runId: varchar('run_id', { length: 120 })
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull().default(0),
    title: varchar('title', { length: 255 }).notNull(),
    kind: workspaceArtifactKindEnum('kind').notNull(),
    source: workspaceArtifactSourceEnum('source').notNull(),
    status: workspaceArtifactStatusEnum('status').notNull().default('draft'),
    summary: text('summary'),
    mimeType: varchar('mime_type', { length: 255 }),
    sizeBytes: integer('size_bytes'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    workspaceArtifactsTenantIndex: index('workspace_artifacts_tenant_idx').on(table.tenantId),
    workspaceArtifactsUserIndex: index('workspace_artifacts_user_idx').on(table.userId),
    workspaceArtifactsConversationIndex: index('workspace_artifacts_conversation_idx').on(
      table.conversationId
    ),
    workspaceArtifactsRunIndex: index('workspace_artifacts_run_idx').on(
      table.runId,
      table.sequence
    ),
  })
);

export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    groupId: varchar('group_id', { length: 120 }).references(() => groups.id, {
      onDelete: 'set null',
    }),
    ownerUserId: varchar('owner_user_id', { length: 120 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    sourceKind: knowledgeSourceKindEnum('source_kind').notNull(),
    sourceUri: text('source_uri'),
    sourceContent: text('source_content'),
    scope: knowledgeSourceScopeEnum('scope').notNull(),
    labels: jsonb('labels').$type<string[]>().notNull().default([]),
    status: knowledgeIngestionStatusEnum('status').notNull().default('queued'),
    chunkingStrategy: knowledgeChunkingStrategyEnum('chunking_strategy')
      .notNull()
      .default('paragraph_windows'),
    chunkTargetChars: integer('chunk_target_chars').notNull().default(1000),
    chunkOverlapChars: integer('chunk_overlap_chars').notNull().default(120),
    chunkCount: integer('chunk_count').notNull().default(0),
    lastChunkedAt: timestamp('last_chunked_at', { withTimezone: true }),
    lastError: text('last_error'),
    updatedSourceAt: timestamp('updated_source_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    knowledgeSourcesTenantIndex: index('knowledge_sources_tenant_idx').on(table.tenantId),
    knowledgeSourcesGroupIndex: index('knowledge_sources_group_idx').on(table.groupId),
    knowledgeSourcesOwnerIndex: index('knowledge_sources_owner_idx').on(table.ownerUserId),
    knowledgeSourcesStatusIndex: index('knowledge_sources_status_idx').on(
      table.tenantId,
      table.status,
      table.updatedAt
    ),
  })
);

export const knowledgeSourceChunks = pgTable(
  'knowledge_source_chunks',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sourceId: varchar('source_id', { length: 120 })
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    strategy: knowledgeChunkingStrategyEnum('strategy').notNull(),
    headingPath: jsonb('heading_path').$type<string[]>().notNull().default([]),
    preview: text('preview').notNull(),
    content: text('content').notNull(),
    charCount: integer('char_count').notNull(),
    tokenEstimate: integer('token_estimate').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    knowledgeSourceChunksTenantIndex: index('knowledge_source_chunks_tenant_idx').on(table.tenantId),
    knowledgeSourceChunksSourceIndex: index('knowledge_source_chunks_source_idx').on(
      table.sourceId,
      table.sequence
    ),
  })
);

export const workspaceAppLaunches = pgTable(
  'workspace_app_launches',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 120 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: varchar('app_id', { length: 120 })
      .notNull()
      .references(() => workspaceApps.id, { onDelete: 'cascade' }),
    attributedGroupId: varchar('attributed_group_id', { length: 120 })
      .notNull()
      .references(() => groups.id, { onDelete: 'restrict' }),
    status: workspaceAppLaunchStatusEnum('status').notNull().default('handoff_ready'),
    conversationId: varchar('conversation_id', { length: 120 }).references(() => conversations.id, {
      onDelete: 'set null',
    }),
    runId: varchar('run_id', { length: 120 }).references(() => runs.id, {
      onDelete: 'set null',
    }),
    traceId: varchar('trace_id', { length: 64 }),
    launchUrl: text('launch_url').notNull(),
    launchedAt: timestamp('launched_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    workspaceAppLaunchesTenantIndex: index('workspace_app_launches_tenant_idx').on(table.tenantId),
    workspaceAppLaunchesUserIndex: index('workspace_app_launches_user_idx').on(table.userId),
    workspaceAppLaunchesAppIndex: index('workspace_app_launches_app_idx').on(table.appId),
    workspaceAppLaunchesConversationIndex: index('workspace_app_launches_conversation_idx').on(
      table.conversationId
    ),
  })
);

export const workspaceConversationShares = pgTable(
  'workspace_conversation_shares',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: varchar('conversation_id', { length: 120 })
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    creatorUserId: varchar('creator_user_id', { length: 120 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sharedGroupId: varchar('shared_group_id', { length: 120 })
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    status: conversationShareStatusEnum('status').notNull().default('active'),
    access: conversationShareAccessEnum('access').notNull().default('read_only'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  table => ({
    workspaceConversationSharesTenantIndex: index('workspace_conversation_shares_tenant_idx').on(
      table.tenantId
    ),
    workspaceConversationSharesConversationIndex: index(
      'workspace_conversation_shares_conversation_idx'
    ).on(table.conversationId),
    workspaceConversationSharesSharedGroupIndex: index(
      'workspace_conversation_shares_shared_group_idx'
    ).on(table.sharedGroupId),
    workspaceConversationSharesConversationGroupUnique: uniqueIndex(
      'workspace_conversation_shares_conversation_group_unique'
    ).on(table.conversationId, table.sharedGroupId),
  })
);
