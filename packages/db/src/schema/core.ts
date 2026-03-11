import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended']);
export const userStatusEnum = pgEnum('user_status', [
  'pending',
  'active',
  'suspended',
]);
export const groupMemberRoleEnum = pgEnum('group_member_role', [
  'member',
  'manager',
]);
export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'expired',
  'revoked',
]);
export const authProviderEnum = pgEnum('auth_provider', ['password', 'sso']);
export const mfaTypeEnum = pgEnum('mfa_type', ['totp']);
export const auditLevelEnum = pgEnum('audit_level', ['info', 'warning', 'critical']);

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    status: tenantStatusEnum('status').notNull().default('active'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    tenantSlugUnique: uniqueIndex('tenants_slug_unique').on(table.slug),
  })
);

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    groupTenantSlugUnique: uniqueIndex('groups_tenant_slug_unique').on(
      table.tenantId,
      table.slug
    ),
    groupTenantIndex: index('groups_tenant_idx').on(table.tenantId),
  })
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    email: varchar('email', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 120 }).notNull(),
    status: userStatusEnum('status').notNull().default('pending'),
    passwordHash: text('password_hash'),
    isEmailVerified: boolean('is_email_verified').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    userTenantEmailUnique: uniqueIndex('users_tenant_email_unique').on(
      table.tenantId,
      table.email
    ),
    userTenantIndex: index('users_tenant_idx').on(table.tenantId),
  })
);

export const groupMembers = pgTable(
  'group_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: groupMemberRoleEnum('role').notNull().default('member'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    groupMemberUnique: uniqueIndex('group_members_group_user_unique').on(
      table.groupId,
      table.userId
    ),
    groupMemberTenantIndex: index('group_members_tenant_idx').on(table.tenantId),
  })
);
