import {
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
    launchUrl: text('launch_url').notNull(),
    launchedAt: timestamp('launched_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    workspaceAppLaunchesTenantIndex: index('workspace_app_launches_tenant_idx').on(table.tenantId),
    workspaceAppLaunchesUserIndex: index('workspace_app_launches_user_idx').on(table.userId),
    workspaceAppLaunchesAppIndex: index('workspace_app_launches_app_idx').on(table.appId),
  })
);
