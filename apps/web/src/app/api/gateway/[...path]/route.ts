import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:4000';

function getGatewayOrigin() {
  return (
    process.env.GATEWAY_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_GATEWAY_URL?.trim() ||
    DEFAULT_GATEWAY_URL
  );
}

function joinGatewayPath(pathSegments: string[]) {
  const pathname = pathSegments.join('/');

  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function buildTraceId() {
  return randomUUID().replace(/-/g, '');
}

async function proxyGatewayRequest(
  request: NextRequest,
  context: {
    params: Promise<{ path: string[] }>;
  }
) {
  const { path } = await context.params;
  const upstreamUrl = new URL(joinGatewayPath(path), getGatewayOrigin());
  const requestUrl = new URL(request.url);
  const traceId = request.headers.get('x-trace-id')?.trim() || buildTraceId();

  if (requestUrl.search) {
    upstreamUrl.search = requestUrl.search;
  }

  const headers = new Headers();
  const passthroughRequestHeaders = [
    'authorization',
    'content-type',
    'x-active-group-id',
  ] as const;

  for (const headerName of passthroughRequestHeaders) {
    const value = request.headers.get(headerName);

    if (value) {
      headers.set(headerName, value);
    }
  }

  headers.set('x-trace-id', traceId);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  const passthroughHeaders = new Set(['content-type', 'cache-control', 'content-disposition', 'x-trace-id']);

  for (const [headerName, headerValue] of upstreamResponse.headers.entries()) {
    if (passthroughHeaders.has(headerName) || headerName.startsWith('x-agentifui-')) {
      responseHeaders.set(headerName, headerValue);
    }
  }

  if (!responseHeaders.has('x-trace-id')) {
    responseHeaders.set('x-trace-id', traceId);
  }

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ path: string[] }>;
  }
) {
  return proxyGatewayRequest(request, context);
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ path: string[] }>;
  }
) {
  return proxyGatewayRequest(request, context);
}

export async function PUT(
  request: NextRequest,
  context: {
    params: Promise<{ path: string[] }>;
  }
) {
  return proxyGatewayRequest(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: {
    params: Promise<{ path: string[] }>;
  }
) {
  return proxyGatewayRequest(request, context);
}
