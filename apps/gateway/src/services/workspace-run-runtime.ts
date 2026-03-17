import type { WorkspaceRunRuntime } from '@agentifui/shared/apps';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCapabilities(value: unknown): WorkspaceRunRuntime['capabilities'] | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.streaming !== 'boolean' ||
    typeof value.citations !== 'boolean' ||
    typeof value.artifacts !== 'boolean' ||
    typeof value.safety !== 'boolean' ||
    typeof value.pendingActions !== 'boolean' ||
    typeof value.files !== 'boolean'
  ) {
    return null;
  }

  return {
    streaming: value.streaming,
    citations: value.citations,
    artifacts: value.artifacts,
    safety: value.safety,
    pendingActions: value.pendingActions,
    files: value.files,
  };
}

function parsePricing(value: unknown): WorkspaceRunRuntime['pricing'] {
  if (
    isRecord(value) &&
    value.currency === 'credits' &&
    typeof value.promptPer1kTokens === 'number' &&
    typeof value.completionPer1kTokens === 'number' &&
    typeof value.requestFlat === 'number'
  ) {
    return {
      currency: 'credits',
      promptPer1kTokens: value.promptPer1kTokens,
      completionPer1kTokens: value.completionPer1kTokens,
      requestFlat: value.requestFlat,
    };
  }

  return {
    currency: 'credits',
    promptPer1kTokens: 0,
    completionPer1kTokens: 0,
    requestFlat: 0,
  };
}

function parseRetryPolicy(value: unknown): WorkspaceRunRuntime['retryPolicy'] {
  if (
    isRecord(value) &&
    typeof value.maxAttempts === 'number' &&
    typeof value.baseDelayMs === 'number' &&
    typeof value.backoffMultiplier === 'number' &&
    (value.jitter === 'none' || value.jitter === 'full') &&
    (value.idempotencyStrategy === 'request_hash' ||
      value.idempotencyStrategy === 'conversation_scoped' ||
      value.idempotencyStrategy === 'run_scoped')
  ) {
    return {
      maxAttempts: value.maxAttempts,
      baseDelayMs: value.baseDelayMs,
      backoffMultiplier: value.backoffMultiplier,
      jitter: value.jitter,
      idempotencyStrategy: value.idempotencyStrategy,
    };
  }

  return {
    maxAttempts: 1,
    baseDelayMs: 0,
    backoffMultiplier: 1,
    jitter: 'none',
    idempotencyStrategy: 'request_hash',
  };
}

function parseCircuitBreaker(value: unknown): WorkspaceRunRuntime['circuitBreaker'] {
  if (
    isRecord(value) &&
    (value.state === 'closed' || value.state === 'open' || value.state === 'half_open') &&
    typeof value.failureCount === 'number' &&
    (typeof value.openedAt === 'string' || value.openedAt === null) &&
    typeof value.resetAfterMs === 'number'
  ) {
    return {
      state: value.state,
      failureCount: value.failureCount,
      openedAt: value.openedAt,
      resetAfterMs: value.resetAfterMs,
    };
  }

  return {
    state: 'closed',
    failureCount: 0,
    openedAt: null,
    resetAfterMs: 0,
  };
}

function parseSelection(
  value: unknown,
  runtime: Record<string, unknown>,
): WorkspaceRunRuntime['selection'] {
  if (isRecord(value)) {
    const candidates = Array.isArray(value.candidates)
      ? value.candidates.filter(
          (candidate): candidate is { providerId: string; modelId: string; weight: number } =>
            isRecord(candidate) &&
            typeof candidate.providerId === 'string' &&
            typeof candidate.modelId === 'string' &&
            typeof candidate.weight === 'number',
        )
      : [];
    const attemptedProviderIds = Array.isArray(value.attemptedProviderIds)
      ? value.attemptedProviderIds.filter(
          (providerId): providerId is string => typeof providerId === 'string',
        )
      : [];

    if (
      typeof value.appId === 'string' &&
      typeof value.tenantId === 'string' &&
      (value.requestType === 'chat_completion' ||
        value.requestType === 'tool_execution' ||
        value.requestType === 'file_ingest' ||
        value.requestType === 'safety_review') &&
      (value.source === 'app_default' ||
        value.source === 'tenant_runtime_mode' ||
        value.source === 'model_override' ||
        value.source === 'fallback') &&
      (typeof value.fallbackFromProviderId === 'string' || value.fallbackFromProviderId === null)
    ) {
      return {
        appId: value.appId,
        tenantId: value.tenantId,
        requestType: value.requestType,
        source: value.source,
        candidates,
        attemptedProviderIds,
        fallbackFromProviderId: value.fallbackFromProviderId,
      };
    }
  }

  return {
    appId: typeof runtime.appId === 'string' ? runtime.appId : 'unknown-app',
    tenantId: typeof runtime.tenantId === 'string' ? runtime.tenantId : 'unknown-tenant',
    requestType: 'chat_completion',
    source: 'app_default',
    candidates: [],
    attemptedProviderIds: [],
    fallbackFromProviderId: null,
  };
}

export function parseWorkspaceRunRuntime(value: unknown): WorkspaceRunRuntime | null {
  if (!isRecord(value)) {
    return null;
  }

  const capabilities = parseCapabilities(value.capabilities);

  if (
    typeof value.id !== 'string' ||
    typeof value.label !== 'string' ||
    (value.status !== 'available' && value.status !== 'degraded') ||
    typeof value.invokedAt !== 'string' ||
    !capabilities
  ) {
    return null;
  }

  return {
    id: value.id,
    label: value.label,
    status: value.status,
    capabilities,
    invokedAt: value.invokedAt,
    providerId: typeof value.providerId === 'string' ? value.providerId : value.id,
    providerLabel: typeof value.providerLabel === 'string' ? value.providerLabel : value.label,
    modelId: typeof value.modelId === 'string' ? value.modelId : value.id,
    requestType:
      value.requestType === 'chat_completion' ||
      value.requestType === 'tool_execution' ||
      value.requestType === 'file_ingest' ||
      value.requestType === 'safety_review'
        ? value.requestType
        : 'chat_completion',
    pricing: parsePricing(value.pricing),
    retryPolicy: parseRetryPolicy(value.retryPolicy),
    circuitBreaker: parseCircuitBreaker(value.circuitBreaker),
    selection: parseSelection(value.selection, value),
  };
}
