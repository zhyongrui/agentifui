import { index, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { users } from './core.js';

export const betterAuthAccounts = pgTable(
  'better_auth_accounts',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    providerId: varchar('provider_id', { length: 120 }).notNull(),
    userId: varchar('user_id', { length: 120 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    betterAuthAccountUserIndex: index('better_auth_accounts_user_idx').on(table.userId),
    betterAuthAccountProviderUnique: uniqueIndex(
      'better_auth_accounts_provider_account_unique'
    ).on(table.providerId, table.accountId),
  })
);

export const betterAuthSessions = pgTable(
  'better_auth_sessions',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    userId: varchar('user_id', { length: 120 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    betterAuthSessionUserIndex: index('better_auth_sessions_user_idx').on(table.userId),
    betterAuthSessionTokenUnique: uniqueIndex('better_auth_sessions_token_unique').on(
      table.token
    ),
  })
);

export const betterAuthVerifications = pgTable(
  'better_auth_verifications',
  {
    id: varchar('id', { length: 120 }).primaryKey(),
    identifier: varchar('identifier', { length: 255 }).notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    betterAuthVerificationIdentifierUnique: uniqueIndex(
      'better_auth_verifications_identifier_unique'
    ).on(table.identifier),
  })
);
