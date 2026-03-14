import type {
  WorkspaceArtifact,
  WorkspaceArtifactSummary,
  WorkspaceConversation,
  WorkspaceConversationAttachment,
  WorkspaceHitlStep,
  WorkspaceConversationMessage,
  WorkspaceConversationMessageStatus,
} from "@agentifui/shared/apps";
import type { AuthUser } from "@agentifui/shared/auth";
import type {
  ChatCompletionChunk,
  ChatCompletionFileReference,
  ChatCompletionMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionStopResponse,
  ChatGatewayErrorCode,
  ChatGatewayErrorResponse,
  ChatGatewayErrorType,
  ChatModel,
  ChatModelsResponse,
} from "@agentifui/shared/chat";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import type { AuditService } from "../services/audit-service.js";
import type { AuthService } from "../services/auth-service.js";
import { buildPlaceholderHitlSteps } from "../services/workspace-hitl.js";
import { buildWorkspaceRunFailure } from "../services/workspace-run-failure.js";
import { calculateCompletionQuotaCost } from "../services/workspace-quota.js";
import type { WorkspaceService } from "../services/workspace-service.js";

type ActiveSessionResult =
  | {
      ok: true;
      user: AuthUser;
    }
  | {
      ok: false;
      statusCode: 401 | 403;
      response: ChatGatewayErrorResponse;
    };

type ActiveStreamState = {
  stopRequested: boolean;
};

const STREAM_CHUNK_DELAY_MS = 80;
const activeStreams = new Map<string, ActiveStreamState>();

function buildTraceId() {
  return randomUUID().replace(/-/g, "");
}

function buildConversationMessageId() {
  return `msg_${randomUUID()}`;
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

function toArtifactSummary(artifact: WorkspaceArtifact): WorkspaceArtifactSummary {
  return {
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
  };
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

async function recordQuotaUsageAudit(input: {
  auditService: AuditService;
  completionTokens: number;
  conversation: WorkspaceConversation;
  ipAddress: string;
  promptTokens: number;
  runId: string;
  runStatus: WorkspaceConversation["run"]["status"];
  totalTokens: number;
  traceId: string;
  user: AuthUser;
}) {
  const quotaUsageCost = calculateCompletionQuotaCost(input.totalTokens);

  if (quotaUsageCost <= 0) {
    return;
  }

  await input.auditService.recordEvent({
    tenantId: input.user.tenantId,
    actorUserId: input.user.id,
    action: "workspace.quota.usage_recorded",
    entityType: "run",
    entityId: input.runId,
    ipAddress: input.ipAddress,
    payload: {
      conversationId: input.conversation.id,
      appId: input.conversation.app.id,
      appName: input.conversation.app.name,
      activeGroupId: input.conversation.activeGroup.id,
      activeGroupName: input.conversation.activeGroup.name,
      runId: input.runId,
      runStatus: input.runStatus,
      traceId: input.traceId,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      quotaUsageCost,
    },
  });
}

async function recordArtifactGeneratedAudit(input: {
  artifacts: WorkspaceArtifact[];
  auditService: AuditService;
  conversation: WorkspaceConversation;
  ipAddress: string;
  runId: string;
  traceId: string;
  user: AuthUser;
}) {
  for (const artifact of input.artifacts) {
    await input.auditService.recordEvent({
      tenantId: input.user.tenantId,
      actorUserId: input.user.id,
      action: "workspace.artifact.generated",
      entityType: "artifact",
      entityId: artifact.id,
      ipAddress: input.ipAddress,
      payload: {
        artifactId: artifact.id,
        title: artifact.title,
        kind: artifact.kind,
        source: artifact.source,
        status: artifact.status,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        conversationId: input.conversation.id,
        runId: input.runId,
        traceId: input.traceId,
        appId: input.conversation.app.id,
        appName: input.conversation.app.name,
        activeGroupId: input.conversation.activeGroup.id,
        activeGroupName: input.conversation.activeGroup.name,
      },
    });
  }
}

function readBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function buildErrorResponse(
  traceId: string,
  input: {
    message: string;
    type: ChatGatewayErrorType;
    code: ChatGatewayErrorCode;
    param?: string;
  },
): ChatGatewayErrorResponse {
  return {
    error: {
      message: input.message,
      type: input.type,
      code: input.code,
      param: input.param,
      trace_id: traceId,
    },
  };
}

async function requireActiveSession(
  authService: AuthService,
  authorization: string | undefined,
  traceId: string,
): Promise<ActiveSessionResult> {
  const sessionToken = readBearerToken(authorization);

  if (!sessionToken) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse(traceId, {
        type: "authentication_error",
        code: "invalid_token",
        message: "A valid session token is required to call the chat gateway.",
      }),
    };
  }

  const user = await authService.getUserBySessionToken(sessionToken);

  if (!user) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse(traceId, {
        type: "authentication_error",
        code: "invalid_token",
        message: "The current chat gateway session is missing or has expired.",
      }),
    };
  }

  if (user.status !== "active") {
    return {
      ok: false,
      statusCode: 403,
      response: buildErrorResponse(traceId, {
        type: "permission_denied",
        code: "app_not_authorized",
        message: "Only active users can invoke workspace chat applications.",
      }),
    };
  }

  return {
    ok: true,
    user,
  };
}

function isContentPart(value: unknown): value is {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const part = value as Record<string, unknown>;

  if (part.type === "text") {
    return typeof part.text === "string";
  }

  if (part.type === "image_url") {
    const imageUrl = part.image_url;

    return (
      typeof imageUrl === "object" &&
      imageUrl !== null &&
      typeof (imageUrl as Record<string, unknown>).url === "string"
    );
  }

  return false;
}

function isChatMessage(value: unknown): value is ChatCompletionMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const message = value as Record<string, unknown>;

  if (
    message.role !== "system" &&
    message.role !== "user" &&
    message.role !== "assistant" &&
    message.role !== "tool"
  ) {
    return false;
  }

  if (typeof message.content === "string") {
    return true;
  }

  return Array.isArray(message.content) && message.content.every(isContentPart);
}

function isChatFileReference(
  value: unknown,
): value is ChatCompletionFileReference {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const file = value as Record<string, unknown>;

  return (
    (file.type === "local" || file.type === "remote") &&
    (file.transfer_method === "local_file" ||
      file.transfer_method === "remote_url") &&
    (file.file_id === undefined || typeof file.file_id === "string") &&
    (file.url === undefined || typeof file.url === "string")
  );
}

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

function extractLatestUserPrompt(messages: ChatCompletionMessage[]) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  return latestUserMessage ? extractMessageText(latestUserMessage) : "";
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

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function chunkText(text: string, size = 32) {
  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }

  return chunks.length > 0 ? chunks : [""];
}

function sleep(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function buildPersistedHistory(
  messages: ChatCompletionMessage[],
  input: {
    latestUserAttachments?: WorkspaceConversationAttachment[];
    assistantMessage?: {
      artifacts?: WorkspaceArtifact[];
      content: string;
      status: WorkspaceConversationMessageStatus;
      suggestedPrompts?: string[];
    };
  } = {},
): WorkspaceConversationMessage[] {
  const baseTime = Date.now();
  const latestUserMessageIndex = [...messages]
    .map((message) => message.role)
    .lastIndexOf("user");
  const transcript: WorkspaceConversationMessage[] = messages.flatMap(
    (message, index) => {
      if (message.role !== "user" && message.role !== "assistant") {
        return [];
      }

      return [
        {
          id: buildConversationMessageId(),
          role: message.role,
          content: extractMessageText(message),
          status: "completed",
          createdAt: new Date(baseTime + index).toISOString(),
          attachments:
            message.role === "user" && index === latestUserMessageIndex
              ? input.latestUserAttachments
              : undefined,
        } satisfies WorkspaceConversationMessage,
      ];
    },
  );

  if (
    input.assistantMessage &&
    input.assistantMessage.content.trim().length > 0
  ) {
    transcript.push({
      id: buildConversationMessageId(),
      role: "assistant",
      content: input.assistantMessage.content,
      status: input.assistantMessage.status,
      createdAt: new Date(baseTime + transcript.length).toISOString(),
      artifacts:
        input.assistantMessage.artifacts &&
        input.assistantMessage.artifacts.length > 0
          ? input.assistantMessage.artifacts.map(toArtifactSummary)
          : undefined,
      suggestedPrompts:
        input.assistantMessage.suggestedPrompts &&
        input.assistantMessage.suggestedPrompts.length > 0
          ? input.assistantMessage.suggestedPrompts
          : undefined,
    });
  }

  return transcript;
}

function buildAssistantText(
  conversation: WorkspaceConversation,
  messages: ChatCompletionMessage[],
  attachments: WorkspaceConversationAttachment[] = [],
) {
  const latestPrompt = extractLatestUserPrompt(messages);
  const requestSummary = latestPrompt || "Continue the current workspace task.";
  const attachmentSummary =
    attachments.length > 0
      ? `Attachments: ${attachments.map((file) => `${file.fileName} (${file.contentType}, ${file.sizeBytes} bytes)`).join(", ")}.`
      : null;

  return [
    `${conversation.app.name} is now reachable through the AgentifUI gateway.`,
    `Request: ${requestSummary}`,
    attachmentSummary,
    `Context: attributed group ${conversation.activeGroup.name}, trace ${conversation.run.traceId}.`,
    "This is the Phase 1 protocol response path that R7 wires onto the persisted conversation/run boundary.",
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join("\n\n");
}

function resolveModelName(
  body: ChatCompletionRequest,
  conversation: WorkspaceConversation,
) {
  return body.model?.trim() || conversation.app.slug;
}

function mapAppKindToMode(
  appKind: WorkspaceConversation["app"]["kind"],
): ChatModel["mode"] {
  if (appKind === "chat") {
    return "chat";
  }

  if (appKind === "automation") {
    return "workflow";
  }

  if (appKind === "analysis") {
    return "completion";
  }

  return "agent";
}

async function resolveConversation(
  workspaceService: WorkspaceService,
  user: AuthUser,
  body: ChatCompletionRequest,
  activeGroupId: string | undefined,
  traceId: string,
) {
  if (body.conversation_id?.trim()) {
    const conversationResult = await workspaceService.getConversationForUser(
      user,
      body.conversation_id.trim(),
    );

    if (!conversationResult.ok) {
      return {
        ok: false as const,
        statusCode: 404,
        response: buildErrorResponse(traceId, {
          type: "not_found_error",
          code: "conversation_not_found",
          message: "The target workspace conversation could not be found.",
          param: "conversation_id",
        }),
      };
    }

    if (conversationResult.data.app.id !== body.app_id) {
      return {
        ok: false as const,
        statusCode: 400,
        response: buildErrorResponse(traceId, {
          type: "invalid_request_error",
          code: "invalid_app_id",
          message:
            "The provided app_id does not match the existing conversation.",
          param: "app_id",
        }),
      };
    }

    return {
      ok: true as const,
      conversation: conversationResult.data,
    };
  }

  const catalog = await workspaceService.getCatalogForUser(user);
  const nextActiveGroupId =
    activeGroupId?.trim() || catalog.defaultActiveGroupId;
  const launchResult = await workspaceService.launchAppForUser(user, {
    appId: body.app_id,
    activeGroupId: nextActiveGroupId,
  });

  if (!launchResult.ok) {
    if (launchResult.code === "WORKSPACE_NOT_FOUND") {
      return {
        ok: false as const,
        statusCode: 404,
        response: buildErrorResponse(traceId, {
          type: "not_found_error",
          code: "app_not_found",
          message: launchResult.message,
          param: "app_id",
        }),
      };
    }

    const launchReason =
      typeof launchResult.details === "object" && launchResult.details !== null
        ? (launchResult.details as Record<string, unknown>).reason
        : null;

    if (launchReason === "quota_exceeded") {
      return {
        ok: false as const,
        statusCode: 429,
        response: buildErrorResponse(traceId, {
          type: "rate_limit_error",
          code: "quota_exceeded",
          message:
            "The workspace launch is blocked because the current quota is exhausted.",
        }),
      };
    }

    if (launchReason === "quota_service_degraded") {
      return {
        ok: false as const,
        statusCode: 503,
        response: buildErrorResponse(traceId, {
          type: "service_unavailable",
          code: "provider_unavailable",
          message:
            "The workspace quota service is degraded, so new conversations are temporarily blocked.",
        }),
      };
    }

    return {
      ok: false as const,
      statusCode: 403,
      response: buildErrorResponse(traceId, {
        type: "permission_denied",
        code: "app_not_authorized",
        message: launchResult.message,
      }),
    };
  }

  if (!launchResult.data.conversationId) {
    return {
      ok: false as const,
      statusCode: 500,
      response: buildErrorResponse(traceId, {
        type: "internal_error",
        code: "provider_error",
        message:
          "Workspace launch completed without a conversation identifier.",
      }),
    };
  }

  const conversationResult = await workspaceService.getConversationForUser(
    user,
    launchResult.data.conversationId,
  );

  if (!conversationResult.ok) {
    return {
      ok: false as const,
      statusCode: 500,
      response: buildErrorResponse(traceId, {
        type: "internal_error",
        code: "provider_error",
        message:
          "Workspace launch succeeded, but the conversation bootstrap could not be reloaded.",
      }),
    };
  }

  return {
    ok: true as const,
    conversation: conversationResult.data,
  };
}

async function ensureConversationRun(
  workspaceService: WorkspaceService,
  user: AuthUser,
  conversation: WorkspaceConversation,
  traceId: string,
) {
  if (
    conversation.messages.length === 0 &&
    conversation.run.status === "pending" &&
    conversation.run.totalSteps === 0
  ) {
    return {
      ok: true as const,
      conversation,
    };
  }

  const nextRun = await workspaceService.createConversationRunForUser(user, {
    conversationId: conversation.id,
    triggeredFrom: "chat_completion",
  });

  if (!nextRun.ok) {
    return {
      ok: false as const,
      statusCode: 404,
      response: buildErrorResponse(traceId, {
        type: "not_found_error",
        code: "conversation_not_found",
        message: "The target workspace conversation could not be found.",
        param: "conversation_id",
      }),
    };
  }

  return {
    ok: true as const,
    conversation: nextRun.data,
  };
}

async function resolveConversationAttachments(
  workspaceService: WorkspaceService,
  user: AuthUser,
  conversationId: string,
  files: ChatCompletionFileReference[],
  traceId: string,
) {
  const localFileIds = files.flatMap((file) => {
    if (
      file.type !== "local" ||
      file.transfer_method !== "local_file" ||
      !file.file_id?.trim()
    ) {
      return [];
    }

    return [file.file_id.trim()];
  });

  if (localFileIds.length !== files.length) {
    return {
      ok: false as const,
      statusCode: 400,
      response: buildErrorResponse(traceId, {
        type: "invalid_request_error",
        code: "invalid_file_id",
        message: "Only local uploaded workspace file references are supported.",
        param: "files",
      }),
    };
  }

  const attachmentsResult =
    await workspaceService.listConversationAttachmentsForUser(user, {
      conversationId,
      fileIds: localFileIds,
    });

  if (!attachmentsResult.ok) {
    return {
      ok: false as const,
      statusCode: 404,
      response: buildErrorResponse(traceId, {
        type: "not_found_error",
        code: "conversation_not_found",
        message: "The target workspace conversation could not be found.",
        param: "conversation_id",
      }),
    };
  }

  if (attachmentsResult.data.length !== localFileIds.length) {
    return {
      ok: false as const,
      statusCode: 400,
      response: buildErrorResponse(traceId, {
        type: "invalid_request_error",
        code: "invalid_file_id",
        message:
          "One or more workspace file references could not be resolved for this conversation.",
        param: "files",
      }),
    };
  }

  return {
    ok: true as const,
    attachments: attachmentsResult.data,
  };
}

function buildMetadataEvent(input: {
  conversation: WorkspaceConversation;
}): string {
  return `event: agentif.metadata\ndata: ${JSON.stringify({
    conversation_id: input.conversation.id,
    run_id: input.conversation.run.id,
    trace_id: input.conversation.run.traceId,
  })}\n\n`;
}

function buildChunkEvent(chunk: ChatCompletionChunk) {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function buildStreamingChunk(input: {
  artifacts?: WorkspaceArtifact[];
  pendingActions?: WorkspaceHitlStep[];
  id: string;
  created: number;
  model: string;
  conversationId: string;
  traceId: string;
  content?: string;
  finishReason?: ChatCompletionChunk["choices"][0]["finish_reason"];
  includeRole?: boolean;
  usage?: ChatCompletionChunk["usage"];
  suggestedPrompts?: string[];
}): ChatCompletionChunk {
  return {
    id: input.id,
    object: "chat.completion.chunk",
    created: input.created,
    model: input.model,
    conversation_id: input.conversationId,
    trace_id: input.traceId,
    choices: [
      {
        index: 0,
        delta: {
          ...(input.includeRole ? { role: "assistant" as const } : {}),
          ...(input.content ? { content: input.content } : {}),
        },
        finish_reason: input.finishReason ?? null,
      },
    ],
    ...(input.usage ? { usage: input.usage } : {}),
    ...(input.artifacts && input.artifacts.length > 0
      ? { artifacts: input.artifacts }
      : {}),
    ...(input.pendingActions && input.pendingActions.length > 0
      ? { pending_actions: input.pendingActions }
      : {}),
    ...(input.suggestedPrompts && input.suggestedPrompts.length > 0
      ? { suggested_prompts: input.suggestedPrompts }
      : {}),
  };
}

function buildBlockingResponse(input: {
  conversation: WorkspaceConversation;
  created: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  assistantText: string;
  artifacts: WorkspaceArtifact[];
  pendingActions: WorkspaceHitlStep[];
  suggestedPrompts: string[];
}): ChatCompletionResponse {
  return {
    id: input.conversation.run.id,
    object: "chat.completion",
    created: input.created,
    model: input.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: input.assistantText,
          artifacts: input.artifacts,
          ...(input.pendingActions.length > 0
            ? { pending_actions: input.pendingActions }
            : {}),
          suggested_prompts: input.suggestedPrompts,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: input.promptTokens,
      completion_tokens: input.completionTokens,
      total_tokens: input.promptTokens + input.completionTokens,
    },
    conversation_id: input.conversation.id,
    trace_id: input.conversation.run.traceId,
    metadata: {
      app_id: input.conversation.app.id,
      run_id: input.conversation.run.id,
      active_group_id: input.conversation.activeGroup.id,
    },
  };
}

async function* streamCompletionEvents(input: {
  attachments: WorkspaceConversationAttachment[];
  auditService: AuditService;
  conversation: WorkspaceConversation;
  created: number;
  ipAddress: string;
  model: string;
  promptTokens: number;
  assistantText: string;
  pendingActions: WorkspaceHitlStep[];
  suggestedPrompts: string[];
  messages: ChatCompletionMessage[];
  startedAt: number;
  user: AuthUser;
  workspaceService: WorkspaceService;
}) {
  const streamState = activeStreams.get(input.conversation.run.id);
  let assistantContent = "";
  let finalized = false;

  try {
    yield buildMetadataEvent({
      conversation: input.conversation,
    });
    yield buildChunkEvent(
      buildStreamingChunk({
        id: input.conversation.run.id,
        created: input.created,
        model: input.model,
        conversationId: input.conversation.id,
        traceId: input.conversation.run.traceId,
        includeRole: true,
      }),
    );

    for (const contentChunk of chunkText(input.assistantText)) {
      if (streamState?.stopRequested) {
        break;
      }

      assistantContent += contentChunk;
      yield buildChunkEvent(
        buildStreamingChunk({
          id: input.conversation.run.id,
          created: input.created,
          model: input.model,
          conversationId: input.conversation.id,
          traceId: input.conversation.run.traceId,
          content: contentChunk,
        }),
      );

      await sleep(STREAM_CHUNK_DELAY_MS);
    }

    const wasStopped = Boolean(streamState?.stopRequested);
    const completionTokens = estimateTokens(assistantContent);
    const artifacts = buildAssistantArtifacts({
      appName: input.conversation.app.name,
      assistantText: assistantContent,
      createdAt: new Date().toISOString(),
      latestPrompt: extractLatestUserPrompt(input.messages),
    });
    const pendingActions =
      !wasStopped && assistantContent.trim().length > 0 ? input.pendingActions : [];
    const updateResult =
      await input.workspaceService.updateConversationRunForUser(input.user, {
        conversationId: input.conversation.id,
        runId: input.conversation.run.id,
        status: wasStopped ? "stopped" : "succeeded",
        messageHistory: buildPersistedHistory(input.messages, {
          latestUserAttachments: input.attachments,
          assistantMessage: {
            artifacts,
            content: assistantContent,
            status: wasStopped ? "stopped" : "completed",
            suggestedPrompts: wasStopped ? undefined : input.suggestedPrompts,
          },
        }),
        outputs: {
          assistant: {
            content: assistantContent,
            finishReason: "stop",
            status: wasStopped ? "stopped" : "completed",
            suggestedPrompts: wasStopped ? undefined : input.suggestedPrompts,
          },
          artifacts,
          pendingActions,
          usage: {
            promptTokens: input.promptTokens,
            completionTokens,
            totalTokens: input.promptTokens + completionTokens,
          },
        },
        elapsedTime: Date.now() - input.startedAt,
        totalTokens: input.promptTokens + completionTokens,
        totalSteps: 1,
        finishedAt: new Date().toISOString(),
      });

    finalized = true;

    const finalChunk = buildStreamingChunk({
      id: input.conversation.run.id,
      created: input.created,
      model: input.model,
      conversationId: input.conversation.id,
      traceId: input.conversation.run.traceId,
      finishReason: "stop",
      artifacts,
      pendingActions,
      suggestedPrompts: wasStopped ? undefined : input.suggestedPrompts,
      usage: {
        prompt_tokens: input.promptTokens,
        completion_tokens: completionTokens,
        total_tokens: input.promptTokens + completionTokens,
      },
    });

    yield buildChunkEvent(finalChunk);
    yield "data: [DONE]\n\n";

    if (!updateResult.ok) {
      return;
    }

    await recordArtifactGeneratedAudit({
      artifacts,
      auditService: input.auditService,
      conversation: updateResult.data,
      ipAddress: input.ipAddress,
      runId: input.conversation.run.id,
      traceId: input.conversation.run.traceId,
      user: input.user,
    });

    await recordQuotaUsageAudit({
      auditService: input.auditService,
      completionTokens,
      conversation: updateResult.data,
      ipAddress: input.ipAddress,
      promptTokens: input.promptTokens,
      runId: input.conversation.run.id,
      runStatus: wasStopped ? "stopped" : "succeeded",
      totalTokens: input.promptTokens + completionTokens,
      traceId: input.conversation.run.traceId,
      user: input.user,
    });
  } finally {
    activeStreams.delete(input.conversation.run.id);

    if (!finalized) {
      const completionTokens = estimateTokens(assistantContent);
      const finishedAt = new Date().toISOString();
      const artifacts = buildAssistantArtifacts({
        appName: input.conversation.app.name,
        assistantText: assistantContent,
        createdAt: new Date().toISOString(),
        latestPrompt: extractLatestUserPrompt(input.messages),
      });
      const fallbackResult =
        await input.workspaceService.updateConversationRunForUser(input.user, {
          conversationId: input.conversation.id,
          runId: input.conversation.run.id,
          status: streamState?.stopRequested ? "stopped" : "failed",
          messageHistory: buildPersistedHistory(input.messages, {
            latestUserAttachments: input.attachments,
            assistantMessage: {
              artifacts,
              content: assistantContent,
              status: streamState?.stopRequested ? "stopped" : "failed",
              suggestedPrompts: undefined,
            },
          }),
          outputs: {
            assistant: {
              content: assistantContent,
              finishReason: "stop",
              status: streamState?.stopRequested ? "stopped" : "failed",
              suggestedPrompts: undefined,
            },
            artifacts,
            pendingActions: [],
            usage: {
              promptTokens: input.promptTokens,
              completionTokens,
              totalTokens: input.promptTokens + completionTokens,
            },
            ...(streamState?.stopRequested
              ? {}
              : {
                  failure: buildWorkspaceRunFailure({
                    code: "stream_interrupted",
                    stage: "streaming",
                    message: "The streaming response ended unexpectedly.",
                    retryable: true,
                    detail:
                      "The stream closed before the final completion event was persisted.",
                    recordedAt: finishedAt,
                  }),
                }),
          },
          error: streamState?.stopRequested
            ? undefined
            : "The streaming response ended unexpectedly.",
          elapsedTime: Date.now() - input.startedAt,
          totalTokens: input.promptTokens + estimateTokens(assistantContent),
          totalSteps: 1,
          finishedAt,
        });

      if (fallbackResult.ok) {
        await recordArtifactGeneratedAudit({
          artifacts,
          auditService: input.auditService,
          conversation: fallbackResult.data,
          ipAddress: input.ipAddress,
          runId: input.conversation.run.id,
          traceId: input.conversation.run.traceId,
          user: input.user,
        });

        await recordQuotaUsageAudit({
          auditService: input.auditService,
          completionTokens,
          conversation: fallbackResult.data,
          ipAddress: input.ipAddress,
          promptTokens: input.promptTokens,
          runId: input.conversation.run.id,
          runStatus: streamState?.stopRequested ? "stopped" : "failed",
          totalTokens: input.promptTokens + completionTokens,
          traceId: input.conversation.run.traceId,
          user: input.user,
        });
      }
    }
  }
}

export async function registerChatRoutes(
  app: FastifyInstance,
  authService: AuthService,
  workspaceService: WorkspaceService,
  auditService: AuditService,
) {
  app.get("/v1/models", async (request, reply) => {
    const traceId =
      request.headers["x-trace-id"]?.toString().trim() || buildTraceId();
    const access = await requireActiveSession(
      authService,
      request.headers.authorization,
      traceId,
    );

    reply.header("X-Trace-ID", traceId);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const catalog = await workspaceService.getCatalogForUser(access.user);
    const created = Math.floor(Date.now() / 1000);
    const response: ChatModelsResponse = {
      object: "list",
      data: catalog.apps.map((chatApp) => ({
        id: chatApp.id,
        object: "model",
        created,
        owned_by: access.user.tenantId,
        name: chatApp.name,
        description: chatApp.summary,
        mode: mapAppKindToMode(chatApp.kind),
        capabilities: {
          streaming: true,
          stop: true,
          tools: true,
          files: true,
          citations:
            chatApp.kind === "analysis" || chatApp.kind === "governance",
        },
      })),
    };

    return response;
  });

  app.post("/v1/chat/completions", async (request, reply) => {
    const fallbackTraceId =
      request.headers["x-trace-id"]?.toString().trim() || buildTraceId();
    const access = await requireActiveSession(
      authService,
      request.headers.authorization,
      fallbackTraceId,
    );

    reply.header("X-Trace-ID", fallbackTraceId);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const body = (request.body ?? {}) as Partial<ChatCompletionRequest>;
    const appId = body.app_id?.trim();

    if (!appId) {
      reply.code(400);
      return buildErrorResponse(fallbackTraceId, {
        type: "invalid_request_error",
        code: "invalid_app_id",
        message: "Chat completions require a non-empty app_id.",
        param: "app_id",
      });
    }

    if (
      !Array.isArray(body.messages) ||
      body.messages.length === 0 ||
      !body.messages.every(isChatMessage)
    ) {
      reply.code(400);
      return buildErrorResponse(fallbackTraceId, {
        type: "invalid_request_error",
        code: "invalid_messages",
        message:
          "Chat completions require a non-empty OpenAI-compatible messages array.",
        param: "messages",
      });
    }

    if (
      body.conversation_id !== undefined &&
      typeof body.conversation_id !== "string"
    ) {
      reply.code(400);
      return buildErrorResponse(fallbackTraceId, {
        type: "invalid_request_error",
        code: "invalid_conversation_id",
        message: "conversation_id must be a string when provided.",
        param: "conversation_id",
      });
    }

    if (
      body.files !== undefined &&
      (!Array.isArray(body.files) || !body.files.every(isChatFileReference))
    ) {
      reply.code(400);
      return buildErrorResponse(fallbackTraceId, {
        type: "invalid_request_error",
        code: "invalid_file_id",
        message:
          "files must be an array of valid local or remote file references when provided.",
        param: "files",
      });
    }

    if ((body.files?.length ?? 0) > 0 && !body.conversation_id?.trim()) {
      reply.code(400);
      return buildErrorResponse(fallbackTraceId, {
        type: "invalid_request_error",
        code: "invalid_conversation_id",
        message: "Local workspace files require an existing conversation_id.",
        param: "conversation_id",
      });
    }

    const conversationResult = await resolveConversation(
      workspaceService,
      access.user,
      {
        app_id: appId,
        messages: body.messages,
        model: body.model,
        stream: body.stream,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        top_p: body.top_p,
        tools: body.tools,
        tool_choice: body.tool_choice,
        conversation_id: body.conversation_id,
        inputs: body.inputs,
        files: body.files,
      },
      request.headers["x-active-group-id"]?.toString(),
      fallbackTraceId,
    );

    if (!conversationResult.ok) {
      reply.code(conversationResult.statusCode);
      return conversationResult.response;
    }

    const runPreparationResult = await ensureConversationRun(
      workspaceService,
      access.user,
      conversationResult.conversation,
      fallbackTraceId,
    );

    if (!runPreparationResult.ok) {
      reply.code(runPreparationResult.statusCode);
      return runPreparationResult.response;
    }

    const conversation = runPreparationResult.conversation;
    const attachmentResult =
      body.files && body.files.length > 0
        ? await resolveConversationAttachments(
            workspaceService,
            access.user,
            conversation.id,
            body.files,
            fallbackTraceId,
          )
        : {
            ok: true as const,
            attachments: [],
          };

    if (!attachmentResult.ok) {
      reply.code(attachmentResult.statusCode);
      return attachmentResult.response;
    }

    const traceId = conversation.run.traceId || fallbackTraceId;
    const startedAt = Date.now();
    const assistantText = buildAssistantText(
      conversation,
      body.messages,
      attachmentResult.attachments,
    );
    const suggestedPrompts = buildSuggestedPrompts(
      extractLatestUserPrompt(body.messages),
    );
    const model = resolveModelName(
      {
        app_id: appId,
        messages: body.messages,
        model: body.model,
        stream: body.stream,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        top_p: body.top_p,
        tools: body.tools,
        tool_choice: body.tool_choice,
        conversation_id: body.conversation_id,
        inputs: body.inputs,
        files: body.files,
      },
      conversation,
    );
    const pendingActions = buildPlaceholderHitlSteps({
      appId,
      conversationId: conversation.id,
      createdAt: new Date().toISOString(),
      latestPrompt: extractLatestUserPrompt(body.messages),
      runId: conversation.run.id,
    });
    const promptTokens = body.messages.reduce(
      (total, message) => total + estimateTokens(extractMessageText(message)),
      0,
    );
    const completionTokens = estimateTokens(assistantText);
    const created = Math.floor(Date.now() / 1000);

    reply.header("X-Trace-ID", traceId);

    const runningResult = await workspaceService.updateConversationRunForUser(
      access.user,
      {
        conversationId: conversation.id,
        runId: conversation.run.id,
        status: "running",
        inputs: {
          messages: body.messages,
          model,
          stream: Boolean(body.stream),
          variables: body.inputs ?? {},
          files: body.files ?? [],
          attachments: attachmentResult.attachments,
        },
        totalSteps: 1,
      },
    );

    if (!runningResult.ok) {
      reply.code(500);
      return buildErrorResponse(traceId, {
        type: "internal_error",
        code: "provider_error",
        message: "The conversation run could not be marked as running.",
      });
    }

    if (body.stream) {
      activeStreams.set(runningResult.data.run.id, {
        stopRequested: false,
      });

      reply.header("content-type", "text/event-stream; charset=utf-8");
      reply.header("cache-control", "no-cache");
      reply.header("connection", "keep-alive");

      return reply.send(
        Readable.from(
          streamCompletionEvents({
            attachments: attachmentResult.attachments,
            auditService,
            conversation: runningResult.data,
            created,
            ipAddress: request.ip,
            model,
            promptTokens,
            assistantText,
            pendingActions,
            suggestedPrompts,
            messages: body.messages,
            startedAt,
            user: access.user,
            workspaceService,
          }),
        ),
      );
    }

    const artifacts = buildAssistantArtifacts({
      appName: conversation.app.name,
      assistantText,
      createdAt: new Date().toISOString(),
      latestPrompt: extractLatestUserPrompt(body.messages),
    });
    const updateResult = await workspaceService.updateConversationRunForUser(
      access.user,
      {
        conversationId: conversation.id,
        runId: conversation.run.id,
        status: "succeeded",
        messageHistory: buildPersistedHistory(body.messages, {
          latestUserAttachments: attachmentResult.attachments,
          assistantMessage: {
            artifacts,
            content: assistantText,
            status: "completed",
            suggestedPrompts,
          },
        }),
        outputs: {
          assistant: {
            content: assistantText,
            finishReason: "stop",
            status: "completed",
            suggestedPrompts,
          },
          artifacts,
          pendingActions,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
        },
        elapsedTime: Date.now() - startedAt,
        totalTokens: promptTokens + completionTokens,
        totalSteps: 1,
        finishedAt: new Date().toISOString(),
      },
    );

    if (!updateResult.ok) {
      reply.code(500);
      return buildErrorResponse(traceId, {
        type: "internal_error",
        code: "provider_error",
        message:
          "The conversation run could not be persisted after completion.",
      });
    }

    await recordArtifactGeneratedAudit({
      artifacts,
      auditService,
      conversation: updateResult.data,
      ipAddress: request.ip,
      runId: conversation.run.id,
      traceId,
      user: access.user,
    });

    await recordQuotaUsageAudit({
      auditService,
      completionTokens,
      conversation: updateResult.data,
      ipAddress: request.ip,
      promptTokens,
      runId: conversation.run.id,
      runStatus: "succeeded",
      totalTokens: promptTokens + completionTokens,
      traceId,
      user: access.user,
    });

    return buildBlockingResponse({
      conversation: updateResult.data,
      created,
      model,
      promptTokens,
      completionTokens,
      assistantText,
      artifacts,
      pendingActions,
      suggestedPrompts,
    });
  });

  app.post("/v1/chat/completions/:taskId/stop", async (request, reply) => {
    const traceId =
      request.headers["x-trace-id"]?.toString().trim() || buildTraceId();
    const access = await requireActiveSession(
      authService,
      request.headers.authorization,
      traceId,
    );

    reply.header("X-Trace-ID", traceId);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      taskId?: string;
    };

    if (!params.taskId?.trim()) {
      reply.code(400);
      return buildErrorResponse(traceId, {
        type: "invalid_request_error",
        code: "invalid_task_id",
        message: "taskId is required to stop a chat completion.",
        param: "taskId",
      });
    }

    const taskId = params.taskId.trim();
    const streamState = activeStreams.get(taskId);

    if (streamState) {
      streamState.stopRequested = true;
    }

    const response: ChatCompletionStopResponse = {
      result: "success",
      stop_type: streamState ? "hard" : "soft",
    };

    const runResult = await workspaceService.getRunForUser(access.user, taskId);

    if (runResult.ok) {
      await workspaceService.appendRunTimelineEventForUser(access.user, {
        conversationId: runResult.data.conversationId,
        runId: taskId,
        type: "stop_requested",
        metadata: {
          stopType: response.stop_type,
        },
      });
    }

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: "workspace.run.stop_requested",
      entityType: "run",
      entityId: taskId,
      ipAddress: request.ip,
      level: streamState ? "info" : "warning",
      payload: {
        runId: taskId,
        stopType: response.stop_type,
        traceId: runResult.ok ? runResult.data.traceId : traceId,
        conversationId: runResult.ok ? runResult.data.conversationId : null,
        appId: runResult.ok ? runResult.data.app.id : null,
        appName: runResult.ok ? runResult.data.app.name : null,
        activeGroupId: runResult.ok ? runResult.data.activeGroup.id : null,
        activeGroupName: runResult.ok ? runResult.data.activeGroup.name : null,
      },
    });

    return response;
  });
}
