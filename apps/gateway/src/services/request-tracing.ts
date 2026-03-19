import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type RequestTraceSource = 'incoming' | 'generated';

export type RequestTraceContext = {
  method: string;
  requestId: string;
  route: string;
  traceId: string;
  traceSource: RequestTraceSource;
  url: string;
};

const requestTraceStorage = new AsyncLocalStorage<RequestTraceContext>();

function normalizeTraceId(value: string | null | undefined) {
  const traceId = value?.trim();

  return traceId ? traceId : null;
}

export function buildTraceId() {
  return randomUUID().replace(/-/g, '');
}

export function resolveRequestTraceId(value: string | null | undefined) {
  return normalizeTraceId(value) ?? buildTraceId();
}

export function runWithRequestTraceContext<T>(
  context: RequestTraceContext,
  callback: () => T
) {
  return requestTraceStorage.run(context, callback);
}

export function getRequestTraceContext() {
  return requestTraceStorage.getStore() ?? null;
}

export function withRequestTracePayload(payload: Record<string, unknown> | undefined) {
  const context = getRequestTraceContext();
  const basePayload = payload ?? {};

  if (!context) {
    return basePayload;
  }

  return {
    ...basePayload,
    ...(typeof basePayload.traceId === 'string' ? {} : { traceId: context.traceId }),
    ...(typeof basePayload.requestId === 'string' ? {} : { requestId: context.requestId }),
    ...(typeof basePayload.method === 'string' ? {} : { method: context.method }),
    ...(typeof basePayload.route === 'string' ? {} : { route: context.route }),
    ...(typeof basePayload.url === 'string' ? {} : { url: context.url }),
  };
}
