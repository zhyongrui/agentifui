import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import {
  auditLevelEnum,
  authProviderEnum,
  invitationStatusEnum,
  mfaTypeEnum,
  tenants,
  users,
} from './core.js';

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    provider: authProviderEnum('provider').notNull(),
    providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  table => ({
    authIdentityTenantIndex: index('auth_identities_tenant_idx').on(table.tenantId),
    authIdentityUserIndex: index('auth_identities_user_idx').on(table.userId),
  })
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id),
    email: varchar('email', { length: 255 }).notNull(),
    tokenHash: text('token_hash').notNull(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    invitationTenantIndex: index('invitations_tenant_idx').on(table.tenantId),
  })
);

export const mfaFactors = pgTable(
  'mfa_factors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: mfaTypeEnum('type').notNull().default('totp'),
    secretEncrypted: text('secret_encrypted').notNull(),
    enabledAt: timestamp('enabled_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    mfaFactorTenantIndex: index('mfa_factors_tenant_idx').on(table.tenantId),
    mfaFactorUserIndex: index('mfa_factors_user_idx').on(table.userId),
  })
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    action: varchar('action', { length: 120 }).notNull(),
    level: auditLevelEnum('level').notNull().default('info'),
    entityType: varchar('entity_type', { length: 120 }).notNull(),
    entityId: uuid('entity_id'),
    ipAddress: varchar('ip_address', { length: 64 }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    auditTenantIndex: index('audit_events_tenant_idx').on(table.tenantId),
    auditActorIndex: index('audit_events_actor_idx').on(table.actorUserId),
  })
);
