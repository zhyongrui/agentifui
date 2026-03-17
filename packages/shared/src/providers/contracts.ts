import type {
  WorkspaceArtifact,
  WorkspaceCitation,
  WorkspaceHitlStep,
  WorkspaceSafetySignal,
  WorkspaceSourceBlock,
} from "../apps/contracts.js";
import type {
  ChatCompletionFileReference,
  ChatCompletionMessage,
} from "../chat/contracts.js";
import type {
  ChatToolChoice,
  ChatToolDescriptor,
} from "../tools/contracts.js";

export type RuntimeProviderRequestType =
  | "chat_completion"
  | "tool_execution"
  | "file_ingest"
  | "safety_review";

export type RuntimeProviderHealthState = "available" | "degraded";

export type RuntimeProviderCircuitState = "closed" | "open" | "half_open";

export type RuntimeProviderCapabilitySet = {
  chat: boolean;
  tools: boolean;
  files: boolean;
  citations: boolean;
  safety: boolean;
  structuredOutputs: boolean;
  pendingActions: boolean;
};

export type RuntimeProviderPricing = {
  currency: "credits";
  promptPer1kTokens: number;
  completionPer1kTokens: number;
  requestFlat: number;
};

export type RuntimeProviderRetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  backoffMultiplier: number;
  jitter: "none" | "full";
  idempotencyStrategy: "request_hash" | "conversation_scoped" | "run_scoped";
};

export type RuntimeProviderCircuitBreaker = {
  state: RuntimeProviderCircuitState;
  failureCount: number;
  openedAt: string | null;
  resetAfterMs: number;
};

export type RuntimeProviderModelDescriptor = {
  id: string;
  label: string;
  pricing: RuntimeProviderPricing;
};

export type RuntimeProviderDescriptor = {
  id: string;
  label: string;
  adapterId: string;
  status: RuntimeProviderHealthState;
  weight: number;
  capabilities: RuntimeProviderCapabilitySet;
  retryPolicy: RuntimeProviderRetryPolicy;
  circuitBreaker: RuntimeProviderCircuitBreaker;
  models: RuntimeProviderModelDescriptor[];
};

export type RuntimeProviderCandidate = {
  providerId: string;
  modelId: string;
  weight: number;
};

export type RuntimeProviderSelectionPolicy = {
  appId: string;
  tenantId: string;
  requestType: RuntimeProviderRequestType;
  source: "app_default" | "tenant_runtime_mode" | "model_override" | "fallback";
  candidates: RuntimeProviderCandidate[];
};

export type RuntimeProviderRequestEnvelope = {
  providerId: string;
  modelId: string;
  requestType: RuntimeProviderRequestType;
  appId: string;
  tenantId: string;
  conversationId: string | null;
  traceId: string | null;
  activeGroupId: string | null;
  latestPrompt: string;
  messages: ChatCompletionMessage[];
  files: ChatCompletionFileReference[];
  tools: ChatToolDescriptor[];
  toolChoice: ChatToolChoice | undefined;
  inputs: Record<string, unknown> | null;
};

export type RuntimeProviderResponseEnvelope = {
  providerId: string;
  modelId: string;
  requestType: RuntimeProviderRequestType;
  finishReason: "stop" | "tool_calls" | "content_filter" | "length";
  content: string;
  artifacts: WorkspaceArtifact[];
  citations: WorkspaceCitation[];
  safetySignals: WorkspaceSafetySignal[];
  sourceBlocks: WorkspaceSourceBlock[];
  pendingActions: WorkspaceHitlStep[];
};
