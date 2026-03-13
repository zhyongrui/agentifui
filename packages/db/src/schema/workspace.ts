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
