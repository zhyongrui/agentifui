import { betterAuth } from 'better-auth';
import { Pool } from 'pg';

import { hashPassword, verifyPassword } from './password-hash.js';

type BetterAuthCoreOptions = {
  baseUrl: string;
  connectionString: string;
  defaultTenantId: string;
  secret: string;
};

export async function createBetterAuthCore(options: BetterAuthCoreOptions) {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: 4,
  });

  const auth = betterAuth({
    baseURL: options.baseUrl,
    secret: options.secret,
    database: pool,
    rateLimit: {
      enabled: false,
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      password: {
        hash: async password => hashPassword(password),
        verify: async input => verifyPassword(input.password, input.hash),
      },
    },
    user: {
      modelName: 'users',
      fields: {
        name: 'display_name',
        emailVerified: 'is_email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      additionalFields: {
        tenantId: {
          type: 'string',
          fieldName: 'tenant_id',
          defaultValue: options.defaultTenantId,
          input: false,
        },
        status: {
          type: 'string',
          fieldName: 'status',
          defaultValue: 'active',
          input: false,
        },
        lastLoginAt: {
          type: 'date',
          fieldName: 'last_login_at',
          input: false,
          required: false,
        },
      },
    },
    session: {
      modelName: 'better_auth_sessions',
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    account: {
      modelName: 'better_auth_accounts',
      fields: {
        accountId: 'account_id',
        providerId: 'provider_id',
        userId: 'user_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      modelName: 'better_auth_verifications',
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
  });

  return {
    auth,
    close: async () => {
      await pool.end();
    },
    createSession: async (userId: string) => {
      const context = await auth.$context;
      const session = await context.internalAdapter.createSession(userId);

      return session;
    },
    findSession: async (sessionToken: string) => {
      const context = await auth.$context;

      return context.internalAdapter.findSession(sessionToken);
    },
    hashPassword: async (password: string) => hashPassword(password),
    revokeSession: async (sessionToken: string) => {
      const context = await auth.$context;
      const existingSession = await context.internalAdapter.findSession(sessionToken);

      if (!existingSession) {
        return false;
      }

      await context.internalAdapter.deleteSession(sessionToken);
      return true;
    },
    verifyCredentialPassword: async (input: {
      password: string;
      userId: string;
    }) => {
      const context = await auth.$context;
      const accounts = await context.internalAdapter.findAccounts(input.userId);
      const credentialAccount =
        accounts.find(account => account.providerId === 'credential' && account.password) ??
        null;

      if (credentialAccount?.password) {
        return await context.password.verify({
          password: input.password,
          hash: credentialAccount.password,
        });
      }

      return null;
    },
  };
}

export type BetterAuthCore = Awaited<ReturnType<typeof createBetterAuthCore>>;
