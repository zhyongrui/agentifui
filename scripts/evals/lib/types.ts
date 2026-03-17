import type {
  WorkspaceArtifact,
  WorkspaceConversation,
  WorkspacePendingActionRespondRequest,
  WorkspaceRun,
  WorkspaceSafetySignal,
  WorkspaceSourceBlock,
} from "@agentifui/shared/apps";
import type {
  ChatCompletionRequest,
} from "@agentifui/shared/chat";
import type {
  ChatToolChoice,
  ChatToolDescriptor,
} from "@agentifui/shared";

export type EvalPack = "full" | "minimal" | "release" | "incident";

export type EvalActorId = "admin" | "user";

export type EvalFixtureActor = {
  displayName: string;
  emailLocalPart: string;
};

export type EvalKnowledgeSourceSeed = {
  title: string;
  sourceKind: "file" | "markdown" | "url";
  scope: "group" | "tenant";
  groupId?: string | null;
  labels?: string[];
  sourceUri?: string | null;
  content?: string | null;
  status?: "failed" | "processing" | "queued" | "succeeded";
  chunkCount?: number | null;
};

export type EvalToolRegistrySeed = {
  appId: string;
  tools: Array<{
    enabled: boolean;
    execution?: {
      idempotencyScope?: "conversation" | "run";
      maxAttempts?: number;
      timeoutMs?: number;
    };
    name: string;
  }>;
};

export type EvalCompletionStep = {
  actor: EvalActorId;
  kind: "completion";
  message: string;
  requestOverrides?: Partial<Pick<ChatCompletionRequest, "files" | "max_tokens" | "model" | "temperature" | "top_p">>;
  runtimeInput?: Record<string, unknown>;
  toolChoice?: ChatToolChoice;
  tools?: ChatToolDescriptor[];
};

export type EvalPendingActionStep = {
  actor: EvalActorId;
  action: WorkspacePendingActionRespondRequest["action"];
  kind: "pending_action";
  note?: string | null;
  values?: Record<string, string>;
};

export type EvalFixtureStep = EvalCompletionStep | EvalPendingActionStep;

export type EvalFixture = {
  activeGroupId: string;
  appId: string;
  actors?: Partial<Record<EvalActorId, EvalFixtureActor>>;
  description: string;
  fixtureVersion: string;
  id: string;
  packs: EvalPack[];
  promptVersion: string;
  runtimeVersion: string;
  steps: EvalFixtureStep[];
  title: string;
  workstream: string;
  setup?: {
    knowledgeSources?: EvalKnowledgeSourceSeed[];
    toolRegistry?: EvalToolRegistrySeed[];
  };
};

export type EvalNormalizedMessage = {
  artifacts: Array<{
    kind: string;
    summary: string | null;
    title: string;
  }>;
  citations: Array<{
    label: string;
    snippet: string | null;
    title: string;
  }>;
  content: string;
  role: WorkspaceConversation["messages"][number]["role"];
  safetySignals: Array<{
    category: WorkspaceSafetySignal["category"];
    severity: WorkspaceSafetySignal["severity"];
    summary: string;
  }>;
  status: WorkspaceConversation["messages"][number]["status"];
  suggestedPrompts: string[];
  toolCallId: string | null;
  toolCalls: Array<{
    arguments: unknown;
    name: string;
  }>;
  toolName: string | null;
};

export type EvalNormalizedRun = {
  appId: string;
  artifacts: Array<{
    content: unknown;
    kind: WorkspaceArtifact["kind"];
    summary: string | null;
    title: string;
  }>;
  citations: Array<{
    label: string;
    snippet: string | null;
    title: string;
  }>;
  failure:
    | {
        code: string;
        detail: string | null;
        message: string;
        retryable: boolean;
        stage: string;
      }
    | null;
  outputsAssistantText: string | null;
  pendingActions: Array<{
    actionLabels: string[];
    kind: string;
    status: string;
    title: string;
  }>;
  runtime: {
    capabilities: NonNullable<WorkspaceRun["runtime"]>["capabilities"];
    id: string;
    label: string;
    status: string;
  } | null;
  safetySignals: Array<{
    category: WorkspaceSafetySignal["category"];
    severity: WorkspaceSafetySignal["severity"];
    summary: string;
  }>;
  sourceBlocks: Array<{
    kind: WorkspaceSourceBlock["kind"];
    snippet: string | null;
    title: string;
  }>;
  status: WorkspaceRun["status"];
  toolExecutions: Array<{
    attempt: number;
    failureCode: string | null;
    idempotencyKey: string | null;
    latencyMs: number | null;
    maxAttempts: string | null;
    resultPreview: string | null;
    status: WorkspaceRun["toolExecutions"][number]["status"];
    timeoutMs: string | null;
    toolName: string;
  }>;
  triggeredFrom: WorkspaceRun["triggeredFrom"];
  usage: WorkspaceRun["usage"];
  versions: {
    fixtureVersion: string;
    promptVersion: string;
    runtimeVersion: string;
  };
};

export type EvalSnapshot = {
  appId: string;
  conversation: {
    appName: string;
    messageCount: number;
    messages: EvalNormalizedMessage[];
    status: WorkspaceConversation["status"];
    title: string;
  };
  fixtureId: string;
  prompt: string;
  run: EvalNormalizedRun;
  stepCount: number;
  workstream: string;
};

export type EvalDiffEntry = {
  actual: unknown;
  expected: unknown;
  path: string;
};

export type EvalFixtureResult = {
  diffs: EvalDiffEntry[];
  fixture: EvalFixture;
  references: {
    conversationId: string;
    runId: string;
    traceId: string;
  };
  snapshot: EvalSnapshot;
  status: "changed" | "matched" | "missing_golden";
};

export type EvalRunCollection = {
  generatedAt: string;
  gitCommit: string | null;
  pack: EvalPack;
  results: EvalFixtureResult[];
};

export type ReleaseSmokeCheck = {
  name: "admin" | "auth" | "chat";
  notes: string;
  ok: boolean;
};

export type ReleaseGateReport = {
  evals: EvalRunCollection;
  generatedAt: string;
  releaseSmoke: ReleaseSmokeCheck[];
};
