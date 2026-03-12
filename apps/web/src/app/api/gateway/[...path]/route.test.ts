import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('gateway proxy route', () => {
  it('passes through admin export headers from the upstream gateway response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('event_id,action\n1,workspace.app.launched\n', {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="admin-audit-export.csv"',
          'x-agentifui-export-format': 'csv',
          'x-agentifui-export-filename': 'admin-audit-export.csv',
          'x-agentifui-exported-at': '2026-03-12T00:00:00.000Z',
          'x-agentifui-export-count': '1',
          'x-trace-id': 'trace-123',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest(
      'http://localhost:3111/api/gateway/admin/audit/export?format=csv',
      {
        headers: {
          authorization: 'Bearer session-123',
        },
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({
        path: ['admin', 'audit', 'export'],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe('http://127.0.0.1:4000/admin/audit/export?format=csv');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: expect.any(Headers),
      cache: 'no-store',
    });
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="admin-audit-export.csv"'
    );
    expect(response.headers.get('x-agentifui-export-format')).toBe('csv');
    expect(response.headers.get('x-agentifui-export-filename')).toBe('admin-audit-export.csv');
    expect(response.headers.get('x-agentifui-exported-at')).toBe('2026-03-12T00:00:00.000Z');
    expect(response.headers.get('x-agentifui-export-count')).toBe('1');
    expect(response.headers.get('x-trace-id')).toBe('trace-123');
  });
});
