import type {
  RuntimeProviderCapabilitySet,
  RuntimeProviderCandidate,
  RuntimeProviderCircuitBreaker,
  RuntimeProviderDescriptor,
  RuntimeProviderHealthState,
  RuntimeProviderRequestType,
  RuntimeProviderSelectionPolicy,
} from "@agentifui/shared";

export type WorkspaceTenantRuntimeMode = "standard" | "strict" | "degraded";

export type WorkspaceProviderRoutingInput = {
  appId: string;
  latestPrompt: string;
  requestedModel: string;
  tenantId: string;
  tenantRuntimeMode?: WorkspaceTenantRuntimeMode;
  requestType: RuntimeProviderRequestType;
};

export type WorkspaceResolvedProviderSelection = {
  modelId: string;
  provider: RuntimeProviderDescriptor;
  requestType: RuntimeProviderRequestType;
  selection: RuntimeProviderSelectionPolicy & {
    attemptedProviderIds: string[];
    fallbackFromProviderId: string | null;
  };
};

const DEFAULT_CAPABILITIES: RuntimeProviderCapabilitySet = {
  chat: true,
  tools: true,
  files: true,
  citations: true,
  safety: true,
  structuredOutputs: false,
  pendingActions: true,
};

function buildCircuitBreaker(input: {
  state?: RuntimeProviderCircuitBreaker["state"];
  resetAfterMs?: number;
} = {}): RuntimeProviderCircuitBreaker {
  return {
    state: input.state ?? "closed",
    failureCount: input.state === "open" ? 3 : 0,
    openedAt: input.state === "open" ? new Date().toISOString() : null,
    resetAfterMs: input.resetAfterMs ?? 30_000,
  };
}

function buildDescriptor(input: {
  id: string;
  label: string;
  adapterId: string;
  status: RuntimeProviderHealthState;
  weight: number;
  circuitState?: RuntimeProviderCircuitBreaker["state"];
  capabilities?: Partial<RuntimeProviderCapabilitySet>;
  modelId: string;
  modelLabel: string;
  pricing: RuntimeProviderDescriptor["models"][number]["pricing"];
  retryPolicy: RuntimeProviderDescriptor["retryPolicy"];
}): RuntimeProviderDescriptor {
  return {
    id: input.id,
    label: input.label,
    adapterId: input.adapterId,
    status: input.status,
    weight: input.weight,
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      ...input.capabilities,
    },
    retryPolicy: input.retryPolicy,
    circuitBreaker: buildCircuitBreaker({
      state: input.circuitState,
    }),
    models: [
      {
        id: input.modelId,
        label: input.modelLabel,
        pricing: input.pricing,
      },
    ],
  };
}

function computeRequestType(input: {
  latestPrompt: string;
  requestType: RuntimeProviderRequestType;
}) {
  const prompt = input.latestPrompt.trim().toLowerCase();

  if (prompt.startsWith("@safety ")) {
    return "safety_review" as const;
  }

  if (prompt.startsWith("@files ")) {
    return "file_ingest" as const;
  }

  if (prompt.startsWith("@tools ")) {
    return "tool_execution" as const;
  }

  return input.requestType;
}

function readPromptProviderOverride(latestPrompt: string) {
  const prompt = latestPrompt.trim().toLowerCase();

  if (prompt.startsWith("@structured ")) {
    return "local_structured";
  }

  if (prompt.startsWith("@fast ")) {
    return "local_fast";
  }

  return null;
}

function readModelProviderOverride(requestedModel: string) {
  const normalized = requestedModel.trim().toLowerCase();

  if (normalized.includes("structured")) {
    return "local_structured";
  }

  if (normalized.includes("fast")) {
    return "local_fast";
  }

  return null;
}

function sortCandidatesByWeight<T extends { weight: number }>(candidates: T[]) {
  return [...candidates].sort((left, right) => right.weight - left.weight);
}

function resolveAppProviderCandidates(appId: string): RuntimeProviderCandidate[] {
  if (appId === "app_runbook_mentor") {
    return [
      {
        providerId: "local_structured",
        modelId: "local-structured-v1",
        weight: 100,
      },
      {
        providerId: "local_fast",
        modelId: "local-fast-v1",
        weight: 60,
      },
    ];
  }

  return [
    {
      providerId: "local_fast",
      modelId: "local-fast-v1",
      weight: 100,
    },
    {
      providerId: "local_structured",
      modelId: "local-structured-v1",
      weight: 70,
    },
  ];
}

export function createWorkspaceProviderRoutingService(input: {
  degradedProviderIds?: string[];
  openCircuitProviderIds?: string[];
  resolveTenantRuntimeMode?: (tenantId: string) => WorkspaceTenantRuntimeMode;
} = {}) {
  const degradedProviderIds = new Set(input.degradedProviderIds ?? []);
  const openCircuitProviderIds = new Set(input.openCircuitProviderIds ?? []);

  const providers: RuntimeProviderDescriptor[] = [
    buildDescriptor({
      id: "local_fast",
      label: "Local Fast Provider",
      adapterId: "placeholder",
      status: degradedProviderIds.has("local_fast") ? "degraded" : "available",
      weight: 100,
      modelId: "local-fast-v1",
      modelLabel: "Local Fast v1",
      pricing: {
        currency: "credits",
        promptPer1kTokens: 0.4,
        completionPer1kTokens: 0.8,
        requestFlat: 1,
      },
      retryPolicy: {
        maxAttempts: 2,
        baseDelayMs: 40,
        backoffMultiplier: 2,
        jitter: "full",
        idempotencyStrategy: "conversation_scoped",
      },
      circuitState: openCircuitProviderIds.has("local_fast") ? "open" : "closed",
    }),
    buildDescriptor({
      id: "local_structured",
      label: "Local Structured Provider",
      adapterId: "placeholder_structured",
      status: degradedProviderIds.has("local_structured")
        ? "degraded"
        : "available",
      weight: 80,
      modelId: "local-structured-v1",
      modelLabel: "Local Structured v1",
      pricing: {
        currency: "credits",
        promptPer1kTokens: 0.6,
        completionPer1kTokens: 1,
        requestFlat: 2,
      },
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 60,
        backoffMultiplier: 2,
        jitter: "full",
        idempotencyStrategy: "run_scoped",
      },
      capabilities: {
        structuredOutputs: true,
      },
      circuitState: openCircuitProviderIds.has("local_structured") ? "open" : "closed",
    }),
  ];

  const providersById = new Map(providers.map((provider) => [provider.id, provider]));

  function listProviders() {
    return providers.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => ({
        ...model,
        pricing: { ...model.pricing },
      })),
      capabilities: { ...provider.capabilities },
      retryPolicy: { ...provider.retryPolicy },
      circuitBreaker: { ...provider.circuitBreaker },
    }));
  }

  function getProvider(providerId: string) {
    return providersById.get(providerId) ?? null;
  }

  function resolveSelection(
    routingInput: WorkspaceProviderRoutingInput,
  ): WorkspaceResolvedProviderSelection | null {
    const requestType = computeRequestType({
      latestPrompt: routingInput.latestPrompt,
      requestType: routingInput.requestType,
    });
    const tenantRuntimeMode =
      routingInput.tenantRuntimeMode ??
      input.resolveTenantRuntimeMode?.(routingInput.tenantId) ??
      "standard";
    const promptOverride = readPromptProviderOverride(routingInput.latestPrompt);
    const modelOverride = readModelProviderOverride(routingInput.requestedModel);
    const overrideProviderId = promptOverride ?? modelOverride;
    const baseCandidates = resolveAppProviderCandidates(routingInput.appId);
    const candidates =
      overrideProviderId !== null
        ? [
            {
              providerId: overrideProviderId,
              modelId:
                providersById.get(overrideProviderId)?.models[0]?.id ??
                routingInput.requestedModel,
              weight: 1_000,
            },
            ...baseCandidates.filter(
              (candidate) => candidate.providerId !== overrideProviderId,
            ),
          ]
        : tenantRuntimeMode === "strict"
          ? sortCandidatesByWeight(
              baseCandidates.map((candidate) =>
                candidate.providerId === "local_structured"
                  ? { ...candidate, weight: candidate.weight + 200 }
                  : candidate,
              ),
            )
          : tenantRuntimeMode === "degraded"
            ? sortCandidatesByWeight(
                baseCandidates.map((candidate) =>
                  candidate.providerId === "local_fast"
                    ? { ...candidate, weight: candidate.weight + 150 }
                    : candidate,
                ),
              )
            : sortCandidatesByWeight(baseCandidates);

    const primaryCandidate = candidates[0] ?? null;
    const attemptedProviderIds = candidates.map((candidate) => candidate.providerId);
    const selectedCandidate =
      candidates.find((candidate) => {
        const provider = providersById.get(candidate.providerId);

        return (
          provider &&
          provider.status === "available" &&
          provider.circuitBreaker.state !== "open"
        );
      }) ?? null;

    if (!selectedCandidate) {
      return null;
    }

    const provider = providersById.get(selectedCandidate.providerId);

    if (!provider) {
      return null;
    }

    return {
      provider,
      modelId: selectedCandidate.modelId,
      requestType,
      selection: {
        appId: routingInput.appId,
        tenantId: routingInput.tenantId,
        requestType,
        source:
          overrideProviderId !== null
            ? "model_override"
            : selectedCandidate.providerId !== primaryCandidate?.providerId
              ? "fallback"
              : tenantRuntimeMode === "standard"
                ? "app_default"
                : "tenant_runtime_mode",
        candidates,
        attemptedProviderIds,
        fallbackFromProviderId:
          selectedCandidate.providerId === primaryCandidate?.providerId
            ? null
            : primaryCandidate?.providerId ?? null,
      },
    };
  }

  return {
    getProvider,
    listProviders,
    resolveSelection,
  };
}
