import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { tenants, users } from './core.js';
import { workspaceApps } from './workspace.js';

export const rbacRoleScopeEnum = pgEnum('rbac_role_scope', [
  'platform',
  'tenant',
  'group',
  'user',
]);
export const workspaceGrantSubjectTypeEnum = pgEnum('workspace_grant_subject_type', [
  'group',
  'user',
  'role',
]);
export const workspaceGrantEffectEnum = pgEnum('workspace_grant_effect', ['allow', 'deny']);

export const rbacRoles = pgTable(
  'rbac_roles',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    name: varchar('name', { length: 64 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    description: text('description'),
    scope: rbacRoleScopeEnum('scope').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    rbacRoleNameUnique: uniqueIndex('rbac_roles_name_unique').on(table.name),
    rbacRoleScopeIndex: index('rbac_roles_scope_idx').on(table.scope),
  })
);

export const rbacUserRoles = pgTable(
  'rbac_user_roles',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 120 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: varchar('role_id', { length: 64 })
      .notNull()
      .references(() => rbacRoles.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    rbacUserRoleTenantIndex: index('rbac_user_roles_tenant_idx').on(table.tenantId),
    rbacUserRoleUserIndex: index('rbac_user_roles_user_idx').on(table.userId),
    rbacUserRoleUnique: uniqueIndex('rbac_user_roles_tenant_user_role_unique').on(
      table.tenantId,
      table.userId,
      table.roleId
    ),
  })
);

export const workspaceAppAccessGrants = pgTable(
  'workspace_app_access_grants',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    appId: varchar('app_id', { length: 120 })
      .notNull()
      .references(() => workspaceApps.id, { onDelete: 'cascade' }),
    subjectType: workspaceGrantSubjectTypeEnum('subject_type').notNull(),
    subjectId: varchar('subject_id', { length: 120 }).notNull(),
    effect: workspaceGrantEffectEnum('effect').notNull().default('allow'),
    reason: text('reason'),
    createdByUserId: varchar('created_by_user_id', { length: 120 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    workspaceAppAccessGrantAppIndex: index('workspace_app_access_grants_app_idx').on(table.appId),
    workspaceAppAccessGrantSubjectIndex: index('workspace_app_access_grants_subject_idx').on(
      table.subjectType,
      table.subjectId
    ),
    workspaceAppAccessGrantUnique: uniqueIndex(
      'workspace_app_access_grants_tenant_app_subject_effect_unique'
    ).on(table.tenantId, table.appId, table.subjectType, table.subjectId, table.effect),
  })
);
