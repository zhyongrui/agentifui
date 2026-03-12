import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAdminAppGrant,
  fetchAdminApps,
  fetchAdminAudit,
  fetchAdminGroups,
  fetchAdminUsers,
  revokeAdminAppGrant,
} from './admin-client.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('admin client', () => {
  it('loads admin users through the same-origin gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-12T00:00:00.000Z',
            users: [],
          },
        }),
      })
    );

    const result = await fetchAdminUsers('session-123');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/admin/users', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        users: [],
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
      limit: 25,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gateway/admin/audit?action=workspace.app.launched&level=info&traceId=trace-123&runId=run-123&limit=25',
      {
        method: 'GET',
        headers: {
          authorization: 'Bearer session-123',
        },
        cache: 'no-store',
      }
    );
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
});
