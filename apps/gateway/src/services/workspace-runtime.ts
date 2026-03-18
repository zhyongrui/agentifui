import type {
  WorkspaceArtifact,
  WorkspaceCitation,
  WorkspaceConversation,
  WorkspaceConversationAttachment,
  WorkspaceHitlStep,
  WorkspaceInternalNote,
  WorkspacePlanState,
  WorkspaceRuntimeCapabilities,
  WorkspaceRunBranch,
  WorkspaceRunRuntime,
  WorkspaceSafetySignal,
  WorkspaceSourceBlock,
  WorkspaceWorkflowState,
} from "@agentifui/shared/apps";
import type { ChatCompletionMessage } from "@agentifui/shared/chat";
import type {
  ChatToolCall,
  ChatToolChoice,
  ChatToolDescriptor,
  RuntimeProviderDescriptor,
  ToolExecutionPolicy,
  ToolInputSchema,
} from "@agentifui/shared";
import type { KnowledgeRetrievalResult } from "@agentifui/shared";
import { createHash, randomUUID } from "node:crypto";

import { resolveWorkspaceAppRuntimeId } from "./workspace-catalog-fixtures.js";
import {
  createWorkspaceProviderRoutingService,
  type WorkspaceTenantRuntimeMode,
} from "./workspace-provider-routing.js";
import { buildPlaceholderHitlSteps } from "./workspace-hitl.js";
import { resolveSafetySignals } from "./workspace-safety.js";
import { buildWorkspaceToolApprovalStep } from "./workspace-tool-approval.js";

export type WorkspaceRuntimeAdapterId =
  | "placeholder"
  | "placeholder_structured";

export type WorkspaceRuntimeAdapterHealth = {
  id: WorkspaceRuntimeAdapterId;
  label: string;
  status: "available" | "degraded";
  capabilities: WorkspaceRuntimeCapabilities;
};

export type WorkspaceRuntimeHealthSnapshot = {
  overallStatus: "available" | "degraded";
  runtimes: WorkspaceRuntimeAdapterHealth[];
  providers?: RuntimeProviderDescriptor[];
};

export type WorkspaceRuntimeInvocationInput = {
  appId: string;
  attachments: WorkspaceConversationAttachment[];
  conversation: WorkspaceConversation;
  latestPrompt: string;
  messages: ChatCompletionMessage[];
  requestedModel: string;
  retrieval: KnowledgeRetrievalResult | null;
  runtimeInput: Record<string, unknown> | null;
  tenantId?: string;
  tenantRuntimeMode?: WorkspaceTenantRuntimeMode;
  toolChoice?: ChatToolChoice;
  tools?: ChatToolDescriptor[];
};

export type WorkspaceRuntimeInvocationFailure = {
  code: "runtime_unavailable" | "provider_error";
  message: string;
  detail: string | null;
  retryable: boolean;
  runtime: WorkspaceRunRuntime | null;
};

export type WorkspaceRuntimeInvocationOutput = {
  assistantText: string;
  artifacts?: WorkspaceArtifact[];
  branch?: WorkspaceRunBranch | null;
  citations?: WorkspaceCitation[];
  internalNotes?: WorkspaceInternalNote[];
  model?: string;
  pendingActions?: WorkspaceHitlStep[];
  plan?: WorkspacePlanState | null;
  runtime: WorkspaceRunRuntime;
  safetySignals?: WorkspaceSafetySignal[];
  sourceBlocks?: WorkspaceSourceBlock[];
  suggestedPrompts?: string[];
  toolCalls?: ChatToolCall[];
  toolResults?: Array<{
    toolCallId: string;
    toolName: string;
    content: string;
    attempt?: number;
    startedAt?: string;
    finishedAt?: string;
    latencyMs?: number;
    metadata?: Record<string, string>;
    isError?: boolean;
  }>;
  workflow?: WorkspaceWorkflowState | null;
};

export type WorkspaceRuntimeInvocationResult =
  | {
      ok: true;
      data: WorkspaceRuntimeInvocationOutput;
    }
  | {
      ok: false;
      error: WorkspaceRuntimeInvocationFailure;
    };

type WorkspaceRuntimeAdapter = {
  getHealth(): WorkspaceRuntimeAdapterHealth;
  invoke(
    input: WorkspaceRuntimeInvocationInput,
  ): Promise<WorkspaceRuntimeInvocationResult>;
};

export type WorkspaceRuntimeService = {
  getHealthSnapshot(): WorkspaceRuntimeHealthSnapshot;
  invoke(
    input: WorkspaceRuntimeInvocationInput,
  ): Promise<WorkspaceRuntimeInvocationResult>;
};

function extractMessageText(message: ChatCompletionMessage) {
  if (typeof message.content === "string") {
    return message.content.trim();
  }

  return message.content
    .map((part) => {
      if (part.type === "text") {
        return part.text ?? "";
      }

      return `[image:${part.image_url?.url ?? "unknown"}]`;
    })
    .join(" ")
    .trim();
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function normalizeSuggestedPrompts(prompts: string[]) {
  return [
    ...new Set(
      prompts
        .map((prompt) => prompt.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  ].slice(0, 3);
}

function buildSuggestedPrompts(latestPrompt: string) {
  const normalizedPrompt = latestPrompt.replace(/\s+/g, " ").trim();
  const topic =
    normalizedPrompt.length > 0
      ? normalizedPrompt.slice(0, 72)
      : "this workspace task";

  return normalizeSuggestedPrompts([
    `Summarize the key takeaways about "${topic}".`,
    `List the next checks I should run for "${topic}".`,
    `Draft a short stakeholder update about "${topic}".`,
  ]);
}

function slugifyToolToken(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

type PlaceholderToolSimulation = {
  alwaysFail: boolean;
  alwaysTimeout: boolean;
  failAttemptsBeforeSuccess: number;
};

function hashToolExecutionScope(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function buildToolIdempotencyKey(input: {
  conversation: WorkspaceConversation;
  policy: ToolExecutionPolicy | null;
  toolCall: ChatToolCall;
}) {
  const scope =
    input.policy?.idempotencyScope === "conversation"
      ? input.conversation.id
      : input.conversation.run.id;

  return `tool_idem_${hashToolExecutionScope(
    `${scope}:${input.toolCall.function.name}:${input.toolCall.function.arguments}`,
  )}`;
}

function normalizeExecutionPolicy(policy: ToolExecutionPolicy | undefined) {
  return {
    timeoutMs:
      typeof policy?.timeoutMs === "number" &&
      Number.isFinite(policy.timeoutMs) &&
      policy.timeoutMs > 0
        ? Math.round(policy.timeoutMs)
        : 150,
    maxAttempts:
      typeof policy?.maxAttempts === "number" &&
      Number.isFinite(policy.maxAttempts) &&
      policy.maxAttempts > 0
        ? Math.round(policy.maxAttempts)
        : 1,
    idempotencyScope:
      policy?.idempotencyScope === "conversation" ? "conversation" : "run",
  } satisfies Required<ToolExecutionPolicy>;
}

function readToolSimulation(
  runtimeInput: Record<string, unknown> | null,
  toolName: string,
): PlaceholderToolSimulation {
  const toolSimulation = runtimeInput?.toolSimulation;

  if (typeof toolSimulation !== "object" || toolSimulation === null) {
    return {
      alwaysFail: false,
      alwaysTimeout: false,
      failAttemptsBeforeSuccess: 0,
    };
  }

  const simulationRecord = toolSimulation as Record<string, unknown>;
  const rawSimulation = simulationRecord[toolName];

  if (typeof rawSimulation !== "object" || rawSimulation === null) {
    return {
      alwaysFail: false,
      alwaysTimeout: false,
      failAttemptsBeforeSuccess: 0,
    };
  }

  const record = rawSimulation as Record<string, unknown>;

  return {
    alwaysFail: record.alwaysFail === true,
    alwaysTimeout: record.alwaysTimeout === true,
    failAttemptsBeforeSuccess:
      typeof record.failAttemptsBeforeSuccess === "number" &&
      Number.isFinite(record.failAttemptsBeforeSuccess) &&
      record.failAttemptsBeforeSuccess > 0
        ? Math.round(record.failAttemptsBeforeSuccess)
        : 0,
  };
}

function buildToolExecutionAttemptMetadata(input: {
  failureReason: "provider_error" | "timeout" | null;
  idempotencyKey: string;
  maxAttempts: number;
  timeoutMs: number;
}) {
  return {
    idempotencyKey: input.idempotencyKey,
    maxAttempts: String(input.maxAttempts),
    timeoutMs: String(input.timeoutMs),
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
  } satisfies Record<string, string>;
}

function resolveSchemaType(schema: ToolInputSchema) {
  if (Array.isArray(schema.type)) {
    return schema.type.find((entry) => entry !== "null") ?? schema.type[0];
  }

  return schema.type;
}

function buildToolSchemaValue(input: {
  schema: ToolInputSchema;
  latestPrompt: string;
  conversation: WorkspaceConversation;
  keyPath?: string[];
}): unknown {
  const keyPath = input.keyPath ?? [];
  const key = keyPath[keyPath.length - 1]?.toLowerCase() ?? "";
  const schemaType = resolveSchemaType(input.schema);
  const fallbackPrompt =
    input.latestPrompt || "Continue the current workspace task.";

  if (input.schema.enum && input.schema.enum.length > 0) {
    return input.schema.enum[0];
  }

  if (schemaType === "number" || schemaType === "integer") {
    return Math.min(
      typeof input.schema.maximum === "number" ? input.schema.maximum : 3,
      3,
    );
  }

  if (schemaType === "boolean") {
    return true;
  }

  if (schemaType === "array") {
    const itemValue = buildToolSchemaValue({
      ...input,
      schema: input.schema.items ?? {
        type: "string",
      },
    });
    return [itemValue];
  }

  if (schemaType === "object" || input.schema.properties) {
    const properties = input.schema.properties ?? {};
    const entries = Object.entries(properties);

    if (entries.length === 0) {
      return {
        request: fallbackPrompt,
      };
    }

    return Object.fromEntries(
      entries.map(([propertyKey, propertySchema]) => [
        propertyKey,
        buildToolSchemaValue({
          ...input,
          schema: propertySchema,
          keyPath: [...keyPath, propertyKey],
        }),
      ]),
    );
  }

  if (schemaType === "null") {
    return null;
  }

  if (key.includes("query") || key.includes("prompt") || key.includes("request")) {
    return fallbackPrompt;
  }

  if (key.includes("group")) {
    return input.conversation.activeGroup.name;
  }

  if (key.includes("app")) {
    return input.conversation.app.name;
  }

  if (key.includes("trace")) {
    return input.conversation.run.traceId;
  }

  return `${input.conversation.app.name}: ${fallbackPrompt}`;
}

function selectRuntimeTool(input: WorkspaceRuntimeInvocationInput) {
  const tools =
    input.tools?.filter((tool) => tool.enabled !== false) ?? [];
  const functionToolChoice =
    input.toolChoice &&
    input.toolChoice !== "auto" &&
    input.toolChoice !== "none"
      ? input.toolChoice
      : null;

  if (tools.length === 0 || input.toolChoice === "none") {
    return null;
  }

  if (functionToolChoice) {
    return (
      tools.find(
        (tool) =>
          tool.function.name.trim() === functionToolChoice.function.name.trim(),
      ) ?? null
    );
  }

  return tools[0] ?? null;
}

function buildPlaceholderToolExecution(
  input: WorkspaceRuntimeInvocationInput,
) {
  const selectedTool = selectRuntimeTool(input);

  if (!selectedTool) {
    return null;
  }

  const argumentsValue = buildToolSchemaValue({
    schema: selectedTool.function.inputSchema,
    latestPrompt: input.latestPrompt,
    conversation: input.conversation,
  });
  const toolCallId = `call_${slugifyToolToken(selectedTool.function.name)}_${randomUUID().slice(0, 8)}`;
  const toolCall: ChatToolCall = {
    id: toolCallId,
    type: "function",
    function: {
      name: selectedTool.function.name,
      arguments: JSON.stringify(argumentsValue),
    },
  };
  const executionPolicy = normalizeExecutionPolicy(selectedTool.execution);
  const idempotencyKey = buildToolIdempotencyKey({
    conversation: input.conversation,
    policy: executionPolicy,
    toolCall,
  });

  if (selectedTool.auth.requiresApproval) {
    return {
      approvalRequired: true,
      pendingActions: [
        buildWorkspaceToolApprovalStep({
          conversationId: input.conversation.id,
          createdAt: new Date().toISOString(),
          idempotencyKey,
          maxAttempts: executionPolicy.maxAttempts,
          policyTag: selectedTool.auth.policyTag ?? null,
          runId: input.conversation.run.id,
          timeoutMs: executionPolicy.timeoutMs,
          toolCall,
        }),
      ],
      toolCalls: [toolCall],
    };
  }

  const simulation = readToolSimulation(
    input.runtimeInput,
    selectedTool.function.name,
  );
  const toolResults: NonNullable<WorkspaceRuntimeInvocationOutput["toolResults"]> =
    [];
  let successRecorded = false;

  for (let attempt = 1; attempt <= executionPolicy.maxAttempts; attempt += 1) {
    const startedAt = new Date().toISOString();
    const shouldTimeout = simulation.alwaysTimeout;
    const shouldFail =
      !shouldTimeout &&
      (simulation.alwaysFail || attempt <= simulation.failAttemptsBeforeSuccess);
    const finishedAt = new Date().toISOString();
    const metadata = buildToolExecutionAttemptMetadata({
      failureReason: shouldTimeout
        ? "timeout"
        : shouldFail
          ? "provider_error"
          : null,
      idempotencyKey,
      maxAttempts: executionPolicy.maxAttempts,
      timeoutMs: executionPolicy.timeoutMs,
    });

    if (shouldTimeout) {
      toolResults.push({
        toolCallId: toolCall.id,
        toolName: selectedTool.function.name,
        content: `Tool \`${selectedTool.function.name}\` timed out after ${executionPolicy.timeoutMs} ms on attempt ${attempt}.`,
        attempt,
        startedAt,
        finishedAt,
        latencyMs: executionPolicy.timeoutMs,
        metadata,
        isError: true,
      });
      continue;
    }

    if (shouldFail) {
      toolResults.push({
        toolCallId: toolCall.id,
        toolName: selectedTool.function.name,
        content: `Tool \`${selectedTool.function.name}\` failed on attempt ${attempt}. Retrying is allowed.`,
        attempt,
        startedAt,
        finishedAt,
        latencyMs: Math.max(1, executionPolicy.timeoutMs - 10),
        metadata,
        isError: true,
      });
      continue;
    }

  const toolOutput = {
    ok: true,
    tool: selectedTool.function.name,
    scope: selectedTool.auth.scope,
    attributedGroupId: input.conversation.activeGroup.id,
    attributedGroupName: input.conversation.activeGroup.name,
    traceId: input.conversation.run.traceId,
    receivedArguments: argumentsValue,
    summary:
      attempt > 1
        ? `Placeholder execution completed for ${selectedTool.function.name} after ${attempt} attempts.`
        : `Placeholder execution completed for ${selectedTool.function.name}.`,
  };

    toolResults.push({
      toolCallId,
      toolName: selectedTool.function.name,
      content: [
        `Tool \`${selectedTool.function.name}\` executed successfully.`,
        "",
        "```json",
        JSON.stringify(toolOutput, null, 2),
        "```",
      ].join("\n"),
      attempt,
      startedAt,
      finishedAt,
      latencyMs: Math.max(1, executionPolicy.timeoutMs - 20),
      metadata,
      isError: false,
    });
    successRecorded = true;
    break;
  }

  if (!successRecorded && toolResults.length === 0) {
    toolResults.push({
      toolCallId,
      toolName: selectedTool.function.name,
      content: `Tool \`${selectedTool.function.name}\` did not produce an execution result.`,
      attempt: 1,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      latencyMs: executionPolicy.timeoutMs,
      metadata: buildToolExecutionAttemptMetadata({
        failureReason: "provider_error",
        idempotencyKey,
        maxAttempts: executionPolicy.maxAttempts,
        timeoutMs: executionPolicy.timeoutMs,
      }),
      isError: true,
    });
  }

  return {
    approvalRequired: false,
    toolCalls: [toolCall],
    toolResults,
  };
}

function truncateArtifactText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function buildArtifactTitle(appName: string, latestPrompt: string) {
  const promptTitle = truncateArtifactText(latestPrompt, 48);
  return promptTitle.length > 0 ? promptTitle : `${appName} response`;
}

function buildSourceLabel(index: number) {
  return `S${index + 1}`;
}

function buildAssistantArtifacts(input: {
  appName: string;
  assistantText: string;
  createdAt: string;
  latestPrompt: string;
}): WorkspaceArtifact[] {
  const content = input.assistantText.trim();

  if (content.length === 0) {
    return [];
  }

  return [
    {
      id: `artifact_${randomUUID()}`,
      title: buildArtifactTitle(input.appName, input.latestPrompt),
      kind: "markdown",
      source: "assistant_response",
      status: "draft",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      summary: truncateArtifactText(content, 120),
      mimeType: "text/markdown",
      sizeBytes: Buffer.byteLength(content, "utf8"),
      content,
    },
  ];
}

function buildAssistantSources(input: {
  attachments: WorkspaceConversationAttachment[];
  conversation: WorkspaceConversation;
  latestPrompt: string;
  retrieval: KnowledgeRetrievalResult | null;
}) {
  const sourceBlocks: WorkspaceSourceBlock[] = [
    {
      id: `source_${randomUUID()}`,
      kind: "workspace_context",
      title: `${input.conversation.app.name} workspace context`,
      href: null,
      snippet: `Attributed group ${input.conversation.activeGroup.name}. Latest request: ${
        input.latestPrompt || "Continue the current workspace task."
      }`,
      metadata: {
        groupId: input.conversation.activeGroup.id,
        groupName: input.conversation.activeGroup.name,
        traceId: input.conversation.run.traceId,
      },
    },
    {
      id: `source_${randomUUID()}`,
      kind: "app_reference",
      title: `${input.conversation.app.name} app summary`,
      href: null,
      snippet: input.conversation.app.summary,
      metadata: {
        appId: input.conversation.app.id,
        appSlug: input.conversation.app.slug,
        appKind: input.conversation.app.kind,
      },
    },
    ...input.attachments.map((attachment) => ({
      id: `source_${randomUUID()}`,
      kind: "attachment" as const,
      title: attachment.fileName,
      href: null,
      snippet: `${attachment.contentType} · ${attachment.sizeBytes} bytes`,
      metadata: {
        attachmentId: attachment.id,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes.toString(),
      },
    })),
    ...(input.retrieval?.matches ?? []).map(match => ({
      id: `source_${randomUUID()}`,
      kind: "knowledge" as const,
      title: match.title,
      href: match.sourceUri,
      snippet: match.preview,
      metadata: {
        sourceId: match.sourceId,
        chunkId: match.chunkId,
        scope: match.scope,
        score: match.score.toString(),
        ...(match.headingPath.length > 0
          ? {
              headingPath: match.headingPath.join(" / "),
            }
          : {}),
      },
    })),
  ];

  return {
    citations: sourceBlocks.map((sourceBlock, index) => ({
      id: `citation_${randomUUID()}`,
      label: buildSourceLabel(index),
      title: sourceBlock.title,
      sourceBlockId: sourceBlock.id,
      href: sourceBlock.href,
      snippet: sourceBlock.snippet,
    })),
    sourceBlocks,
  };
}

function buildPlaceholderAssistantText(
  conversation: WorkspaceConversation,
  messages: ChatCompletionMessage[],
  attachments: WorkspaceConversationAttachment[],
  toolCalls: ChatToolCall[] = [],
  approvalRequired = false,
) {
  const latestPrompt = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const requestSummary = latestPrompt ? extractMessageText(latestPrompt) : "";
  const attachmentSummary =
    attachments.length > 0
      ? `Attachments: ${attachments
          .map(
            (file) =>
              `${file.fileName} (${file.contentType}, ${file.sizeBytes} bytes)`,
          )
          .join(", ")}.`
      : null;

  return [
    `${conversation.app.name} is now reachable through the AgentifUI gateway.`,
    `Request: ${requestSummary || "Continue the current workspace task."}`,
    attachmentSummary,
    toolCalls.length > 0
      ? approvalRequired
        ? `Tool approval required: ${toolCalls.map((toolCall) => toolCall.function.name).join(", ")}.`
        : `Tools used: ${toolCalls.map((toolCall) => toolCall.function.name).join(", ")}.`
      : null,
    `Context: attributed group ${conversation.activeGroup.name}, trace ${conversation.run.traceId}.`,
    "This is the Phase 1 protocol response path that R7 wires onto the persisted conversation/run boundary.",
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join("\n\n");
}

function buildStructuredAssistantText(
  conversation: WorkspaceConversation,
  latestPrompt: string,
  retrieval: KnowledgeRetrievalResult | null,
  toolCalls: ChatToolCall[] = [],
  approvalRequired = false,
) {
  const requestSummary = latestPrompt || "Continue the current runbook task.";
  const retrievalSummary =
    retrieval && retrieval.matches.length > 0
      ? `Grounding: retrieved ${retrieval.matches.length} knowledge chunk${retrieval.matches.length === 1 ? '' : 's'} for this request.`
      : null;

  return [
    `${conversation.app.name} translated the request into a structured execution outline.`,
    `Request: ${requestSummary}`,
    retrievalSummary,
    toolCalls.length > 0
      ? approvalRequired
        ? `Tool approval required: ${toolCalls.map((toolCall) => toolCall.function.name).join(", ")}.`
        : `Tools used: ${toolCalls.map((toolCall) => toolCall.function.name).join(", ")}.`
      : null,
    `Context: attributed group ${conversation.activeGroup.name}, trace ${conversation.run.traceId}.`,
    "Plan:",
    "1. Confirm prerequisites and owners.",
    "2. Execute the SOP in ordered stages.",
    "3. Record follow-up checks and evidence before handoff.",
  ].join("\n\n");
}

function buildStructuredPlanState(input: {
  assistantText: string;
  artifacts: WorkspaceArtifact[];
  citations: WorkspaceCitation[];
  createdAt: string;
}): WorkspacePlanState {
  const artifactSummaries = input.artifacts.map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    source: artifact.source,
    status: artifact.status,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    summary: artifact.summary,
    mimeType: artifact.mimeType,
    sizeBytes: artifact.sizeBytes,
  }));
  const steps: WorkspacePlanState["steps"] = [
    {
      id: "step_scope",
      title: "Confirm scope and owners",
      description: "Validate request intent, owners, and success criteria before execution.",
      nodeType: "prompt" as const,
      status: "in_progress" as const,
      owner: "operator",
      dependsOnStepIds: [],
      startedAt: input.createdAt,
      finishedAt: null,
      internalSummary: input.assistantText.split("\n")[0] ?? null,
      artifacts: [],
      citations: input.citations.slice(0, 1),
    },
    {
      id: "step_execute",
      title: "Execute structured workflow",
      description: "Run the ordered SOP stages and collect evidence.",
      nodeType: "transform" as const,
      status: "pending" as const,
      owner: "agent",
      dependsOnStepIds: ["step_scope"],
      startedAt: null,
      finishedAt: null,
      internalSummary: null,
      artifacts: artifactSummaries,
      citations: input.citations.slice(0, 2),
    },
    {
      id: "step_handoff",
      title: "Review and handoff",
      description: "Review follow-up checks, blockers, and final ownership before closeout.",
      nodeType: "export" as const,
      status: "pending" as const,
      owner: "reviewer",
      dependsOnStepIds: ["step_execute"],
      startedAt: null,
      finishedAt: null,
      internalSummary: null,
      artifacts: [],
      citations: input.citations.slice(0, 1),
    },
  ];

  return {
    status: "in_progress",
    activeStepId: "step_scope",
    steps,
  };
}

function buildStructuredWorkflowState(input: {
  conversation: WorkspaceConversation;
  createdAt: string;
}): WorkspaceWorkflowState {
  return {
    definitionId: `workflow_${input.conversation.app.id}`,
    versionId: `wfver_${input.conversation.app.id}_1`,
    name: `${input.conversation.app.name} workflow`,
    versionNumber: 1,
    status: "running",
    resumable: true,
    currentStepId: "step_scope",
    lastResumedAt: input.createdAt,
    pausedAt: null,
    resumedFromRunId: null,
    runnerRoles: ["runner"],
  };
}

function buildStructuredInternalNotes(input: {
  assistantText: string;
  createdAt: string;
}): WorkspaceInternalNote[] {
  return [
    {
      id: `note_${randomUUID()}`,
      channel: "internal_redacted",
      createdAt: input.createdAt,
      summary: truncateArtifactText(input.assistantText, 120),
    },
  ];
}

function buildRuntimeMetadata(input: {
  adapter: WorkspaceRuntimeAdapterHealth;
  modelId: string;
  provider: RuntimeProviderDescriptor;
  requestType: "chat_completion" | "file_ingest" | "safety_review" | "tool_execution";
  selection: WorkspaceRunRuntime["selection"];
}): WorkspaceRunRuntime {
  return {
    id: input.adapter.id,
    label: input.adapter.label,
    status: input.adapter.status,
    capabilities: input.adapter.capabilities,
    invokedAt: new Date().toISOString(),
    providerId: input.provider.id,
    providerLabel: input.provider.label,
    modelId: input.modelId,
    requestType: input.requestType,
    pricing: input.provider.models[0]?.pricing ?? {
      currency: "credits",
      promptPer1kTokens: 0,
      completionPer1kTokens: 0,
      requestFlat: 0,
    },
    retryPolicy: input.provider.retryPolicy,
    circuitBreaker: input.provider.circuitBreaker,
    selection: input.selection,
  };
}

function createPlaceholderAdapter(input: {
  id: WorkspaceRuntimeAdapterId;
  label: string;
  status?: WorkspaceRuntimeAdapterHealth["status"];
  structured?: boolean;
}): WorkspaceRuntimeAdapter {
  const health: WorkspaceRuntimeAdapterHealth = {
    id: input.id,
    label: input.label,
    status: input.status ?? "available",
    capabilities: {
      streaming: true,
      citations: true,
      artifacts: true,
      safety: true,
      pendingActions: true,
      files: true,
    },
  };

  return {
    getHealth() {
      return health;
    },
    async invoke(runtimeInput) {
      const latestPrompt = runtimeInput.latestPrompt;
      const toolExecution = buildPlaceholderToolExecution(runtimeInput);
      const toolCalls = toolExecution?.toolCalls ?? [];
      const approvalRequired = toolExecution?.approvalRequired ?? false;
      const assistantText = input.structured
        ? buildStructuredAssistantText(
            runtimeInput.conversation,
            latestPrompt,
            runtimeInput.retrieval,
            toolCalls,
            approvalRequired,
          )
        : buildPlaceholderAssistantText(
            runtimeInput.conversation,
            runtimeInput.messages,
            runtimeInput.attachments,
            toolCalls,
            approvalRequired,
          );
      const createdAt = new Date().toISOString();
      const { citations, sourceBlocks } = buildAssistantSources({
        attachments: runtimeInput.attachments,
        conversation: runtimeInput.conversation,
        latestPrompt,
        retrieval: runtimeInput.retrieval,
      });
      const safetySignals = resolveSafetySignals({
        latestPrompt,
        recordedAt: createdAt,
        runtimeInput: runtimeInput.runtimeInput,
      });
      const suggestedPrompts = buildSuggestedPrompts(latestPrompt);
      const artifacts = buildAssistantArtifacts({
        appName: runtimeInput.conversation.app.name,
        assistantText,
        createdAt,
        latestPrompt,
      });
      const plan = input.structured
        ? buildStructuredPlanState({
            assistantText,
            artifacts,
            citations,
            createdAt,
          })
        : null;
      const workflow = input.structured
        ? buildStructuredWorkflowState({
            conversation: runtimeInput.conversation,
            createdAt,
          })
        : null;
      const internalNotes = input.structured
        ? buildStructuredInternalNotes({
            assistantText,
            createdAt,
          })
        : [];
      const pendingActions =
        toolExecution?.pendingActions && toolExecution.pendingActions.length > 0
          ? toolExecution.pendingActions
          : buildPlaceholderHitlSteps({
              appId: runtimeInput.appId,
              conversationId: runtimeInput.conversation.id,
              createdAt,
              latestPrompt,
              runId: runtimeInput.conversation.run.id,
            });

      return {
        ok: true,
        data: {
          assistantText,
          artifacts,
          branch: null,
          citations,
          internalNotes,
          model: runtimeInput.requestedModel,
          pendingActions,
          plan,
          runtime: {
            id: health.id,
            label: health.label,
            status: health.status,
            capabilities: health.capabilities,
            invokedAt: createdAt,
          },
          safetySignals,
          sourceBlocks,
          suggestedPrompts,
          toolCalls,
          toolResults: toolExecution?.toolResults,
          workflow,
        },
      };
    },
  };
}

export function createWorkspaceRuntimeService(input: {
  adapters?: Partial<Record<WorkspaceRuntimeAdapterId, WorkspaceRuntimeAdapter>>;
  degradedRuntimeIds?: string[];
  degradedProviderIds?: string[];
  openCircuitProviderIds?: string[];
  resolveAppRuntimeId?: (appId: string) => WorkspaceRuntimeAdapterId;
  resolveTenantRuntimeMode?: (tenantId: string) => WorkspaceTenantRuntimeMode;
} = {}): WorkspaceRuntimeService {
  const degradedRuntimeIds = new Set(input.degradedRuntimeIds ?? []);
  const adapters: Record<WorkspaceRuntimeAdapterId, WorkspaceRuntimeAdapter> = {
    placeholder: createPlaceholderAdapter({
      id: "placeholder",
      label: "Placeholder Runtime",
      status: degradedRuntimeIds.has("placeholder") ? "degraded" : "available",
    }),
    placeholder_structured: createPlaceholderAdapter({
      id: "placeholder_structured",
      label: "Structured Placeholder Runtime",
      status: degradedRuntimeIds.has("placeholder_structured")
        ? "degraded"
        : "available",
      structured: true,
    }),
    ...input.adapters,
  };
  const providerRoutingService = createWorkspaceProviderRoutingService({
    degradedProviderIds: input.degradedProviderIds,
    openCircuitProviderIds: input.openCircuitProviderIds,
    resolveTenantRuntimeMode: input.resolveTenantRuntimeMode,
  });

  return {
    getHealthSnapshot() {
      const runtimes = Object.values(adapters).map((adapter) =>
        adapter.getHealth(),
      );
      const providers = providerRoutingService.listProviders();

      return {
        overallStatus:
          runtimes.some((runtime) => runtime.status === "degraded") ||
          providers.some(
            (provider) =>
              provider.status === "degraded" ||
              provider.circuitBreaker.state === "open",
          )
          ? "degraded"
          : "available",
        runtimes,
        providers,
      };
    },
    async invoke(runtimeInput) {
      const selection = providerRoutingService.resolveSelection({
        appId: runtimeInput.appId,
        latestPrompt: runtimeInput.latestPrompt,
        requestedModel: runtimeInput.requestedModel,
        tenantId: runtimeInput.tenantId ?? "default-tenant",
        tenantRuntimeMode: runtimeInput.tenantRuntimeMode,
        requestType:
          runtimeInput.tools && runtimeInput.tools.length > 0
            ? "tool_execution"
            : runtimeInput.attachments.length > 0
              ? "file_ingest"
              : "chat_completion",
      });

      if (!selection) {
        return {
          ok: false,
          error: {
            code: "runtime_unavailable",
            message: "No runtime provider is currently available.",
            detail:
              "Review provider health, circuit-breaker state, and tenant runtime policy before retrying.",
            retryable: true,
            runtime: null,
          },
        };
      }

      const candidateSelections = selection.selection.candidates
        .map((candidate) => ({
          candidate,
          provider: providerRoutingService.getProvider(candidate.providerId),
        }))
        .filter(
          (entry): entry is {
            candidate: (typeof selection.selection.candidates)[number];
            provider: RuntimeProviderDescriptor;
          } => entry.provider !== null,
        );

      let lastFailure: WorkspaceRuntimeInvocationFailure | null = null;

      for (const [index, entry] of candidateSelections.entries()) {
        const provider = entry.provider;
        const providerAdapter =
          adapters[provider.adapterId as WorkspaceRuntimeAdapterId] ?? null;

        if (
          provider.status !== "available" ||
          provider.circuitBreaker.state === "open"
        ) {
          lastFailure = {
            code: "runtime_unavailable",
            message: `${provider.label} is currently unavailable.`,
            detail:
              provider.circuitBreaker.state === "open"
                ? "The provider circuit breaker is open and the router will try the next candidate."
                : "The provider is degraded and the router will try the next candidate.",
            retryable: true,
            runtime: providerAdapter
              ? buildRuntimeMetadata({
                  adapter: providerAdapter.getHealth(),
                  modelId: entry.candidate.modelId,
                  provider,
                  requestType: selection.requestType,
                  selection: {
                    ...selection.selection,
                    attemptedProviderIds: selection.selection.attemptedProviderIds.slice(
                      0,
                      index + 1,
                    ),
                    fallbackFromProviderId:
                      index === 0 ? null : candidateSelections[0]?.candidate.providerId ?? null,
                  },
                })
              : null,
          };
          continue;
        }

        const adapterId =
          input.resolveAppRuntimeId?.(runtimeInput.appId) ??
          (provider.adapterId as WorkspaceRuntimeAdapterId) ??
          resolveWorkspaceAppRuntimeId(runtimeInput.appId);
        const adapter = adapters[adapterId];

        if (!adapter) {
          lastFailure = {
            code: "runtime_unavailable",
            message: `The runtime adapter "${adapterId}" is not configured.`,
            detail: "Register the adapter before routing this app to it.",
            retryable: false,
            runtime: null,
          };
          continue;
        }

        const health = adapter.getHealth();

        if (health.status !== "available") {
          lastFailure = {
            code: "runtime_unavailable",
            message: `${health.label} is currently degraded.`,
            detail:
              "Wait for the adapter health probe to recover or allow the router to fall back.",
            retryable: true,
            runtime: buildRuntimeMetadata({
              adapter: health,
              modelId: entry.candidate.modelId,
              provider,
              requestType: selection.requestType,
              selection: {
                ...selection.selection,
                attemptedProviderIds: selection.selection.attemptedProviderIds.slice(
                  0,
                  index + 1,
                ),
                fallbackFromProviderId:
                  index === 0 ? null : candidateSelections[0]?.candidate.providerId ?? null,
              },
            }),
          };
          continue;
        }

        const result = await adapter.invoke(runtimeInput);

        if (result.ok) {
          return {
            ok: true,
            data: {
              ...result.data,
              model: entry.candidate.modelId,
              runtime: buildRuntimeMetadata({
                adapter: health,
                modelId: entry.candidate.modelId,
                provider,
                requestType: selection.requestType,
                selection: {
                  ...selection.selection,
                  source:
                    index === 0 ? selection.selection.source : "fallback",
                  attemptedProviderIds: selection.selection.attemptedProviderIds.slice(
                    0,
                    index + 1,
                  ),
                  fallbackFromProviderId:
                    index === 0 ? null : candidateSelections[0]?.candidate.providerId ?? null,
                },
              }),
            },
          };
        }

        lastFailure = {
          ...result.error,
          runtime: buildRuntimeMetadata({
            adapter: health,
            modelId: entry.candidate.modelId,
            provider,
            requestType: selection.requestType,
            selection: {
              ...selection.selection,
              source:
                index === 0 ? selection.selection.source : "fallback",
              attemptedProviderIds: selection.selection.attemptedProviderIds.slice(
                0,
                index + 1,
              ),
              fallbackFromProviderId:
                index === 0 ? null : candidateSelections[0]?.candidate.providerId ?? null,
            },
          }),
        };

        if (!result.error.retryable) {
          return {
            ok: false,
            error: lastFailure,
          };
        }
      }

      return {
        ok: false,
        error:
          lastFailure ??
          {
            code: "runtime_unavailable",
            message: "No runtime provider could satisfy this request.",
            detail:
              "Review provider policy candidates, adapter health, and circuit-breaker state.",
            retryable: true,
            runtime: null,
          },
      };
    },
  };
}

export function summarizeRuntimePrompt(messages: ChatCompletionMessage[]) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  return latestUserMessage ? extractMessageText(latestUserMessage) : "";
}

export function estimateRuntimePromptTokens(messages: ChatCompletionMessage[]) {
  return messages.reduce(
    (total, message) => total + estimateTokens(extractMessageText(message)),
    0,
  );
}

export function estimateRuntimeCompletionTokens(text: string) {
  return estimateTokens(text);
}
