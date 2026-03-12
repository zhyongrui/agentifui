import type {
  AdminAppGrantCreateRequest,
  AdminAppSummary,
  AdminAppUserGrant,
  AdminAuditActionCount,
  AdminAuditEventSummary,
  AdminGroupSummary,
  AdminUserSummary,
} from '@agentifui/shared/admin';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import { createAuditService } from '../services/audit-service.js';
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
    userGrants: [],
  },
];

const auditCounts: AdminAuditActionCount[] = [
  {
    action: 'auth.login.succeeded',
    count: 2,
  },
];

const auditEvents: AdminAuditEventSummary[] = [
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
    context: {
      traceId: null,
      runId: null,
      conversationId: null,
      appId: null,
      appName: null,
      activeGroupId: null,
      activeGroupName: null,
    },
  },
];

function createAdminService(canReadAdmin = true) {
  return {
    canReadAdminForUser: vi.fn().mockResolvedValue(canReadAdmin),
    listUsersForUser: vi.fn().mockResolvedValue(adminUsers),
    listGroupsForUser: vi.fn().mockResolvedValue(adminGroups),
    listAppsForUser: vi.fn().mockResolvedValue(adminApps),
    createAppGrantForUser: vi.fn(),
    revokeAppGrantForUser: vi.fn(),
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
      expect(auditResponse.json().data.appliedFilters).toEqual({
        action: null,
        level: null,
        actorUserId: null,
        entityType: null,
        traceId: null,
        runId: null,
        conversationId: null,
        occurredAfter: null,
        occurredBefore: null,
        limit: null,
      });
      expect(adminService.listAuditForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@iflabx.com',
        }),
        {
          action: null,
          level: null,
          actorUserId: null,
          entityType: null,
          traceId: null,
          runId: null,
          conversationId: null,
          occurredAfter: null,
          occurredBefore: null,
          limit: null,
        }
      );
      expect(adminService.canReadAdminForUser).toHaveBeenCalledTimes(4);
    } finally {
      await app.close();
    }
  });

  it('validates admin audit query parameters before calling the service', async () => {
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
      const response = await app.inject({
        method: 'GET',
        url: '/admin/audit?level=verbose',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'ADMIN_INVALID_PAYLOAD',
        },
      });
      expect(adminService.listAuditForUser).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('parses admin audit filters and passes them to the service', async () => {
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
      const response = await app.inject({
        method: 'GET',
        url: '/admin/audit?action=workspace.app.launched&level=info&traceId=trace-123&runId=run-123&limit=12',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(adminService.listAuditForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@iflabx.com',
        }),
        {
          action: 'workspace.app.launched',
          level: 'info',
          actorUserId: null,
          entityType: null,
          traceId: 'trace-123',
          runId: 'run-123',
          conversationId: null,
          occurredAfter: null,
          occurredBefore: null,
          limit: 12,
        }
      );
      expect(response.json().data.appliedFilters).toMatchObject({
        action: 'workspace.app.launched',
        level: 'info',
        traceId: 'trace-123',
        runId: 'run-123',
        limit: 12,
      });
    } finally {
      await app.close();
    }
  });

  it('validates admin app grant payloads before calling the service', async () => {
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
      const response = await app.inject({
        method: 'POST',
        url: '/admin/apps/app_tenant_control/grants',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          subjectUserEmail: '',
          effect: 'allow',
        } satisfies Partial<AdminAppGrantCreateRequest>,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'ADMIN_INVALID_PAYLOAD',
        },
      });
      expect(adminService.createAppGrantForUser).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('creates and revokes direct app grants while recording audit events', async () => {
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

    const createdGrant: AdminAppUserGrant = {
      id: 'grant-1',
      effect: 'allow',
      reason: 'Break glass',
      createdAt: '2026-03-12T00:12:00.000Z',
      expiresAt: null,
      createdByUserId: 'user-admin',
      user: {
        id: 'user-member',
        email: 'member@example.com',
        displayName: 'Member User',
        status: 'active',
      },
    };
    const adminService = createAdminService(true);
    adminService.createAppGrantForUser.mockResolvedValue({
      ok: true,
      data: {
        app: {
          ...adminApps[0],
          directUserGrantCount: 1,
          userGrants: [createdGrant],
        },
        grant: createdGrant,
      },
    });
    adminService.revokeAppGrantForUser.mockResolvedValue({
      ok: true,
      data: {
        app: adminApps[0],
        revokedGrantId: 'grant-1',
        revokedGrant: createdGrant,
      },
    });
    const auditService = createAuditService();
    const app = await buildApp(testEnv, {
      logger: false,
      authService,
      adminService,
      auditService,
    });

    try {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/admin/apps/app_tenant_control/grants',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          subjectUserEmail: 'member@example.com',
          effect: 'allow',
          reason: 'Break glass',
        } satisfies AdminAppGrantCreateRequest,
      });

      expect(createResponse.statusCode).toBe(200);
      expect(createResponse.json()).toMatchObject({
        ok: true,
        data: {
          grant: {
            id: 'grant-1',
          },
        },
      });

      const revokeResponse = await app.inject({
        method: 'DELETE',
        url: '/admin/apps/app_tenant_control/grants/grant-1',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(revokeResponse.statusCode).toBe(200);
      expect(revokeResponse.json()).toMatchObject({
        ok: true,
        data: {
          revokedGrantId: 'grant-1',
        },
      });

      const auditEvents = await auditService.listEvents({
        tenantId: testEnv.defaultTenantId,
      });

      expect(adminService.createAppGrantForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@iflabx.com',
        }),
        {
          appId: 'app_tenant_control',
          subjectUserEmail: 'member@example.com',
          effect: 'allow',
          reason: 'Break glass',
        }
      );
      expect(adminService.revokeAppGrantForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@iflabx.com',
        }),
        {
          appId: 'app_tenant_control',
          grantId: 'grant-1',
        }
      );
      expect(auditEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'admin.workspace_grant.created',
            entityId: 'user-member',
          }),
          expect.objectContaining({
            action: 'admin.workspace_grant.revoked',
            entityId: 'user-member',
          }),
        ])
      );
    } finally {
      await app.close();
    }
  });
});
