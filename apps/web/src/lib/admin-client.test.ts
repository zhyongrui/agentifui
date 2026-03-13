import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAdminTenant,
  createAdminAppGrant,
  exportAdminAudit,
  fetchAdminApps,
  fetchAdminAudit,
  fetchAdminGroups,
  fetchAdminTenants,
  fetchAdminUsers,
  revokeAdminAppGrant,
  updateAdminTenantStatus,
} from './admin-client.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('admin client', () => {
  it('loads admin users and platform tenants through the same-origin gateway proxy', async () => {
    const fetchMock = vi
      .fn()
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

    const [usersResult, tenantsResult] = await Promise.all([
      fetchAdminUsers('session-123'),
      fetchAdminTenants('session-123'),
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/gateway/admin/users', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/gateway/admin/tenants', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
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

  it('loads admin groups, apps and audit through the same-origin gateway proxy', async () => {
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
            appliedFilters: {},
            countsByAction: [],
            events: [],
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const [groupsResult, appsResult, auditResult] = await Promise.all([
      fetchAdminGroups('session-123'),
      fetchAdminApps('session-123'),
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
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/gateway/admin/audit', {
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
    expect(auditResult).toMatchObject({
      ok: true,
      data: {
        events: [],
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
            action: 'workspace.app.launched',
          },
          countsByAction: [],
          events: [],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchAdminAudit('session-123', {
      action: 'workspace.app.launched',
      level: 'info',
      traceId: 'trace-123',
      runId: 'run-123',
      payloadMode: 'raw',
      limit: 25,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gateway/admin/audit?action=workspace.app.launched&level=info&traceId=trace-123&runId=run-123&payloadMode=raw&limit=25',
      {
        method: 'GET',
        headers: {
          authorization: 'Bearer session-123',
        },
        cache: 'no-store',
      }
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
      action: 'workspace.app.launched',
      traceId: 'trace-123',
      payloadMode: 'masked',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gateway/admin/audit/export?action=workspace.app.launched&traceId=trace-123&payloadMode=masked&format=csv',
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
});
