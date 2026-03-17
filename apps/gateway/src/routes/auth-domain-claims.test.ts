import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAuthService } from '../services/auth-service.js';

const testEnv = {
  nodeEnv: 'test' as const,
  host: '127.0.0.1',
  port: 4000,
  corsOrigin: true,
  ssoDomainMap: {},
  defaultTenantId: 'tenant-dev',
  defaultSsoUserStatus: 'pending' as const,
  authLockoutThreshold: 5,
  authLockoutDurationMs: 1800000,
};

function createTestAuthService() {
  return createAuthService({
    defaultTenantId: testEnv.defaultTenantId,
    defaultSsoUserStatus: testEnv.defaultSsoUserStatus,
    lockoutThreshold: testEnv.authLockoutThreshold,
    lockoutDurationMs: testEnv.authLockoutDurationMs,
  });
}

describe('auth domain claims', () => {
  it('uses approved domain claims for sso discovery and queues pending access review', async () => {
    const app = await buildApp(testEnv, {
      logger: false,
      authService: createTestAuthService(),
    });

    try {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'root-admin@iflabx.com',
          password: 'Secure123',
          displayName: 'Root Admin',
        },
      });

      const rootLogin = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'root-admin@iflabx.com',
          password: 'Secure123',
        },
      });
      const rootToken = rootLogin.json().data.sessionToken as string;

      const tenantCreate = await app.inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: {
          authorization: `Bearer ${rootToken}`,
        },
        payload: {
          name: 'Contoso',
          slug: 'contoso',
          adminEmail: 'owner@contoso.com',
        },
      });

      expect(tenantCreate.statusCode).toBe(200);

      const claimCreate = await app.inject({
        method: 'POST',
        url: '/admin/identity/domain-claims',
        headers: {
          authorization: `Bearer ${rootToken}`,
        },
        payload: {
          tenantId: 'tenant-contoso',
          domain: 'contoso.com',
          providerId: 'contoso-sso',
          jitUserStatus: 'pending',
        },
      });

      expect(claimCreate.statusCode).toBe(200);

      const discoveryResponse = await app.inject({
        method: 'POST',
        url: '/auth/sso/discovery',
        payload: {
          email: 'analyst@contoso.com',
        },
      });

      expect(discoveryResponse.statusCode).toBe(200);
      expect(discoveryResponse.json()).toMatchObject({
        ok: true,
        data: {
          domain: 'contoso.com',
          hasSso: true,
          providerId: 'contoso-sso',
        },
      });

      const callbackResponse = await app.inject({
        method: 'POST',
        url: '/auth/sso/callback',
        payload: {
          email: 'analyst@contoso.com',
          providerId: 'contoso-sso',
          displayName: 'Contoso Analyst',
        },
      });

      expect(callbackResponse.statusCode).toBe(200);
      expect(callbackResponse.json()).toMatchObject({
        ok: true,
        data: {
          createdViaJit: true,
          user: {
            tenantId: 'tenant-contoso',
            status: 'pending',
          },
        },
      });

      const identityResponse = await app.inject({
        method: 'GET',
        url: '/admin/identity?tenantId=tenant-contoso',
        headers: {
          authorization: `Bearer ${rootToken}`,
        },
      });

      expect(identityResponse.statusCode).toBe(200);
      expect(identityResponse.json()).toMatchObject({
        ok: true,
        data: {
          pendingAccessRequests: [
            expect.objectContaining({
              email: 'analyst@contoso.com',
              source: 'sso_jit',
              status: 'pending',
            }),
          ],
        },
      });
    } finally {
      await app.close();
    }
  });
});
