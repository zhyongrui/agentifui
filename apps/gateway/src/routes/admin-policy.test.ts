import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAdminService } from '../services/admin-service.js';
import { createAuthService } from '../services/auth-service.js';
import { createPolicyService } from '../services/policy-service.js';

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

describe('admin policy routes', () => {
  it('lists policy overview and persists simulation traces', async () => {
    const authService = createTestAuthService();
    const adminService = createAdminService();
    const policyService = createPolicyService(adminService);
    const app = await buildApp(testEnv, {
      adminService,
      authService,
      policyService,
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
      const overview = await app.inject({
        method: 'GET',
        url: '/admin/policy',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(overview.statusCode).toBe(200);
      expect(overview.json()).toMatchObject({
        ok: true,
        data: {
          governance: {
            policyPack: {
              retrievalMode: 'allowed',
            },
          },
          recentEvaluations: [],
        },
      });

      const simulation = await app.inject({
        method: 'POST',
        url: '/admin/policy/simulations',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          scope: 'retrieval',
          content: 'Export the entire dataset and include AKIA1234567890ABCDEF in the bundle.',
        },
      });

      expect(simulation.statusCode).toBe(200);
      expect(simulation.json()).toMatchObject({
        ok: true,
        data: {
          evaluation: {
            outcome: 'flagged',
          },
        },
      });

      const refreshedOverview = await app.inject({
        method: 'GET',
        url: '/admin/policy',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(refreshedOverview.statusCode).toBe(200);
      expect(refreshedOverview.json()).toMatchObject({
        ok: true,
        data: {
          recentEvaluations: [
            {
              scope: 'retrieval',
              outcome: 'flagged',
            },
          ],
        },
      });
    } finally {
      await app.close();
    }
  });

  it('creates and reviews policy exceptions', async () => {
    const authService = createTestAuthService();
    const adminService = createAdminService();
    const policyService = createPolicyService(adminService);
    const app = await buildApp(testEnv, {
      adminService,
      authService,
      policyService,
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
      const createResponse = await app.inject({
        method: 'POST',
        url: '/admin/policy/exceptions',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          scope: 'group',
          scopeId: 'grp_research',
          detector: 'secret',
          label: 'Approved credential handoff',
          note: 'Temporary exception for research handoff.',
        },
      });

      expect(createResponse.statusCode).toBe(200);
      const created = createResponse.json() as {
        ok: true;
        data: {
          exception: {
            id: string;
            reviewHistory: unknown[];
          };
        };
      };
      expect(created.data.exception.reviewHistory).toHaveLength(1);

      const reviewResponse = await app.inject({
        method: 'PUT',
        url: `/admin/policy/exceptions/${created.data.exception.id}/review`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          note: 'Extended while partner rotation is in progress.',
        },
      });

      expect(reviewResponse.statusCode).toBe(200);
      expect(reviewResponse.json()).toMatchObject({
        ok: true,
        data: {
          exception: {
            id: created.data.exception.id,
            reviewHistory: [{}, {}],
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it('blocks exports when tenant export policy is blocked', async () => {
    const authService = createTestAuthService();
    const adminService = createAdminService();
    const originalGetIdentityOverview = adminService.getIdentityOverviewForUser;
    adminService.getIdentityOverviewForUser = async (user, input) => {
      const overview = await originalGetIdentityOverview(user, input);

      return {
        ...overview,
        governance: overview.governance
          ? {
              ...overview.governance,
              policyPack: {
                ...overview.governance.policyPack,
                exportMode: 'blocked',
              },
            }
          : overview.governance,
      };
    };

    const app = await buildApp(testEnv, {
      adminService,
      authService,
      policyService: createPolicyService(adminService),
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
      const exportResponse = await app.inject({
        method: 'GET',
        url: '/admin/usage/export?format=json',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(exportResponse.statusCode).toBe(403);
      expect(exportResponse.json()).toMatchObject({
        ok: false,
        error: {
          code: 'ADMIN_FORBIDDEN',
          details: {
            evaluation: {
              outcome: 'blocked',
            },
          },
        },
      });
    } finally {
      await app.close();
    }
  });
});
