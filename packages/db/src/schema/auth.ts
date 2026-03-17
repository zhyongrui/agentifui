import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import {
  auditLevelEnum,
  authProviderEnum,
  invitationStatusEnum,
  mfaTypeEnum,
  tenants,
  userStatusEnum,
  users,
} from './core.js';

export const authSessionStatusEnum = pgEnum('auth_session_status', ['active', 'revoked']);
export const authChallengeKindEnum = pgEnum('auth_challenge_kind', [
  'mfa_setup',
  'mfa_login',
]);
export const ssoDomainClaimStatusEnum = pgEnum('sso_domain_claim_status', [
  'pending',
  'approved',
  'rejected',
]);
export const accessRequestStatusEnum = pgEnum('access_request_status', [
  'pending',
  'approved',
  'rejected',
  'transferred',
]);
export const accessRequestSourceEnum = pgEnum('access_request_source', ['manual', 'sso_jit']);
export const breakGlassSessionStatusEnum = pgEnum('break_glass_session_status', [
  'active',
  'expired',
  'revoked',
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

export const ssoDomainClaims = pgTable(
  'sso_domain_claims',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id),
    domain: varchar('domain', { length: 255 }).notNull(),
    providerId: varchar('provider_id', { length: 120 }).notNull(),
    status: ssoDomainClaimStatusEnum('status').notNull().default('pending'),
    jitUserStatus: userStatusEnum('jit_user_status').notNull().default('pending'),
    requestedByUserId: varchar('requested_by_user_id', { length: 120 })
      .notNull()
      .references(() => users.id),
    reviewReason: text('review_reason'),
    reviewedByUserId: varchar('reviewed_by_user_id', { length: 120 }).references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    ssoDomainClaimsTenantIndex: index('sso_domain_claims_tenant_idx').on(table.tenantId),
    ssoDomainClaimsDomainUnique: uniqueIndex('sso_domain_claims_domain_unique').on(table.domain),
  })
);

export const adminAccessRequests = pgTable(
  'admin_access_requests',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id),
    userId: varchar('user_id', { length: 120 }).references(() => users.id),
    email: varchar('email', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 120 }),
    source: accessRequestSourceEnum('source').notNull().default('manual'),
    status: accessRequestStatusEnum('status').notNull().default('pending'),
    reason: text('reason'),
    domainClaimId: varchar('domain_claim_id', { length: 120 }).references(() => ssoDomainClaims.id),
    targetTenantId: varchar('target_tenant_id', { length: 120 }).references(() => tenants.id),
    requestedByUserId: varchar('requested_by_user_id', { length: 120 }).references(() => users.id),
    reviewedByUserId: varchar('reviewed_by_user_id', { length: 120 }).references(() => users.id),
    reviewReason: text('review_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    adminAccessRequestsTenantIndex: index('admin_access_requests_tenant_idx').on(table.tenantId),
    adminAccessRequestsUserIndex: index('admin_access_requests_user_idx').on(table.userId),
    adminAccessRequestsEmailIndex: index('admin_access_requests_email_idx').on(table.email),
  })
);

export const adminBreakGlassSessions = pgTable(
  'admin_break_glass_sessions',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 120 })
      .notNull()
      .references(() => tenants.id),
    actorUserId: varchar('actor_user_id', { length: 120 })
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    justification: text('justification'),
    status: breakGlassSessionStatusEnum('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    reviewedByUserId: varchar('reviewed_by_user_id', { length: 120 }).references(() => users.id),
    reviewNotes: text('review_notes'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    adminBreakGlassSessionsTenantIndex: index('admin_break_glass_sessions_tenant_idx').on(
      table.tenantId
    ),
    adminBreakGlassSessionsActorIndex: index('admin_break_glass_sessions_actor_idx').on(
      table.actorUserId
    ),
  })
);
