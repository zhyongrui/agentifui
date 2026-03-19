import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { DELETE, GET } from './route.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('gateway proxy route', () => {
  it('passes through admin export headers and forwards trace headers to the upstream gateway', async () => {
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
          'x-trace-id': 'trace-123',
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
    const upstreamHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: expect.any(Headers),
      cache: 'no-store',
    });
    expect(upstreamHeaders.get('authorization')).toBe('Bearer session-123');
    expect(upstreamHeaders.get('x-trace-id')).toBe('trace-123');
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

  it('generates a trace id when the web request does not provide one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3111/api/gateway/health');

    const response = await GET(request, {
      params: Promise.resolve({
        path: ['health'],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const upstreamHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    const traceId = upstreamHeaders.get('x-trace-id');
    expect(traceId).toEqual(expect.any(String));
    expect(response.headers.get('x-trace-id')).toBe(traceId);
  });

  it('proxies delete requests to the upstream gateway', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest(
      'http://localhost:3111/api/gateway/workspace/conversations/conv-1/shares/share-1',
      {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer session-456',
          'x-active-group-id': 'grp_research',
        },
      }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({
        path: ['workspace', 'conversations', 'conv-1', 'shares', 'share-1'],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      'http://127.0.0.1:4000/workspace/conversations/conv-1/shares/share-1'
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'DELETE',
      headers: expect.any(Headers),
      cache: 'no-store',
    });
    const upstreamHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(upstreamHeaders.get('authorization')).toBe('Bearer session-456');
    expect(upstreamHeaders.get('x-active-group-id')).toBe('grp_research');
    expect(upstreamHeaders.get('x-trace-id')).toEqual(expect.any(String));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-trace-id')).toBe(upstreamHeaders.get('x-trace-id'));
  });
});
