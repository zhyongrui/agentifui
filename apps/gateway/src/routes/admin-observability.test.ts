import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAdminService } from '../services/admin-service.js';
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

afterEach(() => {
  // no-op; individual apps are closed in-test to avoid lingering handles on this host
});

describe('admin observability routes', () => {
  it('lists observability data and persists annotations', async () => {
    const authService = createTestAuthService();
    const adminService = createAdminService();
    const app = await buildApp(testEnv, {
      adminService,
      authService,
    });

    authService.register({
      email: 'admin@iflabx.com',
      password: 'Secure123',
      displayName: 'Tenant Admin',
    });
    const login = authService.login({
      email: 'admin@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected login to succeed');
    }

    try {
      const initial = await app.inject({
        method: 'GET',
        url: '/admin/observability',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(initial.statusCode).toBe(200);
      expect(initial.json()).toMatchObject({
        ok: true,
        data: {
          sli: expect.arrayContaining([
            expect.objectContaining({ key: 'auth_latency' }),
            expect.objectContaining({ key: 'launch_latency' }),
            expect.objectContaining({ key: 'chat_latency' }),
            expect.objectContaining({ key: 'run_success_rate' }),
          ]),
          routes: expect.any(Array),
          alerts: expect.any(Array),
          incidentTimeline: expect.any(Array),
          annotations: [],
        },
      });

      const createResponse = await app.inject({
        method: 'POST',
        url: '/admin/observability/annotations',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          tenantId: 'tenant-dev',
          traceId: 'trace-123',
          note: 'Deploy completed for build 42.',
        },
      });

      expect(createResponse.statusCode).toBe(200);
      expect(createResponse.json()).toMatchObject({
        ok: true,
        data: {
          annotation: {
            tenantId: 'tenant-dev',
            traceId: 'trace-123',
            note: 'Deploy completed for build 42.',
          },
        },
      });

      const refreshed = await app.inject({
        method: 'GET',
        url: '/admin/observability',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(refreshed.statusCode).toBe(200);
      expect(refreshed.json()).toMatchObject({
        ok: true,
        data: {
          annotations: [
            expect.objectContaining({
              tenantId: 'tenant-dev',
              traceId: 'trace-123',
              note: 'Deploy completed for build 42.',
            }),
          ],
        },
      });
    } finally {
      await app.close();
    }
  });
});
