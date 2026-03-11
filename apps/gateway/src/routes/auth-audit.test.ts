import type { AuthAuditListResponse } from '@agentifui/shared/auth';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAuthService } from '../services/auth-service.js';

const testEnv: {
  nodeEnv: 'test';
  host: string;
  port: number;
  corsOrigin: boolean;
  ssoDomainMap: Record<string, string>;
  defaultTenantId: string;
  defaultSsoUserStatus: 'pending' | 'active';
  authLockoutThreshold: number;
  authLockoutDurationMs: number;
} = {
  nodeEnv: 'test' as const,
  host: '127.0.0.1',
  port: 4000,
  corsOrigin: true,
  ssoDomainMap: {
    'iflabx.com': 'iflabx-sso',
  },
  defaultTenantId: 'tenant-dev',
  defaultSsoUserStatus: 'pending',
  authLockoutThreshold: 5,
  authLockoutDurationMs: 1800000,
};

function createTestAuthService(overrides: Partial<Parameters<typeof createAuthService>[0]> = {}) {
  return createAuthService({
    defaultTenantId: testEnv.defaultTenantId,
    defaultSsoUserStatus: testEnv.defaultSsoUserStatus,
    lockoutThreshold: testEnv.authLockoutThreshold,
    lockoutDurationMs: testEnv.authLockoutDurationMs,
    ...overrides,
  });
}

async function createTestApp(
  authService = createTestAuthService(),
  envOverrides: Partial<typeof testEnv> = {}
) {
  const app = await buildApp(
    {
      ...testEnv,
      ...envOverrides,
    },
    {
      logger: false,
      authService,
    }
  );

  return {
    app,
    authService,
  };
}

describe('auth audit routes', () => {
  it('rejects audit queries without a bearer token', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/audit-events',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'AUTH_UNAUTHORIZED',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects audit queries for pending users', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);
    const login = authService.loginWithSso({
      email: 'pending@iflabx.com',
      providerId: 'iflabx-sso',
      displayName: 'Pending User',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected pending sso login to succeed');
    }

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/audit-events',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'AUTH_FORBIDDEN',
          details: {
            status: 'pending',
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it('records successful login and logout events', async () => {
    const { app } = await createTestApp();

    try {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'developer@iflabx.com',
          password: 'Secure123',
          displayName: 'Developer',
        },
      });

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'developer@iflabx.com',
          password: 'Secure123',
        },
      });

      expect(loginResponse.statusCode).toBe(200);

      const loginBody = loginResponse.json();
      const sessionToken = loginBody.data.sessionToken as string;

      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(logoutResponse.statusCode).toBe(200);

      const auditResponse = await app.inject({
        method: 'GET',
        url: '/auth/audit-events',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(auditResponse.statusCode).toBe(200);

      const body = auditResponse.json() as AuthAuditListResponse;

      expect(body.data.events.map(event => event.action)).toEqual([
        'auth.logout.succeeded',
        'auth.login.succeeded',
      ]);
      expect(body.data.events[0]).toMatchObject({
        actorUserId: loginBody.data.user.id,
        entityId: sessionToken,
      });
      expect(body.data.events[1]).toMatchObject({
        actorUserId: loginBody.data.user.id,
        entityId: sessionToken,
        payload: {
          email: 'developer@iflabx.com',
          authMethod: 'password',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('records failed password logins as warning events', async () => {
    const { app } = await createTestApp();

    try {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'developer@iflabx.com',
          password: 'Secure123',
          displayName: 'Developer',
        },
      });

      const failedLoginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'developer@iflabx.com',
          password: 'WrongPass1',
        },
      });

      expect(failedLoginResponse.statusCode).toBe(401);

      const successLoginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'developer@iflabx.com',
          password: 'Secure123',
        },
      });

      expect(successLoginResponse.statusCode).toBe(200);

      const sessionToken = successLoginResponse.json().data.sessionToken as string;
      const auditResponse = await app.inject({
        method: 'GET',
        url: '/auth/audit-events',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(auditResponse.statusCode).toBe(200);

      const body = auditResponse.json() as AuthAuditListResponse;
      const failedEvent = body.data.events.find(event => event.action === 'auth.login.failed');

      expect(failedEvent).toMatchObject({
        level: 'warning',
        entityType: 'user',
        payload: {
          email: 'developer@iflabx.com',
          code: 'AUTH_INVALID_CREDENTIALS',
        },
      });
    } finally {
      await app.close();
    }
  });
});
