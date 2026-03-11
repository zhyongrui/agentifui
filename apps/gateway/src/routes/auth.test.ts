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

describe('auth routes', () => {
  it('discovers a configured sso domain', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/sso/discovery',
        payload: {
          email: 'developer@iflabx.com',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ok: true,
        data: {
          domain: 'iflabx.com',
          hasSso: true,
          providerId: 'iflabx-sso',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('creates a pending jit user via sso callback', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/sso/callback',
        payload: {
          email: 'jit@iflabx.com',
          providerId: 'iflabx-sso',
          displayName: 'JIT User',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          providerId: 'iflabx-sso',
          createdViaJit: true,
          user: {
            tenantId: 'tenant-dev',
            email: 'jit@iflabx.com',
            displayName: 'JIT User',
            status: 'pending',
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it('reuses an existing sso user on the next callback', async () => {
    const authService = createTestAuthService({
      defaultSsoUserStatus: 'active',
    });
    const { app } = await createTestApp(authService, {
      defaultSsoUserStatus: 'active',
    });

    try {
      await app.inject({
        method: 'POST',
        url: '/auth/sso/callback',
        payload: {
          email: 'jit@iflabx.com',
          providerId: 'iflabx-sso',
          displayName: 'JIT User',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/sso/callback',
        payload: {
          email: 'jit@iflabx.com',
          providerId: 'iflabx-sso',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          providerId: 'iflabx-sso',
          createdViaJit: false,
          user: {
            email: 'jit@iflabx.com',
            status: 'active',
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects sso callback when the domain provider is not configured', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/sso/callback',
        payload: {
          email: 'jit@iflabx.com',
          providerId: 'unknown-sso',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'AUTH_SSO_NOT_CONFIGURED',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects weak register passwords before persistence exists', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'developer@iflabx.com',
          password: 'weak',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'AUTH_PASSWORD_TOO_WEAK',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('registers a user and returns a login next step', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'developer@iflabx.com',
          password: 'Secure123',
          displayName: 'Developer',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          nextStep: 'login',
          user: {
            tenantId: 'tenant-dev',
            email: 'developer@iflabx.com',
            displayName: 'Developer',
            status: 'active',
            lastLoginAt: null,
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it('logs a registered user in and returns a session token', async () => {
    const { app } = await createTestApp();

    try {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'developer@iflabx.com',
          password: 'Secure123',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'developer@iflabx.com',
          password: 'Secure123',
        },
      });

      const body = response.json();

      expect(response.statusCode).toBe(200);
      expect(body).toMatchObject({
        ok: true,
        data: {
          user: {
            email: 'developer@iflabx.com',
            status: 'active',
          },
        },
      });
      expect(body.data.sessionToken).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it('rejects duplicate registration attempts', async () => {
    const { app } = await createTestApp();

    try {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'developer@iflabx.com',
          password: 'Secure123',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'developer@iflabx.com',
          password: 'Secure123',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'AUTH_EMAIL_ALREADY_EXISTS',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('returns a successful logout payload', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ok: true,
        data: {
          loggedOut: true,
        },
      });
    } finally {
      await app.close();
    }
  });

  it('locks an account after repeated invalid passwords', async () => {
    const { app } = await createTestApp();

    try {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'lockme@iflabx.com',
          password: 'Secure123',
        },
      });

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'lockme@iflabx.com',
            password: 'WrongPass1',
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({
          ok: false,
          error: {
            code: 'AUTH_INVALID_CREDENTIALS',
          },
        });
      }

      const lockedResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'lockme@iflabx.com',
          password: 'WrongPass1',
        },
      });

      expect(lockedResponse.statusCode).toBe(423);
      expect(lockedResponse.json()).toMatchObject({
        ok: false,
        error: {
          code: 'AUTH_ACCOUNT_LOCKED',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('activates a valid invitation and returns an active user payload', async () => {
    const authService = createTestAuthService();
    const invitation = authService.seedInvitation({
      email: 'invitee@iflabx.com',
    });
    const { app } = await createTestApp(authService);

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/invitations/accept',
        payload: {
          token: invitation.data.token,
          password: 'Secure123',
          displayName: 'Invited User',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          activated: true,
          userStatus: 'active',
          nextStep: 'login',
          user: {
            tenantId: 'tenant-dev',
            email: 'invitee@iflabx.com',
            displayName: 'Invited User',
            status: 'active',
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects expired invitation links', async () => {
    const authService = createTestAuthService();
    const invitation = authService.seedInvitation({
      email: 'expired@iflabx.com',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    const { app } = await createTestApp(authService);

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/invitations/accept',
        payload: {
          token: invitation.data.token,
          password: 'Secure123',
        },
      });

      expect(response.statusCode).toBe(410);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'AUTH_INVITE_LINK_EXPIRED',
        },
      });
    } finally {
      await app.close();
    }
  });
});
