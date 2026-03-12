import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAdminApps,
  fetchAdminAudit,
  fetchAdminGroups,
  fetchAdminUsers,
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
});
