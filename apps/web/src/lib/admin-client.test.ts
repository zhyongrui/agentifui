import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAdminBreakGlassSession,
  createAdminObservabilityAnnotation,
  createAdminDomainClaim,
  createAdminTenant,
  createAdminWorkflow,
  createAdminAppGrant,
  createAdminBillingAdjustment,
  createAdminSource,
  dryRunAdminWorkflow,
  exportAdminAudit,
  exportAdminBilling,
  exportAdminWorkflow,
  exportAdminUsage,
  fetchAdminApps,
  fetchAdminAudit,
  fetchAdminBilling,
  fetchAdminWorkflows,
  fetchAdminContext,
  fetchAdminGroups,
  fetchAdminIdentity,
  fetchAdminObservability,
  fetchAdminPolicy,
  importAdminWorkflow,
  fetchAdminSources,
  fetchAdminTenants,
  fetchAdminUsage,
  fetchAdminUsers,
  publishAdminWorkflow,
  resetAdminUserMfa,
  rollbackAdminWorkflow,
  reviewAdminAccessRequest,
  reviewAdminDomainClaim,
  reviewAdminPolicyException,
  revokeAdminAppGrant,
  simulateAdminPolicy,
  updateAdminBillingPlan,
  updateAdminWorkflow,
  updateAdminWorkflowPermissions,
  updateAdminBreakGlassSession,
  updateAdminAppTools,
  updateAdminSourceStatus,
  updateAdminTenantGovernance,
  updateAdminTenantStatus,
  createAdminPolicyException,
} from './admin-client.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('admin client', () => {
  it('loads admin context, users and platform tenants through the same-origin gateway proxy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-12T00:00:00.000Z',
            capabilities: {
              canReadAdmin: true,
              canReadPlatformAdmin: true,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-12T00:00:00.000Z',
            users: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-12T00:00:00.000Z',
            tenants: [],
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const [contextResult, usersResult, tenantsResult] = await Promise.all([
      fetchAdminContext('session-123'),
      fetchAdminUsers('session-123', {
        tenantId: 'tenant-a',
      }),
      fetchAdminTenants('session-123'),
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/gateway/admin/context', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/gateway/admin/users?tenantId=tenant-a', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/gateway/admin/tenants', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(contextResult).toMatchObject({
      ok: true,
      data: {
        capabilities: {
          canReadPlatformAdmin: true,
        },
      },
    });
    expect(usersResult).toMatchObject({
      ok: true,
      data: {
        users: [],
      },
    });
    expect(tenantsResult).toMatchObject({
      ok: true,
      data: {
        tenants: [],
      },
    });
  });

  it('loads admin groups, apps, usage and audit through the same-origin gateway proxy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-12T00:00:00.000Z',
            groups: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-12T00:00:00.000Z',
            apps: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-12T00:00:00.000Z',
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
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-12T00:00:00.000Z',
            capabilities: {
              canReadAdmin: true,
              canReadPlatformAdmin: false,
            },
            scope: 'tenant',
            appliedFilters: {},
            countsByAction: [],
            countsByTenant: [],
            highRiskEventCount: 0,
            events: [],
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const [groupsResult, appsResult, usageResult, auditResult] = await Promise.all([
      fetchAdminGroups('session-123'),
      fetchAdminApps('session-123'),
      fetchAdminUsage('session-123'),
      fetchAdminAudit('session-123'),
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/gateway/admin/groups', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/gateway/admin/apps', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/gateway/admin/usage', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/gateway/admin/audit', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(groupsResult).toMatchObject({
      ok: true,
      data: {
        groups: [],
      },
    });
    expect(appsResult).toMatchObject({
      ok: true,
      data: {
        apps: [],
      },
    });
    expect(usageResult).toMatchObject({
      ok: true,
      data: {
        tenants: [],
        totals: {
          launchCount: 0,
        },
      },
    });
    expect(auditResult).toMatchObject({
      ok: true,
      data: {
        events: [],
      },
    });
  });

  it('loads billing summaries, updates plans, creates adjustments, and exports billing data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-17T00:00:00.000Z',
            tenants: [],
            totals: {
              tenantCount: 0,
              recordCount: 0,
              totalCredits: 0,
              totalEstimatedUsd: 0,
              hardStopTenantCount: 0,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            tenantId: 'tenant-dev',
            plan: {
              id: 'billplan_tenant-dev',
              tenantId: 'tenant-dev',
              name: 'Growth',
              currency: 'USD',
              monthlyCreditLimit: 1200,
              softLimitPercent: 80,
              hardStopEnabled: true,
              graceCreditBuffer: 100,
              storageLimitBytes: 1024,
              monthlyExportLimit: 40,
              featureFlags: [],
              status: 'active',
              updatedAt: '2026-03-17T00:00:00.000Z',
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            tenantId: 'tenant-dev',
            plan: {
              id: 'billplan_tenant-dev',
              tenantId: 'tenant-dev',
              name: 'Growth',
              currency: 'USD',
              monthlyCreditLimit: 1200,
              softLimitPercent: 80,
              hardStopEnabled: true,
              graceCreditBuffer: 100,
              storageLimitBytes: 1024,
              monthlyExportLimit: 40,
              featureFlags: [],
              status: 'active',
              updatedAt: '2026-03-17T00:00:00.000Z',
            },
            adjustment: {
              id: 'billadj_1',
              tenantId: 'tenant-dev',
              kind: 'credit_grant',
              creditDelta: 50,
              expiresAt: null,
              reason: null,
              createdByUserId: 'user-admin',
              createdAt: '2026-03-17T00:00:00.000Z',
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        headers: new Headers({
          'content-type': 'text/csv; charset=utf-8',
          'x-agentifui-export-format': 'csv',
          'x-agentifui-export-filename': 'billing.csv',
          'x-agentifui-exported-at': '2026-03-17T00:00:00.000Z',
          'x-agentifui-export-count': '1',
        }),
        blob: async () => new Blob(['tenant_id\ntenant-dev'], { type: 'text/csv' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const billingResult = await fetchAdminBilling('session-123', { search: 'tenant' });
    const planResult = await updateAdminBillingPlan('session-123', 'tenant-dev', {
      monthlyCreditLimit: 1200,
    });
    const adjustmentResult = await createAdminBillingAdjustment('session-123', 'tenant-dev', {
      kind: 'credit_grant',
      creditDelta: 50,
    });
    const exportResult = await exportAdminBilling('session-123', 'csv', {
      tenantId: 'tenant-dev',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/gateway/admin/billing?search=tenant', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/gateway/admin/billing/tenants/tenant-dev/plan', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        monthlyCreditLimit: 1200,
      }),
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/gateway/admin/billing/tenants/tenant-dev/adjustments', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'credit_grant',
        creditDelta: 50,
      }),
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/gateway/admin/billing/export?tenantId=tenant-dev&format=csv', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(billingResult).toMatchObject({
      ok: true,
      data: {
        tenants: [],
      },
    });
    expect(planResult).toMatchObject({
      ok: true,
      data: {
        tenantId: 'tenant-dev',
      },
    });
    expect(adjustmentResult).toMatchObject({
      ok: true,
      data: {
        adjustment: {
          id: 'billadj_1',
        },
      },
    });
    expect(exportResult).toMatchObject({
      metadata: {
        filename: 'billing.csv',
        tenantCount: 1,
      },
    });
  });

  it('loads and mutates admin knowledge sources through the same-origin gateway proxy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-15T00:00:00.000Z',
            filters: {},
            statusCounts: [],
            sources: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            id: 'src_123',
            tenantId: 'tenant-dev',
            scope: 'tenant',
            groupId: null,
            title: 'Policy handbook',
            sourceKind: 'url',
            sourceUri: 'https://example.com/policy',
            labels: ['policy'],
            owner: {
              userId: 'user-admin',
              email: 'admin@iflabx.com',
              displayName: 'Admin User',
            },
            status: 'queued',
            hasContent: true,
            chunkCount: 0,
            chunking: {
              strategy: 'paragraph_windows',
              targetChunkChars: 1000,
              overlapChars: 120,
              lastChunkedAt: null,
            },
            lastError: null,
            updatedSourceAt: null,
            createdAt: '2026-03-15T00:00:00.000Z',
            updatedAt: '2026-03-15T00:00:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            id: 'src_123',
            tenantId: 'tenant-dev',
            scope: 'tenant',
            groupId: null,
            title: 'Policy handbook',
            sourceKind: 'url',
            sourceUri: 'https://example.com/policy',
            labels: ['policy'],
            owner: {
              userId: 'user-admin',
              email: 'admin@iflabx.com',
              displayName: 'Admin User',
            },
            status: 'succeeded',
            hasContent: true,
            chunkCount: 12,
            chunking: {
              strategy: 'paragraph_windows',
              targetChunkChars: 1000,
              overlapChars: 120,
              lastChunkedAt: '2026-03-15T00:10:00.000Z',
            },
            lastError: null,
            updatedSourceAt: null,
            createdAt: '2026-03-15T00:00:00.000Z',
            updatedAt: '2026-03-15T00:10:00.000Z',
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const [sourcesResult, createResult, updateResult] = await Promise.all([
      fetchAdminSources('session-123'),
      createAdminSource('session-123', {
        title: 'Policy handbook',
        sourceKind: 'url',
        sourceUri: 'https://example.com/policy',
        content: 'Policy update summary.\n\nQuiet hours begin at 23:00.',
        scope: 'tenant',
        groupId: null,
        labels: ['policy'],
        updatedSourceAt: null,
      }),
      updateAdminSourceStatus('session-123', 'src_123', {
        status: 'succeeded',
        chunkCount: 12,
        content: 'Policy update summary.\n\nQuiet hours begin at 23:00.\n\nEscalate exceptions to the RA team.',
        lastError: null,
      }),
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/gateway/admin/sources', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/gateway/admin/sources', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Policy handbook',
        sourceKind: 'url',
        sourceUri: 'https://example.com/policy',
        content: 'Policy update summary.\n\nQuiet hours begin at 23:00.',
        scope: 'tenant',
        groupId: null,
        labels: ['policy'],
        updatedSourceAt: null,
      }),
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/gateway/admin/sources/src_123/status', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: 'succeeded',
        chunkCount: 12,
        content: 'Policy update summary.\n\nQuiet hours begin at 23:00.\n\nEscalate exceptions to the RA team.',
        lastError: null,
      }),
      cache: 'no-store',
    });
    expect(sourcesResult).toMatchObject({
      ok: true,
      data: {
        sources: [],
      },
    });
    expect(createResult).toMatchObject({
      ok: true,
      data: {
        id: 'src_123',
        status: 'queued',
      },
    });
    expect(updateResult).toMatchObject({
      ok: true,
      data: {
        id: 'src_123',
        status: 'succeeded',
      },
    });
  });

  it('serializes admin audit filters into the same-origin gateway proxy query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        data: {
          generatedAt: '2026-03-12T00:00:00.000Z',
          appliedFilters: {
            scope: 'platform',
            tenantId: 'tenant-acme',
            action: 'workspace.app.launched',
          },
          countsByAction: [],
          countsByTenant: [],
          highRiskEventCount: 0,
          events: [],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchAdminAudit('session-123', {
      scope: 'platform',
      tenantId: 'tenant-acme',
      action: 'workspace.app.launched',
      level: 'info',
      traceId: 'trace-123',
      runId: 'run-123',
      payloadMode: 'raw',
      datePreset: '7d',
      limit: 25,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gateway/admin/audit?scope=platform&tenantId=tenant-acme&action=workspace.app.launched&level=info&traceId=trace-123&runId=run-123&payloadMode=raw&datePreset=7d&limit=25',
      {
        method: 'GET',
        headers: {
          authorization: 'Bearer session-123',
        },
        cache: 'no-store',
      }
    );
  });

  it('loads and mutates admin identity controls through the same-origin gateway proxy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-17T00:00:00.000Z',
            capabilities: {
              canReadAdmin: true,
              canReadPlatformAdmin: true,
            },
            tenant: null,
            domainClaims: [],
            pendingAccessRequests: [],
            breakGlassSessions: [],
            governance: null,
          },
        }),
      })
      .mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {},
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      fetchAdminIdentity('session-123', {
        tenantId: 'tenant-dev',
      }),
      createAdminDomainClaim('session-123', {
        domain: 'contoso.com',
        providerId: 'contoso-sso',
      }),
      reviewAdminDomainClaim('session-123', 'claim_123', {
        status: 'approved',
      }),
      reviewAdminAccessRequest('session-123', 'request_123', {
        decision: 'approved',
      }),
      resetAdminUserMfa('session-123', 'user_123'),
      createAdminBreakGlassSession('session-123', {
        reason: 'Emergency review',
      }),
      updateAdminBreakGlassSession('session-123', 'bg_123', {
        status: 'revoked',
      }),
      updateAdminTenantGovernance('session-123', {
        legalHoldEnabled: true,
      }),
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/gateway/admin/identity?tenantId=tenant-dev',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/gateway/admin/identity/domain-claims',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/gateway/admin/identity/domain-claims/claim_123/review',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/gateway/admin/identity/access-requests/request_123/review',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      '/api/gateway/admin/identity/users/user_123/mfa/reset',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      '/api/gateway/admin/identity/break-glass',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      '/api/gateway/admin/identity/break-glass/bg_123',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      '/api/gateway/admin/identity/governance',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('loads policy controls and submits simulations plus exception workflows through the same-origin gateway proxy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-18T00:00:00.000Z',
            governance: null,
            exceptions: [],
            recentEvaluations: [],
          },
        }),
      })
      .mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {},
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      fetchAdminPolicy('session-123', {
        tenantId: 'tenant-dev',
      }),
      simulateAdminPolicy('session-123', {
        tenantId: 'tenant-dev',
        scope: 'retrieval',
        content: 'Check a candidate prompt',
      }),
      createAdminPolicyException('session-123', {
        tenantId: 'tenant-dev',
        scope: 'tenant',
        detector: 'secret',
        label: 'Approved sandbox secret',
      }),
      reviewAdminPolicyException('session-123', 'pol_exc_123', {
        note: 'Reviewed',
      }),
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/gateway/admin/policy?tenantId=tenant-dev',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/gateway/admin/policy/simulations',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/gateway/admin/policy/exceptions',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/gateway/admin/policy/exceptions/pol_exc_123/review',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('loads observability data and creates operator annotations through the same-origin gateway proxy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-18T00:00:00.000Z',
            sli: [],
            routes: [],
            alerts: [],
            incidentTimeline: [],
            annotations: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            annotation: {
              id: 'obs_note_123',
              tenantId: 'tenant-dev',
              traceId: 'trace-123',
              runId: null,
              note: 'Pinned to deploy #42',
              createdAt: '2026-03-18T00:00:00.000Z',
              createdByUserId: 'usr_admin',
            },
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      fetchAdminObservability('session-123', {
        tenantId: 'tenant-dev',
      }),
      createAdminObservabilityAnnotation('session-123', {
        tenantId: 'tenant-dev',
        traceId: 'trace-123',
        note: 'Pinned to deploy #42',
      }),
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/gateway/admin/observability?tenantId=tenant-dev',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/gateway/admin/observability/annotations',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('downloads admin audit exports through the same-origin gateway proxy', async () => {
    const blob = new Blob(['event_id,action\n1,workspace.app.launched\n'], {
      type: 'text/csv',
    });
    const fetchMock = vi.fn().mockResolvedValue({
      headers: new Headers({
        'content-type': 'text/csv; charset=utf-8',
        'x-agentifui-export-format': 'csv',
        'x-agentifui-export-filename': 'admin-audit-export.csv',
        'x-agentifui-exported-at': '2026-03-12T00:00:00.000Z',
        'x-agentifui-export-count': '1',
      }),
      blob: async () => blob,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await exportAdminAudit('session-123', 'csv', {
      scope: 'platform',
      tenantId: 'tenant-acme',
      action: 'workspace.app.launched',
      traceId: 'trace-123',
      payloadMode: 'masked',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gateway/admin/audit/export?scope=platform&tenantId=tenant-acme&action=workspace.app.launched&traceId=trace-123&payloadMode=masked&format=csv',
      {
        method: 'GET',
        headers: {
          authorization: 'Bearer session-123',
        },
        cache: 'no-store',
      }
    );
    expect(result).toMatchObject({
      metadata: {
        format: 'csv',
        filename: 'admin-audit-export.csv',
        eventCount: 1,
      },
    });
  });

  it('downloads admin usage exports through the same-origin gateway proxy', async () => {
    const blob = new Blob(['tenant_id,tenant_name\ntenant-dev,Tenant Dev\n'], {
      type: 'text/csv',
    });
    const fetchMock = vi.fn().mockResolvedValue({
      headers: new Headers({
        'content-type': 'text/csv; charset=utf-8',
        'x-agentifui-export-format': 'csv',
        'x-agentifui-export-filename': 'admin-usage-export.csv',
        'x-agentifui-exported-at': '2026-03-12T00:00:00.000Z',
        'x-agentifui-export-count': '1',
      }),
      blob: async () => blob,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await exportAdminUsage('session-123', 'csv', {
      search: 'tenant',
      tenantId: 'tenant-dev',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gateway/admin/usage/export?search=tenant&tenantId=tenant-dev&format=csv',
      {
        method: 'GET',
        headers: {
          authorization: 'Bearer session-123',
        },
        cache: 'no-store',
      }
    );
    expect(result).toMatchObject({
      metadata: {
        format: 'csv',
        filename: 'admin-usage-export.csv',
        tenantCount: 1,
      },
    });
  });

  it('posts and deletes admin app grants through the same-origin gateway proxy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            app: {
              id: 'app_tenant_control',
              userGrants: [],
            },
            grant: {
              id: 'grant-1',
              effect: 'allow',
              user: {
                email: 'member@example.com',
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            app: {
              id: 'app_tenant_control',
              userGrants: [],
            },
            revokedGrantId: 'grant-1',
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const [createResult, revokeResult] = await Promise.all([
      createAdminAppGrant('session-123', 'app_tenant_control', {
        subjectUserEmail: 'member@example.com',
        effect: 'allow',
        reason: 'break glass',
      }),
      revokeAdminAppGrant('session-123', 'app_tenant_control', 'grant-1'),
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/gateway/admin/apps/app_tenant_control/grants', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        subjectUserEmail: 'member@example.com',
        effect: 'allow',
        reason: 'break glass',
      }),
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/gateway/admin/apps/app_tenant_control/grants/grant-1',
      {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer session-123',
        },
        body: undefined,
        cache: 'no-store',
      }
    );
    expect(createResult).toMatchObject({
      ok: true,
      data: {
        grant: {
          id: 'grant-1',
        },
      },
    });
    expect(revokeResult).toMatchObject({
      ok: true,
      data: {
        revokedGrantId: 'grant-1',
      },
    });
  });

  it('updates admin app tool registry through the same-origin gateway proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        data: {
          app: {
            id: 'app_policy_watch',
            enabledToolCount: 1,
          },
          enabledToolNames: ['workspace.search'],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateAdminAppTools('session-123', 'app_policy_watch', {
      tools: [
        {
          name: 'workspace.search',
          enabled: true,
          execution: {
            timeoutMs: 210,
            maxAttempts: 2,
            idempotencyScope: 'conversation',
          },
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/gateway/admin/apps/app_policy_watch/tools', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tools: [
          {
            name: 'workspace.search',
            enabled: true,
            execution: {
              timeoutMs: 210,
              maxAttempts: 2,
              idempotencyScope: 'conversation',
            },
          },
        ],
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        enabledToolNames: ['workspace.search'],
      },
    });
  });

  it('posts and updates platform tenants through the same-origin gateway proxy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            tenant: {
              id: 'tenant-acme',
              slug: 'acme',
              status: 'active',
            },
            bootstrapInvitation: {
              invitationId: 'invite-1',
              email: 'owner@acme.example',
              inviteUrl: '/invite/accept?token=token-1',
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            tenant: {
              id: 'tenant-acme',
              slug: 'acme',
              status: 'suspended',
            },
            previousStatus: 'active',
            reason: 'maintenance window',
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const [createResult, updateResult] = await Promise.all([
      createAdminTenant('session-123', {
        name: 'Acme',
        slug: 'acme',
        adminEmail: 'owner@acme.example',
        adminDisplayName: 'Acme Owner',
      }),
      updateAdminTenantStatus('session-123', 'tenant-acme', {
        status: 'suspended',
        reason: 'maintenance window',
      }),
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/gateway/admin/tenants', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Acme',
        slug: 'acme',
        adminEmail: 'owner@acme.example',
        adminDisplayName: 'Acme Owner',
      }),
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/gateway/admin/tenants/tenant-acme/status',
      {
        method: 'PUT',
        headers: {
          authorization: 'Bearer session-123',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          status: 'suspended',
          reason: 'maintenance window',
        }),
        cache: 'no-store',
      }
    );
    expect(createResult).toMatchObject({
      ok: true,
      data: {
        tenant: {
          id: 'tenant-acme',
        },
        bootstrapInvitation: {
          invitationId: 'invite-1',
        },
      },
    });
    expect(updateResult).toMatchObject({
      ok: true,
      data: {
        tenant: {
          status: 'suspended',
        },
        previousStatus: 'active',
      },
    });
  });

  it('loads and mutates admin workflows through the same-origin gateway proxy', async () => {
    const emptyDocument = {
      nodes: [],
      edges: [],
      variables: [],
      approvals: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-17T00:00:00.000Z',
            workflows: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            workflow: {
              id: 'workflow_1',
              tenantId: 'tenant-dev',
              slug: 'incident-review',
              title: 'Incident Review',
              description: 'Review flow',
              currentVersionId: 'wfver_1',
              currentVersionStatus: 'draft',
              createdAt: '2026-03-17T00:00:00.000Z',
              updatedAt: '2026-03-17T00:00:00.000Z',
            },
            version: {
              id: 'wfver_1',
              workflowId: 'workflow_1',
              versionNumber: 1,
              status: 'draft',
              createdAt: '2026-03-17T00:00:00.000Z',
              updatedAt: '2026-03-17T00:00:00.000Z',
              publishedAt: null,
              rolledBackFromVersionId: null,
              validationErrors: [],
              document: emptyDocument,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            workflow: {
              id: 'workflow_1',
              tenantId: 'tenant-dev',
              slug: 'incident-review',
              title: 'Incident Review',
              description: 'Review flow',
              currentVersionId: 'wfver_2',
              currentVersionStatus: 'draft',
              createdAt: '2026-03-17T00:00:00.000Z',
              updatedAt: '2026-03-17T01:00:00.000Z',
            },
            version: {
              id: 'wfver_2',
              workflowId: 'workflow_1',
              versionNumber: 2,
              status: 'draft',
              createdAt: '2026-03-17T01:00:00.000Z',
              updatedAt: '2026-03-17T01:00:00.000Z',
              publishedAt: null,
              rolledBackFromVersionId: null,
              validationErrors: [],
              document: emptyDocument,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            workflow: {
              id: 'workflow_1',
              tenantId: 'tenant-dev',
              slug: 'incident-review',
              title: 'Incident Review',
              description: 'Review flow',
              currentVersionId: 'wfver_2',
              currentVersionStatus: 'published',
              createdAt: '2026-03-17T00:00:00.000Z',
              updatedAt: '2026-03-17T01:00:00.000Z',
            },
            version: {
              id: 'wfver_2',
              workflowId: 'workflow_1',
              versionNumber: 2,
              status: 'published',
              createdAt: '2026-03-17T01:00:00.000Z',
              updatedAt: '2026-03-17T01:00:00.000Z',
              publishedAt: '2026-03-17T01:00:00.000Z',
              rolledBackFromVersionId: null,
              validationErrors: [],
              document: emptyDocument,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            workflowId: 'workflow_1',
            permissions: [
              {
                id: 'wfperm_1',
                userEmail: 'reviewer@example.net',
                role: 'reviewer',
                createdAt: '2026-03-17T01:10:00.000Z',
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            valid: true,
            errors: [],
            warnings: [],
            planPreview: [
              {
                id: 'node_prompt',
                title: 'Collect context',
                type: 'prompt',
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            workflow: {
              id: 'workflow_1',
              tenantId: 'tenant-dev',
              slug: 'incident-review',
              title: 'Incident Review',
              description: 'Review flow',
              currentVersionId: 'wfver_2',
              currentVersionStatus: 'published',
              createdAt: '2026-03-17T00:00:00.000Z',
              updatedAt: '2026-03-17T01:00:00.000Z',
            },
            versions: [],
            permissions: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            workflow: {
              id: 'workflow_1',
              tenantId: 'tenant-dev',
              slug: 'incident-review',
              title: 'Incident Review',
              description: 'Review flow',
              currentVersionId: 'wfver_3',
              currentVersionStatus: 'rolled_back',
              createdAt: '2026-03-17T00:00:00.000Z',
              updatedAt: '2026-03-17T01:20:00.000Z',
            },
            version: {
              id: 'wfver_3',
              workflowId: 'workflow_1',
              versionNumber: 3,
              status: 'rolled_back',
              createdAt: '2026-03-17T01:20:00.000Z',
              updatedAt: '2026-03-17T01:20:00.000Z',
              publishedAt: '2026-03-17T01:20:00.000Z',
              rolledBackFromVersionId: 'wfver_2',
              validationErrors: [],
              document: emptyDocument,
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            workflow: {
              id: 'workflow_imported',
              tenantId: 'tenant-dev',
              slug: 'incident-review-imported',
              title: 'Imported Incident Review',
              description: 'Imported flow',
              currentVersionId: 'wfver_imported',
              currentVersionStatus: 'draft',
              createdAt: '2026-03-17T02:00:00.000Z',
              updatedAt: '2026-03-17T02:00:00.000Z',
            },
            importedVersionCount: 2,
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const sessionToken = 'session-123';

    await fetchAdminWorkflows(sessionToken);
    await createAdminWorkflow(sessionToken, {
      slug: 'incident-review',
      title: 'Incident Review',
      description: 'Review flow',
      document: emptyDocument,
    });
    await updateAdminWorkflow(sessionToken, 'workflow_1', {
      document: emptyDocument,
    });
    await publishAdminWorkflow(sessionToken, 'workflow_1', {
      versionId: 'wfver_2',
    });
    await updateAdminWorkflowPermissions(sessionToken, 'workflow_1', {
      permissions: [
        {
          userEmail: 'reviewer@example.net',
          role: 'reviewer',
        },
      ],
    });
    await dryRunAdminWorkflow(sessionToken, 'workflow_1', {});
    await exportAdminWorkflow(sessionToken, 'workflow_1');
    await rollbackAdminWorkflow(sessionToken, 'workflow_1', {
      targetVersionId: 'wfver_2',
    });
    const importResult = await importAdminWorkflow(sessionToken, {
      workflow: {
        id: 'workflow_1',
        tenantId: 'tenant-dev',
        slug: 'incident-review',
        title: 'Incident Review',
        description: 'Review flow',
        currentVersionId: 'wfver_2',
        currentVersionStatus: 'published',
        createdAt: '2026-03-17T00:00:00.000Z',
        updatedAt: '2026-03-17T01:00:00.000Z',
      },
      versions: [],
      permissions: [],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/gateway/admin/workflows', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/gateway/admin/workflows', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        slug: 'incident-review',
        title: 'Incident Review',
        description: 'Review flow',
        document: emptyDocument,
      }),
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/gateway/admin/workflows/workflow_1/dry-run', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    });
    expect(importResult).toMatchObject({
      ok: true,
      data: {
        importedVersionCount: 2,
      },
    });
  });
});
