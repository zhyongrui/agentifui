import type {
  AdminAppSummary,
  AdminAuditActionCount,
  AdminGroupSummary,
  AdminUserSummary,
} from '@agentifui/shared/admin';
import type { AuthAuditEvent } from '@agentifui/shared/auth';
import { describe, expect, it, vi } from 'vitest';

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

const adminUsers: AdminUserSummary[] = [
  {
    id: 'user-admin',
    email: 'admin@iflabx.com',
    displayName: 'Admin User',
    status: 'active',
    createdAt: '2026-03-12T00:00:00.000Z',
    lastLoginAt: '2026-03-12T00:05:00.000Z',
    mfaEnabled: true,
    roleIds: ['tenant_admin', 'user'],
    groupMemberships: [
      {
        groupId: 'grp_product',
        groupName: 'Product Studio',
        role: 'manager',
        isPrimary: true,
      },
    ],
  },
];

const adminGroups: AdminGroupSummary[] = [
  {
    id: 'grp_product',
    name: 'Product Studio',
    description: 'Product group',
    memberCount: 2,
    managerCount: 1,
    primaryMemberCount: 1,
    appGrants: [
      {
        id: 'app_service_copilot',
        slug: 'service-copilot',
        name: 'Service Copilot',
        shortCode: 'SC',
        status: 'ready',
      },
    ],
  },
];

const adminApps: AdminAppSummary[] = [
  {
    id: 'app_tenant_control',
    slug: 'tenant-control',
    name: 'Tenant Control',
    summary: 'Admin console',
    kind: 'governance',
    status: 'beta',
    shortCode: 'TC',
    launchCost: 12,
    grantedGroups: [],
    grantedRoleIds: ['tenant_admin'],
    directUserGrantCount: 0,
    denyGrantCount: 0,
    launchCount: 1,
    lastLaunchedAt: '2026-03-12T00:10:00.000Z',
  },
];

const auditCounts: AdminAuditActionCount[] = [
  {
    action: 'auth.login.succeeded',
    count: 2,
  },
];

const auditEvents: AuthAuditEvent[] = [
  {
    id: 'audit-1',
    tenantId: 'tenant-dev',
    actorUserId: 'user-admin',
    action: 'auth.login.succeeded',
    level: 'info',
    entityType: 'session',
    entityId: 'session-1',
    ipAddress: '127.0.0.1',
    payload: {
      email: 'admin@iflabx.com',
    },
    occurredAt: '2026-03-12T00:10:00.000Z',
  },
];

function createAdminService(canReadAdmin = true) {
  return {
    canReadAdminForUser: vi.fn().mockResolvedValue(canReadAdmin),
    listUsersForUser: vi.fn().mockResolvedValue(adminUsers),
    listGroupsForUser: vi.fn().mockResolvedValue(adminGroups),
    listAppsForUser: vi.fn().mockResolvedValue(adminApps),
    listAuditForUser: vi.fn().mockResolvedValue({
      countsByAction: auditCounts,
      events: auditEvents,
    }),
  };
}

describe('admin routes', () => {
  it('rejects requests without a bearer token', async () => {
    const app = await buildApp(testEnv, {
      logger: false,
      adminService: createAdminService(),
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/users',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'ADMIN_UNAUTHORIZED',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects active users without tenant admin access', async () => {
    const authService = createTestAuthService();
    authService.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });
    const login = authService.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected active login to succeed');
    }

    const app = await buildApp(testEnv, {
      logger: false,
      authService,
      adminService: createAdminService(false),
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'ADMIN_FORBIDDEN',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('returns real admin payloads for an authorized admin session', async () => {
    const authService = createTestAuthService();
    authService.register({
      email: 'admin@iflabx.com',
      password: 'Secure123',
      displayName: 'Admin User',
    });
    const login = authService.login({
      email: 'admin@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected admin login to succeed');
    }

    const adminService = createAdminService(true);
    const app = await buildApp(testEnv, {
      logger: false,
      authService,
      adminService,
    });

    try {
      const [usersResponse, groupsResponse, appsResponse, auditResponse] = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/admin/users',
          headers: {
            authorization: `Bearer ${login.data.sessionToken}`,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/admin/groups',
          headers: {
            authorization: `Bearer ${login.data.sessionToken}`,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/admin/apps',
          headers: {
            authorization: `Bearer ${login.data.sessionToken}`,
          },
        }),
        app.inject({
          method: 'GET',
          url: '/admin/audit',
          headers: {
            authorization: `Bearer ${login.data.sessionToken}`,
          },
        }),
      ]);

      expect(usersResponse.statusCode).toBe(200);
      expect(groupsResponse.statusCode).toBe(200);
      expect(appsResponse.statusCode).toBe(200);
      expect(auditResponse.statusCode).toBe(200);

      expect(usersResponse.json().data.users).toEqual(adminUsers);
      expect(groupsResponse.json().data.groups).toEqual(adminGroups);
      expect(appsResponse.json().data.apps).toEqual(adminApps);
      expect(auditResponse.json().data.events).toEqual(auditEvents);
      expect(adminService.canReadAdminForUser).toHaveBeenCalledTimes(4);
    } finally {
      await app.close();
    }
  });
});
