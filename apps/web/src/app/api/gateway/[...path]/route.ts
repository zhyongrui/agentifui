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

async function proxyGatewayRequest(
  request: NextRequest,
  context: {
    params: Promise<{ path: string[] }>;
  }
) {
  const { path } = await context.params;
  const upstreamUrl = new URL(joinGatewayPath(path), getGatewayOrigin());
  const requestUrl = new URL(request.url);

  if (requestUrl.search) {
    upstreamUrl.search = requestUrl.search;
  }

  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  const contentType = request.headers.get('content-type');

  if (authorization) {
    headers.set('authorization', authorization);
  }

  if (contentType) {
    headers.set('content-type', contentType);
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  const upstreamContentType = upstreamResponse.headers.get('content-type');

  if (upstreamContentType) {
    responseHeaders.set('content-type', upstreamContentType);
  }

  return new NextResponse(await upstreamResponse.text(), {
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
