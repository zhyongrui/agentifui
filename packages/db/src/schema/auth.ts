import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import {
  auditLevelEnum,
  authProviderEnum,
  invitationStatusEnum,
  mfaTypeEnum,
  tenants,
  users,
} from './core.js';

export const authSessionStatusEnum = pgEnum('auth_session_status', ['active', 'revoked']);
export const authChallengeKindEnum = pgEnum('auth_challenge_kind', [
  'mfa_setup',
  'mfa_login',
]);

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id),
    userId: varchar('user_id', { length: 120 })
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
    authIdentityProviderUnique: uniqueIndex('auth_identities_provider_user_unique').on(
      table.provider,
      table.providerUserId
    ),
  })
);

export const invitations = pgTable(
  'invitations',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id),
    invitedByUserId: varchar('invited_by_user_id', { length: 120 }).references(() => users.id),
    email: varchar('email', { length: 255 }).notNull(),
    tokenHash: text('token_hash').notNull(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    invitationTenantIndex: index('invitations_tenant_idx').on(table.tenantId),
    invitationTokenHashUnique: uniqueIndex('invitations_token_hash_unique').on(table.tokenHash),
  })
);

export const mfaFactors = pgTable(
  'mfa_factors',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id),
    userId: varchar('user_id', { length: 120 })
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
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 }).references(() => tenants.id),
    actorUserId: varchar('actor_user_id', { length: 120 }).references(() => users.id),
    action: varchar('action', { length: 120 }).notNull(),
    level: auditLevelEnum('level').notNull().default('info'),
    entityType: varchar('entity_type', { length: 120 }).notNull(),
    entityId: varchar('entity_id', { length: 120 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    auditTenantIndex: index('audit_events_tenant_idx').on(table.tenantId),
    auditActorIndex: index('audit_events_actor_idx').on(table.actorUserId),
  })
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id),
    userId: varchar('user_id', { length: 120 })
      .notNull()
      .references(() => users.id),
    sessionTokenHash: text('session_token_hash').notNull(),
    status: authSessionStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  table => ({
    authSessionUserIndex: index('auth_sessions_user_idx').on(table.userId),
    authSessionTokenHashUnique: uniqueIndex('auth_sessions_token_hash_unique').on(
      table.sessionTokenHash
    ),
  })
);

export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id),
    userId: varchar('user_id', { length: 120 }).references(() => users.id),
    email: varchar('email', { length: 255 }),
    kind: authChallengeKindEnum('kind').notNull(),
    tokenHash: text('token_hash').notNull(),
    secretEncrypted: text('secret_encrypted'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    authChallengeUserIndex: index('auth_challenges_user_idx').on(table.userId),
    authChallengeTokenHashUnique: uniqueIndex('auth_challenges_token_hash_unique').on(
      table.tokenHash
    ),
  })
);
