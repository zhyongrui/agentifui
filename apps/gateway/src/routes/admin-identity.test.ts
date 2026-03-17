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

function createAdminIdentityService(canReadPlatformAdmin = false) {
  return {
    canReadAdminForUser: vi.fn().mockResolvedValue(true),
    canReadPlatformAdminForUser: vi.fn().mockResolvedValue(canReadPlatformAdmin),
    listTenantsForUser: vi.fn().mockResolvedValue([]),
    createTenantForUser: vi.fn(),
    updateTenantStatusForUser: vi.fn(),
    listUsersForUser: vi.fn().mockResolvedValue([]),
    listGroupsForUser: vi.fn().mockResolvedValue([]),
    listAppsForUser: vi.fn().mockResolvedValue([]),
    getCleanupStatusForUser: vi.fn().mockResolvedValue({
      policy: {
        archivedConversationRetentionDays: 30,
        shareExpiryDays: 14,
        timelineRetentionDays: 14,
        staleKnowledgeSourceRetentionDays: 30,
      },
      preview: {
        archivedConversations: 0,
        expiredShares: 0,
        orphanedArtifacts: 0,
        coldTimelineEvents: 0,
        staleKnowledgeSources: 0,
        totalCandidates: 0,
        cutoffs: {
          archivedConversationBefore: '2026-03-17T00:00:00.000Z',
          shareCreatedBefore: '2026-03-17T00:00:00.000Z',
          timelineCreatedBefore: '2026-03-17T00:00:00.000Z',
          staleKnowledgeSourceBefore: '2026-03-17T00:00:00.000Z',
        },
      },
      lastRun: null,
    }),
    listUsageForUser: vi.fn().mockResolvedValue({
      tenants: [],
      totals: {
        launchCount: 0,
        runCount: 0,
        succeededRunCount: 0,
        failedRunCount: 0,
        stoppedRunCount: 0,
        messageCount: 0,
        artifactCount: 0,
        uploadedFileCount: 0,
        uploadedBytes: 0,
        artifactBytes: 0,
        totalStorageBytes: 0,
        totalTokens: 0,
        lastActivityAt: null,
      },
    }),
    createAppGrantForUser: vi.fn(),
    revokeAppGrantForUser: vi.fn(),
    listAuditForUser: vi.fn().mockResolvedValue({
      countsByAction: [],
      countsByTenant: [],
      highRiskEventCount: 0,
      events: [],
    }),
    getIdentityOverviewForUser: vi.fn().mockResolvedValue({
      tenant: {
        id: 'tenant-dev',
        slug: 'tenant-dev',
        name: 'Tenant Dev',
        status: 'active',
        createdAt: '2026-03-17T00:00:00.000Z',
        updatedAt: '2026-03-17T00:00:00.000Z',
        userCount: 3,
        groupCount: 2,
        appCount: 5,
        adminCount: 1,
        primaryAdmin: null,
      },
      domainClaims: [],
      pendingAccessRequests: [],
      breakGlassSessions: [],
      governance: {
        tenantId: 'tenant-dev',
        legalHoldEnabled: false,
        retentionOverrideDays: null,
        scimPlanning: {
          enabled: false,
          ownerEmail: null,
          notes: null,
        },
        policyPack: {
          runtimeMode: 'standard',
          sharingMode: 'editor',
          artifactDownloadMode: 'shared_readers',
        },
      },
    }),
    createDomainClaimForUser: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        claim: {
          id: 'claim_123',
          tenantId: 'tenant-dev',
          tenantName: 'Tenant Dev',
          domain: 'contoso.com',
          providerId: 'contoso-sso',
          status: 'pending',
          jitUserStatus: 'pending',
          requestedAt: '2026-03-17T00:00:00.000Z',
          requestedByUserId: 'user-admin',
          reviewedAt: null,
          reviewedByUserId: null,
          reviewReason: null,
        },
      },
    }),
    reviewDomainClaimForUser: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        claim: {
          id: 'claim_123',
          tenantId: 'tenant-dev',
          tenantName: 'Tenant Dev',
          domain: 'contoso.com',
          providerId: 'contoso-sso',
          status: 'approved',
          jitUserStatus: 'pending',
          requestedAt: '2026-03-17T00:00:00.000Z',
          requestedByUserId: 'user-admin',
          reviewedAt: '2026-03-17T00:01:00.000Z',
          reviewedByUserId: 'root-admin',
          reviewReason: null,
        },
      },
    }),
    reviewAccessRequestForUser: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        request: {
          id: 'request_123',
          tenantId: 'tenant-dev',
          tenantName: 'Tenant Dev',
          userId: 'user_pending',
          email: 'pending@contoso.com',
          displayName: 'Pending User',
          source: 'sso_jit',
          status: 'approved',
          requestedAt: '2026-03-17T00:00:00.000Z',
          requestedByUserId: null,
          domainClaimId: 'claim_123',
          reason: null,
          targetTenantId: null,
          targetTenantName: null,
          reviewedAt: '2026-03-17T00:01:00.000Z',
          reviewedByUserId: 'user-admin',
          reviewReason: null,
        },
      },
    }),
    resetUserMfaForUser: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        userId: 'user_123',
        reset: true,
        reason: null,
      },
    }),
    createBreakGlassSessionForUser: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        session: {
          id: 'bg_123',
          tenantId: 'tenant-dev',
          tenantName: 'Tenant Dev',
          actorUserId: 'root-admin',
          actorUserEmail: 'root-admin@iflabx.com',
          reason: 'Emergency',
          justification: null,
          createdAt: '2026-03-17T00:00:00.000Z',
          expiresAt: '2026-03-17T01:00:00.000Z',
          status: 'active',
          reviewedAt: null,
          reviewedByUserId: null,
          reviewNotes: null,
        },
      },
    }),
    updateBreakGlassSessionForUser: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        session: {
          id: 'bg_123',
          tenantId: 'tenant-dev',
          tenantName: 'Tenant Dev',
          actorUserId: 'root-admin',
          actorUserEmail: 'root-admin@iflabx.com',
          reason: 'Emergency',
          justification: null,
          createdAt: '2026-03-17T00:00:00.000Z',
          expiresAt: '2026-03-17T01:00:00.000Z',
          status: 'revoked',
          reviewedAt: '2026-03-17T00:10:00.000Z',
          reviewedByUserId: 'root-admin',
          reviewNotes: null,
        },
      },
    }),
    updateTenantGovernanceForUser: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        governance: {
          tenantId: 'tenant-dev',
          legalHoldEnabled: true,
          retentionOverrideDays: 90,
          scimPlanning: {
            enabled: true,
            ownerEmail: 'ops@example.com',
            notes: null,
          },
          policyPack: {
            runtimeMode: 'strict',
            sharingMode: 'commenter',
            artifactDownloadMode: 'owner_only',
          },
        },
      },
    }),
    resolveSsoProviderForEmail: vi.fn().mockResolvedValue(null),
    capturePendingAccessRequest: vi.fn(),
  };
}

async function loginAs(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  password = 'Secure123'
) {
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email,
      password,
      displayName: 'Admin',
    },
  });

  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email,
      password,
    },
  });

  return response.json().data.sessionToken as string;
}

describe('admin identity routes', () => {
  it('loads identity overview and resets MFA for tenant admins', async () => {
    const authService = createTestAuthService();
    const adminService = createAdminIdentityService(false);
    const app = await buildApp(testEnv, {
      logger: false,
      authService,
      adminService,
    });

    try {
      const sessionToken = await loginAs(app, 'admin@iflabx.com');
      const overviewResponse = await app.inject({
        method: 'GET',
        url: '/admin/identity',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(overviewResponse.statusCode).toBe(200);
      expect(adminService.getIdentityOverviewForUser).toHaveBeenCalled();

      const resetResponse = await app.inject({
        method: 'PUT',
        url: '/admin/identity/users/user_123/mfa/reset',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {},
      });

      expect(resetResponse.statusCode).toBe(200);
      expect(adminService.resetUserMfaForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@iflabx.com',
        }),
        {
          userId: 'user_123',
          reason: undefined,
        }
      );
    } finally {
      await app.close();
    }
  });

  it('allows root admins to review claims, transfer requests, manage break-glass and governance', async () => {
    const authService = createTestAuthService();
    const adminService = createAdminIdentityService(true);
    const app = await buildApp(testEnv, {
      logger: false,
      authService,
      adminService,
    });

    try {
      const sessionToken = await loginAs(app, 'root-admin@iflabx.com');

      const claimResponse = await app.inject({
        method: 'POST',
        url: '/admin/identity/domain-claims',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          tenantId: 'tenant-dev',
          domain: 'contoso.com',
          providerId: 'contoso-sso',
        },
      });

      expect(claimResponse.statusCode).toBe(200);

      const reviewResponse = await app.inject({
        method: 'PUT',
        url: '/admin/identity/domain-claims/claim_123/review',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          status: 'approved',
        },
      });

      expect(reviewResponse.statusCode).toBe(200);

      const transferResponse = await app.inject({
        method: 'PUT',
        url: '/admin/identity/access-requests/request_123/review',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          decision: 'transferred',
          targetTenantId: 'tenant-target',
        },
      });

      expect(transferResponse.statusCode).toBe(200);

      const breakGlassResponse = await app.inject({
        method: 'POST',
        url: '/admin/identity/break-glass',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          tenantId: 'tenant-dev',
          reason: 'Emergency',
        },
      });

      expect(breakGlassResponse.statusCode).toBe(200);

      const revokeResponse = await app.inject({
        method: 'PUT',
        url: '/admin/identity/break-glass/bg_123',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          status: 'revoked',
        },
      });

      expect(revokeResponse.statusCode).toBe(200);

      const governanceResponse = await app.inject({
        method: 'PUT',
        url: '/admin/identity/governance',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          tenantId: 'tenant-dev',
          legalHoldEnabled: true,
        },
      });

      expect(governanceResponse.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
