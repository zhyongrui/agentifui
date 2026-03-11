import type { MfaStatusResponse } from '@agentifui/shared/auth';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAuthService } from '../services/auth-service.js';
import { generateTotpCode } from '../services/totp-service.js';

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

async function registerAndLogin(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email,
      password: 'Secure123',
      displayName: 'Developer',
    },
  });

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email,
      password: 'Secure123',
    },
  });

  return loginResponse.json().data.sessionToken as string;
}

describe('auth mfa routes', () => {
  it('rejects mfa status requests without a bearer token', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/mfa/status',
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

  it('returns the current mfa status for an active user', async () => {
    const { app } = await createTestApp();

    try {
      const sessionToken = await registerAndLogin(app, 'developer@iflabx.com');
      const response = await app.inject({
        method: 'GET',
        url: '/auth/mfa/status',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json() as MfaStatusResponse).toEqual({
        ok: true,
        data: {
          enabled: false,
          enrolledAt: null,
        },
      });
    } finally {
      await app.close();
    }
  });

  it('enables mfa and requires a second step on the next login', async () => {
    const { app } = await createTestApp();

    try {
      const sessionToken = await registerAndLogin(app, 'developer@iflabx.com');

      const setupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(setupResponse.statusCode).toBe(200);

      const setupBody = setupResponse.json();
      const currentCode = generateTotpCode(setupBody.data.manualEntryKey as string);
      const enableResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/enable',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          setupToken: setupBody.data.setupToken,
          code: currentCode,
        },
      });

      expect(enableResponse.statusCode).toBe(200);

      const mfaLoginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'developer@iflabx.com',
          password: 'Secure123',
        },
      });

      expect(mfaLoginResponse.statusCode).toBe(401);
      expect(mfaLoginResponse.json()).toMatchObject({
        ok: false,
        error: {
          code: 'AUTH_MFA_REQUIRED',
        },
      });

      const ticket = (mfaLoginResponse.json().error.details as { ticket: string }).ticket;
      const verifyResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/verify',
        payload: {
          ticket,
          code: currentCode,
        },
      });

      expect(verifyResponse.statusCode).toBe(200);
      expect(verifyResponse.json()).toMatchObject({
        ok: true,
        data: {
          sessionToken: expect.any(String),
          user: {
            email: 'developer@iflabx.com',
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects invalid totp codes during enable and disable', async () => {
    const { app } = await createTestApp();

    try {
      const sessionToken = await registerAndLogin(app, 'developer@iflabx.com');
      const setupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      const setupBody = setupResponse.json();
      const enableResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/enable',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          setupToken: setupBody.data.setupToken,
          code: '000000',
        },
      });

      expect(enableResponse.statusCode).toBe(401);
      expect(enableResponse.json()).toMatchObject({
        ok: false,
        error: {
          code: 'AUTH_MFA_INVALID_CODE',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('disables mfa with the current totp code', async () => {
    const { app } = await createTestApp();

    try {
      const sessionToken = await registerAndLogin(app, 'developer@iflabx.com');
      const setupResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      const setupBody = setupResponse.json();
      const currentCode = generateTotpCode(setupBody.data.manualEntryKey as string);

      await app.inject({
        method: 'POST',
        url: '/auth/mfa/enable',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          setupToken: setupBody.data.setupToken,
          code: currentCode,
        },
      });

      const disableResponse = await app.inject({
        method: 'POST',
        url: '/auth/mfa/disable',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          code: currentCode,
        },
      });

      expect(disableResponse.statusCode).toBe(200);
      expect(disableResponse.json()).toEqual({
        ok: true,
        data: {
          enabled: false,
        },
      });
    } finally {
      await app.close();
    }
  });
});
