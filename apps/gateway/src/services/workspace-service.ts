import type { ChatToolCall } from '@agentifui/shared';
import type { AuthUser } from '@agentifui/shared/auth';
import type {
  QuotaUsage,
  WorkspaceAppLaunch,
  WorkspaceArtifact,
  WorkspaceArtifactJsonValue,
  WorkspaceArtifactSummary,
  WorkspaceCitation,
  WorkspaceComment,
  WorkspaceCommentMention,
  WorkspaceCatalog,
  WorkspaceCommentCreateRequest,
  WorkspaceConversationAttachment,
  WorkspaceConversation,
  WorkspaceConversationListAttachmentFilter,
  WorkspaceConversationListFeedbackFilter,
  WorkspaceConversationListStatusFilter,
  WorkspaceConversationStatus,
  WorkspaceConversationMessageFeedback,
  WorkspaceConversationListItem,
  WorkspaceConversationPresence,
  WorkspaceConversationPresenceUpdateRequest,
  WorkspaceConversationShare,
  WorkspaceConversationShareAccess,
  WorkspaceConversationMessage,
  WorkspacePendingActionRespondRequest,
  WorkspaceHitlStep,
  WorkspaceMessageFeedbackRating,
  WorkspacePreferences,
  WorkspacePreferencesUpdateRequest,
  WorkspaceRun,
  WorkspaceRunFailure,
  WorkspaceNotification,
  WorkspaceRunRuntime,
  WorkspaceRunStatus,
  WorkspaceRunSummary,
  WorkspaceRunToolExecution,
  WorkspaceRunToolExecutionResult,
  WorkspaceSafetySignal,
  WorkspaceRunTimelineEvent,
  WorkspaceRunTimelineEventType,
  WorkspaceRunTrigger,
  WorkspaceRunType,
  WorkspaceSourceBlock,
} from '@agentifui/shared/apps';
import { evaluateAppLaunch } from '@agentifui/shared/apps';
import { randomUUID } from 'node:crypto';

import {
  WORKSPACE_GROUPS,
  buildWorkspaceCatalog,
  resolveDefaultMemberGroupIds,
  resolveSeededWorkspaceAppsForUser,
} from './workspace-catalog-fixtures.js';
import type { WorkspaceFileStorage } from './workspace-file-storage.js';
import {
  buildWorkspaceRunFailure,
  buildWorkspaceToolExecutionFailure,
  parseWorkspaceRunFailure,
} from './workspace-run-failure.js';
import { parseWorkspaceRunRuntime } from './workspace-run-runtime.js';
import {
  buildWorkspaceConversationPresence,
  pruneWorkspacePresenceEntries,
  upsertWorkspacePresenceEntry,
} from './workspace-presence.js';
import { buildWorkspaceToolApprovalResolution } from './workspace-tool-approval.js';
import {
  applyWorkspaceHitlStepResponse,
  expireWorkspaceHitlSteps,
  parseWorkspaceHitlSteps,
} from './workspace-hitl.js';
import {
  buildDefaultQuotaLimitRecords,
  buildQuotaUsagesByGroupId,
  calculateCompletionQuotaCost,
  type WorkspaceQuotaLimitRecord,
} from './workspace-quota.js';
import {
  buildWorkspaceCommentPreview,
  normalizeWorkspaceCommentContent,
} from './workspace-comments.js';

type WorkspaceLaunchFailure = {
  ok: false;
  statusCode: 404 | 409;
  code: 'WORKSPACE_NOT_FOUND' | 'WORKSPACE_LAUNCH_BLOCKED';
  message: string;
  details?: unknown;
};

type WorkspaceLookupFailure = {
  ok: false;
  statusCode: 403 | 404;
  code: 'WORKSPACE_FORBIDDEN' | 'WORKSPACE_NOT_FOUND';
  message: string;
  details?: unknown;
};

type WorkspaceLaunchResult =
  | {
      ok: true;
      data: WorkspaceAppLaunch;
    }
  | WorkspaceLaunchFailure;

type WorkspaceConversationResult =
  | {
      ok: true;
      data: WorkspaceConversation;
    }
  | WorkspaceLookupFailure
  | {
      ok: false;
      statusCode: 409;
      code: 'WORKSPACE_ACTION_CONFLICT';
      message: string;
      details?: unknown;
    };

type WorkspaceConversationRunsResult =
  | {
      ok: true;
      data: {
        conversationId: string;
        runs: WorkspaceRunSummary[];
      };
    }
  | WorkspaceLookupFailure;

type WorkspaceRunResult =
  | {
      ok: true;
      data: WorkspaceRun;
    }
  | WorkspaceLookupFailure;

type WorkspaceConversationListInput = {
  appId?: string | null;
  attachment?: WorkspaceConversationListAttachmentFilter | null;
  feedback?: WorkspaceConversationListFeedbackFilter | null;
  groupId?: string | null;
  limit?: number;
  query?: string | null;
  status?: WorkspaceConversationListStatusFilter | null;
  tag?: string | null;
};

type WorkspaceConversationUpdateInput = {
  conversationId: string;
  expectedUpdatedAt?: string;
  pinned?: boolean;
  status?: WorkspaceConversationStatus;
  title?: string;
};

type WorkspaceConversationListResult =
  | {
      ok: true;
      data: {
        items: WorkspaceConversationListItem[];
        filters: {
          appId: string | null;
          attachment: WorkspaceConversationListAttachmentFilter | null;
          feedback: WorkspaceConversationListFeedbackFilter | null;
          groupId: string | null;
          query: string | null;
          status: WorkspaceConversationListStatusFilter | null;
          tag: string | null;
          limit: number;
        };
      };
    }
  | WorkspaceLookupFailure;

type WorkspaceRunCreateInput = {
  conversationId: string;
  triggeredFrom: WorkspaceRunTrigger;
};

type WorkspaceConversationUploadInput = {
  conversationId: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
};

type WorkspaceConversationMessageFeedbackUpdateInput = {
  conversationId: string;
  messageId: string;
  rating: WorkspaceMessageFeedbackRating | null;
};

type WorkspaceConversationAttachmentLookupInput = {
  conversationId: string;
  fileIds: string[];
};

type WorkspaceCommentCreateInput = {
  conversationId: string;
  request: WorkspaceCommentCreateRequest;
  mentions?: WorkspaceCommentMention[];
};

type WorkspaceConversationShareCreateInput = {
  conversationId: string;
  groupId: string;
  access: WorkspaceConversationShareAccess;
};

type WorkspaceConversationShareRevokeInput = {
  conversationId: string;
  shareId: string;
};

type WorkspaceSharedCommentCreateInput = {
  shareId: string;
  request: WorkspaceCommentCreateRequest;
  mentions?: WorkspaceCommentMention[];
};

type WorkspaceSharedConversationUpdateInput = {
  expectedUpdatedAt?: string;
  shareId: string;
  pinned?: boolean;
  status?: WorkspaceConversationStatus;
  title?: string;
};

type WorkspacePendingActionsResult =
  | {
      ok: true;
      data: {
        conversationId: string;
        runId: string;
        items: WorkspaceHitlStep[];
        expiredItems?: WorkspaceHitlStep[];
      };
    }
  | WorkspaceLookupFailure;

type WorkspacePendingActionRespondInput = {
  conversationId: string;
  stepId: string;
  request: WorkspacePendingActionRespondRequest;
};

type WorkspacePendingActionRespondResult =
  | {
      ok: true;
      data: {
        conversationId: string;
        runId: string;
        item: WorkspaceHitlStep;
        items: WorkspaceHitlStep[];
      };
    }
  | WorkspaceLookupFailure
  | {
      ok: false;
      statusCode: 400 | 409;
      code: 'WORKSPACE_INVALID_PAYLOAD' | 'WORKSPACE_ACTION_CONFLICT';
      message: string;
      details?: unknown;
    };

type WorkspaceSharedArtifactLookupInput = {
  artifactId: string;
  shareId: string;
};

type WorkspaceRunTimelineEventAppendInput = {
  conversationId: string;
  runId: string;
  type: WorkspaceRunTimelineEventType;
  metadata?: Record<string, unknown>;
};

type WorkspaceRunUpdateInput = {
  conversationId: string;
  runId: string;
  status: WorkspaceRunStatus;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  messageHistory?: WorkspaceConversationMessage[];
  error?: string;
  elapsedTime?: number;
  totalTokens?: number;
  totalSteps?: number;
  finishedAt?: string | null;
};

type WorkspaceConversationUploadResult =
  | {
      ok: true;
      data: WorkspaceConversationAttachment;
    }
  | WorkspaceLookupFailure;

type WorkspaceConversationMessageFeedbackResult =
  | {
      ok: true;
      data: {
        conversationId: string;
        message: WorkspaceConversationMessage;
      };
    }
  | WorkspaceLookupFailure;

type WorkspaceConversationAttachmentLookupResult =
  | {
      ok: true;
      data: WorkspaceConversationAttachment[];
    }
  | WorkspaceLookupFailure;

type WorkspaceCommentCreateResult =
  | {
      ok: true;
      data: {
        conversationId: string;
        targetType: WorkspaceComment["targetType"];
        targetId: string;
        comment: WorkspaceComment;
        thread: WorkspaceComment[];
    };
  }
  | WorkspaceLookupFailure
  | {
      ok: false;
      statusCode: 400 | 403;
      code: "WORKSPACE_FORBIDDEN" | "WORKSPACE_INVALID_PAYLOAD";
      message: string;
      details?: unknown;
    };

type WorkspaceNotificationsResult = {
  ok: true;
  data: {
    items: WorkspaceNotification[];
    unreadCount: number;
  };
};

type WorkspaceNotificationReadResult =
  | {
      ok: true;
      data: WorkspaceNotification;
    }
  | WorkspaceLookupFailure;

type WorkspaceArtifactResult =
  | {
      ok: true;
      data: WorkspaceArtifact;
    }
  | WorkspaceLookupFailure
  | {
      ok: false;
      statusCode: 403;
      code: 'WORKSPACE_FORBIDDEN';
      message: string;
      details?: unknown;
    };

type WorkspaceConversationShareResult =
  | {
      ok: true;
      data: WorkspaceConversationShare;
    }
  | WorkspaceLookupFailure;

type WorkspaceConversationSharesResult =
  | {
      ok: true;
      data: {
        conversationId: string;
        shares: WorkspaceConversationShare[];
      };
    }
  | WorkspaceLookupFailure;

type WorkspaceSharedConversationResult =
  | {
      ok: true;
      data: {
        share: WorkspaceConversationShare;
        conversation: WorkspaceConversation;
      };
    }
  | WorkspaceLookupFailure
  | {
      ok: false;
      statusCode: 403;
      code: 'WORKSPACE_FORBIDDEN';
      message: string;
      details?: unknown;
    };

type WorkspaceConversationPresenceResult =
  | {
      ok: true;
      data: WorkspaceConversationPresence;
    }
  | WorkspaceLookupFailure
  | {
      ok: false;
      statusCode: 403;
      code: 'WORKSPACE_FORBIDDEN';
      message: string;
      details?: unknown;
    };

type WorkspaceService = {
  getCatalogForUser(user: AuthUser): WorkspaceCatalog | Promise<WorkspaceCatalog>;
  getPreferencesForUser(user: AuthUser): WorkspacePreferences | Promise<WorkspacePreferences>;
  updatePreferencesForUser(
    user: AuthUser,
    input: WorkspacePreferencesUpdateRequest
  ): WorkspacePreferences | Promise<WorkspacePreferences>;
  launchAppForUser(
    user: AuthUser,
    input: {
      appId: string;
      activeGroupId: string;
    }
  ): WorkspaceLaunchResult | Promise<WorkspaceLaunchResult>;
  getConversationForUser(
    user: AuthUser,
    conversationId: string
  ): WorkspaceConversationResult | Promise<WorkspaceConversationResult>;
  listConversationsForUser(
    user: AuthUser,
    input: WorkspaceConversationListInput
  ): WorkspaceConversationListResult | Promise<WorkspaceConversationListResult>;
  updateConversationForUser(
    user: AuthUser,
    input: WorkspaceConversationUpdateInput
  ): WorkspaceConversationResult | Promise<WorkspaceConversationResult>;
  listConversationRunsForUser(
    user: AuthUser,
    conversationId: string
  ): WorkspaceConversationRunsResult | Promise<WorkspaceConversationRunsResult>;
  getRunForUser(user: AuthUser, runId: string): WorkspaceRunResult | Promise<WorkspaceRunResult>;
  uploadConversationFileForUser(
    user: AuthUser,
    input: WorkspaceConversationUploadInput
  ): WorkspaceConversationUploadResult | Promise<WorkspaceConversationUploadResult>;
  updateMessageFeedbackForUser(
    user: AuthUser,
    input: WorkspaceConversationMessageFeedbackUpdateInput
  ): WorkspaceConversationMessageFeedbackResult | Promise<WorkspaceConversationMessageFeedbackResult>;
  listConversationAttachmentsForUser(
    user: AuthUser,
    input: WorkspaceConversationAttachmentLookupInput
  ):
    | WorkspaceConversationAttachmentLookupResult
    | Promise<WorkspaceConversationAttachmentLookupResult>;
  createCommentForUser(
    user: AuthUser,
    input: WorkspaceCommentCreateInput
  ): WorkspaceCommentCreateResult | Promise<WorkspaceCommentCreateResult>;
  createSharedCommentForUser(
    user: AuthUser,
    input: WorkspaceSharedCommentCreateInput
  ): WorkspaceCommentCreateResult | Promise<WorkspaceCommentCreateResult>;
  canUserAccessConversationForCollaboration(
    user: AuthUser,
    conversationId: string
  ): boolean | Promise<boolean>;
  listNotificationsForUser(
    user: AuthUser
  ): WorkspaceNotificationsResult | Promise<WorkspaceNotificationsResult>;
  markNotificationReadForUser(
    user: AuthUser,
    notificationId: string
  ): WorkspaceNotificationReadResult | Promise<WorkspaceNotificationReadResult>;
  getArtifactForUser(
    user: AuthUser,
    artifactId: string
  ): WorkspaceArtifactResult | Promise<WorkspaceArtifactResult>;
  listPendingActionsForUser(
    user: AuthUser,
    conversationId: string
  ): WorkspacePendingActionsResult | Promise<WorkspacePendingActionsResult>;
  respondToPendingActionForUser(
    user: AuthUser,
    input: WorkspacePendingActionRespondInput
  ): WorkspacePendingActionRespondResult | Promise<WorkspacePendingActionRespondResult>;
  getSharedArtifactForUser(
    user: AuthUser,
    input: WorkspaceSharedArtifactLookupInput
  ): WorkspaceArtifactResult | Promise<WorkspaceArtifactResult>;
  listConversationSharesForUser(
    user: AuthUser,
    conversationId: string
  ): WorkspaceConversationSharesResult | Promise<WorkspaceConversationSharesResult>;
  getConversationPresenceForUser(
    user: AuthUser,
    conversationId: string
  ): WorkspaceConversationPresenceResult | Promise<WorkspaceConversationPresenceResult>;
  updateConversationPresenceForUser(
    user: AuthUser,
    input: {
      conversationId: string;
      sessionId: string;
      activeRunId?: string | null;
      state?: WorkspaceConversationPresenceUpdateRequest['state'];
      surface?: WorkspaceConversationPresenceUpdateRequest['surface'];
    }
  ): WorkspaceConversationPresenceResult | Promise<WorkspaceConversationPresenceResult>;
  getSharedConversationPresenceForUser(
    user: AuthUser,
    shareId: string
  ): WorkspaceConversationPresenceResult | Promise<WorkspaceConversationPresenceResult>;
  updateSharedConversationPresenceForUser(
    user: AuthUser,
    input: {
      shareId: string;
      sessionId: string;
      activeRunId?: string | null;
      state?: WorkspaceConversationPresenceUpdateRequest['state'];
      surface?: WorkspaceConversationPresenceUpdateRequest['surface'];
    }
  ): WorkspaceConversationPresenceResult | Promise<WorkspaceConversationPresenceResult>;
  createConversationShareForUser(
    user: AuthUser,
    input: WorkspaceConversationShareCreateInput
  ): WorkspaceConversationShareResult | Promise<WorkspaceConversationShareResult>;
  updateSharedConversationForUser(
    user: AuthUser,
    input: WorkspaceSharedConversationUpdateInput
  ): WorkspaceConversationResult | Promise<WorkspaceConversationResult>;
  revokeConversationShareForUser(
    user: AuthUser,
    input: WorkspaceConversationShareRevokeInput
  ): WorkspaceConversationShareResult | Promise<WorkspaceConversationShareResult>;
  getSharedConversationForUser(
    user: AuthUser,
    shareId: string
  ): WorkspaceSharedConversationResult | Promise<WorkspaceSharedConversationResult>;
  appendRunTimelineEventForUser(
    user: AuthUser,
    input: WorkspaceRunTimelineEventAppendInput
  ): WorkspaceRunResult | Promise<WorkspaceRunResult>;
  createConversationRunForUser(
    user: AuthUser,
    input: WorkspaceRunCreateInput
  ): WorkspaceConversationResult | Promise<WorkspaceConversationResult>;
  updateConversationRunForUser(
    user: AuthUser,
    input: WorkspaceRunUpdateInput
  ): WorkspaceConversationResult | Promise<WorkspaceConversationResult>;
};

type WorkspaceConversationRecord = WorkspaceConversation & {
  launchCost: number;
  userId: string;
};

type WorkspaceRunRecord = WorkspaceRun & {
  userId: string;
};

type WorkspaceConversationAttachmentRecord = {
  attachment: WorkspaceConversationAttachment;
  conversationId: string;
  storageKey: string | null;
  userId: string;
};

type WorkspaceArtifactRecord = WorkspaceArtifact & {
  conversationId: string;
  runId: string;
  sequence: number;
  userId: string;
};

type WorkspaceCommentRecord = WorkspaceComment & {
  userId: string;
};

type WorkspaceNotificationRecord = WorkspaceNotification & {
  userId: string;
};

type WorkspaceConversationShareRecord = {
  access: WorkspaceConversationShareAccess;
  conversationId: string;
  createdAt: string;
  creatorUserId: string;
  group: WorkspaceConversationShare['group'];
  id: string;
  revokedAt: string | null;
  status: WorkspaceConversationShare['status'];
};

type WorkspaceRunTimelineEventRecord = WorkspaceRunTimelineEvent;

function buildEmptyPreferences(): WorkspacePreferences {
  return {
    favoriteAppIds: [],
    recentAppIds: [],
    defaultActiveGroupId: null,
    updatedAt: null,
  };
}

function dedupeIds(value: string[]) {
  return [...new Set(value)];
}

function recordRecentApp(currentIds: string[], appId: string, limit = 4) {
  return [appId, ...currentIds.filter(currentId => currentId !== appId)].slice(0, limit);
}

function buildLaunchUrl(conversationId: string) {
  return `/chat/${conversationId}`;
}

function buildShareUrl(shareId: string) {
  return `/chat/shared/${shareId}`;
}

function buildTraceId() {
  return randomUUID().replace(/-/g, '');
}

function nextWorkspaceUpdatedAt(currentUpdatedAt?: string | null) {
  const now = Date.now();
  const currentMs =
    typeof currentUpdatedAt === 'string' ? new Date(currentUpdatedAt).getTime() : Number.NaN;
  const nextMs =
    Number.isFinite(currentMs) && currentMs >= now ? currentMs + 1 : now;

  return new Date(nextMs).toISOString();
}

function applyConversationUpdates(
  conversation: WorkspaceConversationRecord,
  input: {
    pinned?: boolean;
    status?: WorkspaceConversationStatus;
    title?: string;
  },
) {
  if (input.title !== undefined) {
    conversation.title = input.title;
  }

  if (input.status !== undefined) {
    conversation.status = input.status;
  }

  if (input.pinned !== undefined) {
    conversation.pinned = input.pinned;
  }

  conversation.updatedAt = nextWorkspaceUpdatedAt(conversation.updatedAt);
}

function buildConversationUpdateConflict(
  conversation: Pick<WorkspaceConversation, "id" | "updatedAt" | "title" | "status" | "pinned">,
  expectedUpdatedAt?: string,
): WorkspaceConversationResult {
  return {
    ok: false,
    statusCode: 409,
    code: 'WORKSPACE_ACTION_CONFLICT',
    message:
      'The workspace conversation was updated by another collaborator. Refresh and retry your changes.',
    details: {
      conversationId: conversation.id,
      expectedUpdatedAt: expectedUpdatedAt ?? null,
      currentUpdatedAt: conversation.updatedAt,
      currentTitle: conversation.title,
      currentStatus: conversation.status,
      currentPinned: conversation.pinned,
    },
  };
}

function resolveRunType(kind: WorkspaceAppLaunch['app']['kind']): WorkspaceRunType {
  if (kind === 'automation') {
    return 'workflow';
  }

  if (kind === 'chat') {
    return 'generation';
  }

  return 'agent';
}

function buildRunSummary(run: WorkspaceRunRecord): WorkspaceRunSummary {
  return {
    id: run.id,
    type: run.type,
    status: run.status,
    triggeredFrom: run.triggeredFrom,
    traceId: run.traceId,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    elapsedTime: run.elapsedTime,
    totalTokens: run.totalTokens,
    totalSteps: run.totalSteps,
  };
}

function buildUsageFromOutputs(run: WorkspaceRunRecord): WorkspaceRun['usage'] {
  const candidate = run.outputs.usage;

  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as Record<string, unknown>).promptTokens === 'number' &&
    typeof (candidate as Record<string, unknown>).completionTokens === 'number' &&
    typeof (candidate as Record<string, unknown>).totalTokens === 'number'
  ) {
    const usage = candidate as {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };

    return {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
    };
  }

  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: run.totalTokens,
  };
}

function buildRuntimeFromOutputs(
  outputs: Record<string, unknown>
): WorkspaceRunRuntime | null {
  return parseWorkspaceRunRuntime(outputs.runtime);
}

function readPendingActionsFromOutputs(outputs: Record<string, unknown>): WorkspaceHitlStep[] {
  return parseWorkspaceHitlSteps(outputs.pendingActions);
}

function toWorkspaceToolCall(value: unknown): ChatToolCall | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const toolCall = value as Record<string, unknown>;
  const toolFunction =
    typeof toolCall.function === 'object' && toolCall.function !== null
      ? (toolCall.function as Record<string, unknown>)
      : null;

  if (
    typeof toolCall.id !== 'string' ||
    toolCall.type !== 'function' ||
    !toolFunction ||
    typeof toolFunction.name !== 'string' ||
    typeof toolFunction.arguments !== 'string'
  ) {
    return null;
  }

  return {
    id: toolCall.id,
    type: 'function',
    function: {
      name: toolFunction.name,
      arguments: toolFunction.arguments,
    },
  };
}

function toWorkspaceRunToolExecutionResult(
  value: unknown,
): WorkspaceRunToolExecutionResult | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const result = value as Record<string, unknown>;

  if (
    typeof result.content !== 'string' ||
    typeof result.isError !== 'boolean' ||
    typeof result.recordedAt !== 'string'
  ) {
    return null;
  }

  return {
    content: result.content,
    isError: result.isError,
    recordedAt: result.recordedAt,
  };
}

function buildToolExecutionsFromLegacyOutputs(
  outputs: Record<string, unknown>,
): WorkspaceRunToolExecution[] {
  const toolCalls = Array.isArray(outputs.toolCalls)
    ? outputs.toolCalls.flatMap((entry) => {
        const toolCall = toWorkspaceToolCall(entry);
        return toolCall ? [toolCall] : [];
      })
    : [];
  const toolResults = Array.isArray(outputs.toolResults)
    ? outputs.toolResults
    : [];

  if (toolCalls.length === 0) {
    return [];
  }

  return toolCalls.flatMap((toolCall) => {
    const matchingResults = toolResults.filter((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return false;
      }

      return (entry as Record<string, unknown>).toolCallId === toolCall.id;
    }) as Record<string, unknown>[];

    if (matchingResults.length === 0) {
      return [];
    }

    return matchingResults.map((matchingResult, resultIndex) => {
      const recordedAt =
        typeof matchingResult?.recordedAt === 'string'
          ? matchingResult.recordedAt
          : new Date().toISOString();
      const content =
        typeof matchingResult?.content === 'string' ? matchingResult.content : '';
      const metadata =
        typeof matchingResult?.metadata === 'object' &&
        matchingResult.metadata !== null &&
        !Array.isArray(matchingResult.metadata)
          ? Object.fromEntries(
              Object.entries(matchingResult.metadata as Record<string, unknown>).flatMap(
                ([key, value]) => (typeof value === 'string' ? [[key, value]] : []),
              ),
            )
          : {};

      const attempt =
        typeof matchingResult?.attempt === 'number' &&
        Number.isFinite(matchingResult.attempt) &&
        matchingResult.attempt > 0
          ? matchingResult.attempt
          : resultIndex + 1;
      const status =
        typeof matchingResult?.isError === 'boolean' && matchingResult.isError
          ? 'failed'
          : 'succeeded';
      const result =
        content.length > 0
          ? {
              content,
              isError: Boolean(matchingResult.isError),
              recordedAt,
            }
          : null;

      return {
        id:
          typeof matchingResult?.id === 'string'
            ? matchingResult.id
            : `tool_exec_${randomUUID()}`,
        attempt,
        status,
        startedAt:
          typeof matchingResult?.startedAt === 'string'
            ? matchingResult.startedAt
            : recordedAt,
        finishedAt:
          typeof matchingResult?.finishedAt === 'string'
            ? matchingResult.finishedAt
            : recordedAt,
        latencyMs:
          typeof matchingResult?.latencyMs === 'number'
            ? matchingResult.latencyMs
            : null,
        request: toolCall,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        failure: buildWorkspaceToolExecutionFailure({
          attempt,
          metadata,
          result,
          status,
          toolName: toolCall.function.name,
        }),
        result,
      } satisfies WorkspaceRunToolExecution;
    });
  });
}

function buildToolExecutionsFromOutputs(
  outputs: Record<string, unknown>,
): WorkspaceRunToolExecution[] {
  if (!Array.isArray(outputs.toolExecutions)) {
    return buildToolExecutionsFromLegacyOutputs(outputs);
  }

  const toolExecutions = outputs.toolExecutions.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const execution = entry as Record<string, unknown>;
    const request = toWorkspaceToolCall(execution.request);
    const result = toWorkspaceRunToolExecutionResult(execution.result);
    const status =
      execution.status === 'succeeded' || execution.status === 'failed'
        ? execution.status
        : null;
    const metadata =
      typeof execution.metadata === 'object' &&
      execution.metadata !== null &&
      !Array.isArray(execution.metadata)
        ? Object.fromEntries(
            Object.entries(execution.metadata as Record<string, unknown>).flatMap(
              ([key, value]) => (typeof value === 'string' ? [[key, value]] : []),
            ),
          )
        : undefined;

    if (
      !request ||
      typeof execution.id !== 'string' ||
      typeof execution.attempt !== 'number' ||
      status === null ||
      typeof execution.startedAt !== 'string'
    ) {
      return [];
    }

    return [
      {
        id: execution.id,
        attempt: execution.attempt,
        status,
        startedAt: execution.startedAt,
        finishedAt:
          typeof execution.finishedAt === 'string' ? execution.finishedAt : null,
        latencyMs:
          typeof execution.latencyMs === 'number' ? execution.latencyMs : null,
        request,
        metadata,
        failure: buildWorkspaceToolExecutionFailure({
          attempt: execution.attempt,
          metadata,
          recordedAt:
            typeof execution.finishedAt === 'string'
              ? execution.finishedAt
              : typeof execution.startedAt === 'string'
                ? execution.startedAt
                : null,
          result,
          status,
          toolName: request.function.name,
          value: execution.failure,
        }),
        result,
      } satisfies WorkspaceRunToolExecution,
    ];
  });

  return toolExecutions.length > 0
    ? toolExecutions
    : buildToolExecutionsFromLegacyOutputs(outputs);
}

function toWorkspaceCitation(value: unknown): WorkspaceCitation | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const citation = value as Record<string, unknown>;

  if (
    typeof citation.id !== 'string' ||
    typeof citation.label !== 'string' ||
    typeof citation.title !== 'string' ||
    typeof citation.sourceBlockId !== 'string'
  ) {
    return null;
  }

  return {
    id: citation.id,
    label: citation.label,
    title: citation.title,
    sourceBlockId: citation.sourceBlockId,
    href: typeof citation.href === 'string' ? citation.href : null,
    snippet: typeof citation.snippet === 'string' ? citation.snippet : null,
  };
}

function buildCitationsFromOutputs(outputs: Record<string, unknown>): WorkspaceCitation[] {
  if (!Array.isArray(outputs.citations)) {
    return [];
  }

  return outputs.citations.flatMap((citation) => {
    const normalized = toWorkspaceCitation(citation);
    return normalized ? [normalized] : [];
  });
}

function isWorkspaceSafetySignalSeverity(
  value: unknown,
): value is WorkspaceSafetySignal["severity"] {
  return value === "warning" || value === "critical";
}

function isWorkspaceSafetySignalCategory(
  value: unknown,
): value is WorkspaceSafetySignal["category"] {
  return (
    value === "prompt_injection" ||
    value === "data_exfiltration" ||
    value === "policy_violation"
  );
}

function toWorkspaceSafetySignal(value: unknown): WorkspaceSafetySignal | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const signal = value as Record<string, unknown>;

  if (
    typeof signal.id !== "string" ||
    !isWorkspaceSafetySignalSeverity(signal.severity) ||
    !isWorkspaceSafetySignalCategory(signal.category) ||
    typeof signal.summary !== "string" ||
    typeof signal.recordedAt !== "string"
  ) {
    return null;
  }

  return {
    id: signal.id,
    severity: signal.severity,
    category: signal.category,
    summary: signal.summary,
    detail: typeof signal.detail === "string" ? signal.detail : null,
    recordedAt: signal.recordedAt,
  };
}

function buildSafetySignalsFromOutputs(
  outputs: Record<string, unknown>,
): WorkspaceSafetySignal[] {
  const directSignals = Array.isArray(outputs.safetySignals)
    ? outputs.safetySignals
    : Array.isArray(outputs.safety_signals)
      ? outputs.safety_signals
      : null;

  if (directSignals) {
    return directSignals.flatMap((signal) => {
      const normalized = toWorkspaceSafetySignal(signal);
      return normalized ? [normalized] : [];
    });
  }

  const assistant =
    typeof outputs.assistant === "object" && outputs.assistant !== null
      ? (outputs.assistant as Record<string, unknown>)
      : null;
  const nestedSignals =
    assistant && Array.isArray(assistant.safetySignals)
      ? assistant.safetySignals
      : assistant && Array.isArray(assistant.safety_signals)
        ? assistant.safety_signals
        : [];

  return nestedSignals.flatMap((signal) => {
    const normalized = toWorkspaceSafetySignal(signal);
    return normalized ? [normalized] : [];
  });
}

function toWorkspaceSourceBlock(value: unknown): WorkspaceSourceBlock | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const sourceBlock = value as Record<string, unknown>;

  if (
    typeof sourceBlock.id !== 'string' ||
    typeof sourceBlock.title !== 'string' ||
    typeof sourceBlock.kind !== 'string'
  ) {
    return null;
  }

  const metadata =
    typeof sourceBlock.metadata === 'object' && sourceBlock.metadata !== null
      ? Object.fromEntries(
          Object.entries(sourceBlock.metadata as Record<string, unknown>).flatMap(
            ([key, metadataValue]) =>
              typeof metadataValue === 'string' ? [[key, metadataValue]] : []
          )
        )
      : {};

  return {
    id: sourceBlock.id,
    kind: sourceBlock.kind as WorkspaceSourceBlock['kind'],
    title: sourceBlock.title,
    href: typeof sourceBlock.href === 'string' ? sourceBlock.href : null,
    snippet: typeof sourceBlock.snippet === 'string' ? sourceBlock.snippet : null,
    metadata,
  };
}

function buildSourceBlocksFromOutputs(outputs: Record<string, unknown>): WorkspaceSourceBlock[] {
  if (!Array.isArray(outputs.sourceBlocks)) {
    return [];
  }

  return outputs.sourceBlocks.flatMap((sourceBlock) => {
    const normalized = toWorkspaceSourceBlock(sourceBlock);
    return normalized ? [normalized] : [];
  });
}

function isWorkspaceArtifactKind(value: unknown): value is WorkspaceArtifact['kind'] {
  return ['text', 'markdown', 'json', 'table', 'link'].includes(String(value));
}

function isWorkspaceArtifactSource(value: unknown): value is WorkspaceArtifact['source'] {
  return ['assistant_response', 'tool_output', 'user_upload'].includes(String(value));
}

function isWorkspaceArtifactStatus(value: unknown): value is WorkspaceArtifact['status'] {
  return ['draft', 'stable'].includes(String(value));
}

function toWorkspaceArtifactSummary(value: unknown): WorkspaceArtifactSummary | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const artifact = value as Record<string, unknown>;

  if (
    typeof artifact.id !== 'string' ||
    typeof artifact.title !== 'string' ||
    !isWorkspaceArtifactKind(artifact.kind) ||
    !isWorkspaceArtifactSource(artifact.source) ||
    !isWorkspaceArtifactStatus(artifact.status) ||
    typeof artifact.createdAt !== 'string' ||
    typeof artifact.updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    source: artifact.source,
    status: artifact.status,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    summary: typeof artifact.summary === 'string' ? artifact.summary : null,
    mimeType: typeof artifact.mimeType === 'string' ? artifact.mimeType : null,
    sizeBytes: typeof artifact.sizeBytes === 'number' ? artifact.sizeBytes : null,
  };
}

function toWorkspaceArtifact(value: unknown): WorkspaceArtifact | null {
  const summary = toWorkspaceArtifactSummary(value);

  if (!summary || typeof value !== 'object' || value === null) {
    return null;
  }

  const artifact = value as Record<string, unknown>;

  if ((summary.kind === 'text' || summary.kind === 'markdown') && typeof artifact.content === 'string') {
    return {
      ...summary,
      kind: summary.kind,
      content: artifact.content,
    };
  }

  if (summary.kind === 'json' && artifact.content !== undefined) {
    return {
      ...summary,
      kind: 'json',
      content: artifact.content as WorkspaceArtifactJsonValue,
    };
  }

  if (
    summary.kind === 'table' &&
    Array.isArray(artifact.columns) &&
    artifact.columns.every(column => typeof column === 'string') &&
    Array.isArray(artifact.rows) &&
    artifact.rows.every(
      row =>
        Array.isArray(row) &&
        row.every(
          cell =>
            typeof cell === 'string' ||
            typeof cell === 'number' ||
            typeof cell === 'boolean' ||
            cell === null
        )
    )
  ) {
    return {
      ...summary,
      kind: 'table',
      columns: artifact.columns,
      rows: artifact.rows,
    };
  }

  if (
    summary.kind === 'link' &&
    typeof artifact.href === 'string' &&
    typeof artifact.label === 'string'
  ) {
    return {
      ...summary,
      kind: 'link',
      href: artifact.href,
      label: artifact.label,
    };
  }

  return null;
}

function buildArtifactsFromOutputs(outputs: Record<string, unknown>): WorkspaceArtifact[] {
  if (!Array.isArray(outputs.artifacts)) {
    return [];
  }

  return outputs.artifacts.flatMap(artifact => {
    const normalized = toWorkspaceArtifact(artifact);
    return normalized ? [normalized] : [];
  });
}

function createWorkspaceArtifactRecord(input: {
  artifact: WorkspaceArtifact;
  conversationId: string;
  runId: string;
  sequence: number;
  userId: string;
}): WorkspaceArtifactRecord {
  return {
    ...input.artifact,
    conversationId: input.conversationId,
    runId: input.runId,
    sequence: input.sequence,
    userId: input.userId,
  };
}

function createWorkspaceCommentRecord(input: {
  authorDisplayName: string | null;
  content: string;
  conversationId: string;
  mentions?: WorkspaceCommentMention[];
  targetId: string;
  targetType: WorkspaceComment["targetType"];
  userId: string;
}): WorkspaceCommentRecord {
  const createdAt = new Date().toISOString();

  return {
    id: `comment_${randomUUID()}`,
    conversationId: input.conversationId,
    targetType: input.targetType,
    targetId: input.targetId,
    content: input.content,
    mentions: input.mentions && input.mentions.length > 0 ? input.mentions : [],
    authorUserId: input.userId,
    authorDisplayName: input.authorDisplayName,
    createdAt,
    updatedAt: createdAt,
    userId: input.userId,
  };
}

function createWorkspaceNotificationRecord(input: {
  actorDisplayName: string | null;
  actorUserId: string;
  comment: WorkspaceComment;
  conversationId: string;
  conversationTitle: string;
  targetId: string;
  targetType: WorkspaceComment["targetType"];
  userId: string;
}): WorkspaceNotificationRecord {
  return {
    id: `notification_${randomUUID()}`,
    type: "comment_mention",
    status: "unread",
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    conversationId: input.conversationId,
    conversationTitle: input.conversationTitle,
    commentId: input.comment.id,
    targetType: input.targetType,
    targetId: input.targetId,
    preview: buildWorkspaceCommentPreview(input.comment.content),
    createdAt: input.comment.createdAt,
    readAt: null,
    userId: input.userId,
  };
}

function mergeMessageCommentThreads(
  nextMessages: WorkspaceConversationMessage[],
  currentMessages: WorkspaceConversationMessage[],
) {
  const commentsByMessageId = new Map(
    currentMessages
      .filter((message) => Array.isArray(message.comments) && message.comments.length > 0)
      .map((message) => [message.id, message.comments ?? []] as const),
  );

  return nextMessages.map((message) => {
    const comments = commentsByMessageId.get(message.id);

    return comments ? { ...message, comments } : message;
  });
}

function createRunTimelineEvent(input: {
  createdAt?: string;
  metadata?: Record<string, unknown>;
  type: WorkspaceRunTimelineEventType;
}): WorkspaceRunTimelineEventRecord {
  return {
    id: `timeline_${randomUUID()}`,
    type: input.type,
    createdAt: input.createdAt ?? new Date().toISOString(),
    metadata: input.metadata ?? {},
  };
}

function appendTimelineEvent(
  run: WorkspaceRunRecord,
  type: WorkspaceRunTimelineEventType,
  metadata?: Record<string, unknown>,
  createdAt?: string
) {
  run.timeline = [...run.timeline, createRunTimelineEvent({ type, metadata, createdAt })];
}

function buildConversationHistoryMetadata(messages: WorkspaceConversationMessage[]) {
  const lastMessage = messages[messages.length - 1];
  let attachmentCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;

  for (const message of messages) {
    attachmentCount += message.attachments?.length ?? 0;

    if (message.feedback?.rating === 'positive') {
      positiveCount += 1;
    }

    if (message.feedback?.rating === 'negative') {
      negativeCount += 1;
    }
  }

  if (!lastMessage) {
    return {
      attachmentCount,
      feedbackSummary: {
        positiveCount,
        negativeCount,
      },
      lastMessagePreview: null,
      messageCount: 0,
    };
  }

  const normalized = lastMessage.content.replace(/\s+/g, ' ').trim();

  return {
    attachmentCount,
    feedbackSummary: {
      positiveCount,
      negativeCount,
    },
    lastMessagePreview: normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized,
    messageCount: messages.length,
  };
}

function conversationMatchesListFilters(input: {
  appTags: string[];
  conversation: WorkspaceConversationRecord;
  filters: WorkspaceConversationListInput;
}) {
  const { appTags, conversation, filters } = input;
  const normalizedTag = filters.tag?.trim().toLowerCase() || null;
  const normalizedQuery = filters.query?.trim().toLowerCase() || null;

  if (filters.appId && conversation.app.id !== filters.appId) {
    return false;
  }

  if (filters.groupId && conversation.activeGroup.id !== filters.groupId) {
    return false;
  }

  if (filters.status && conversation.status !== filters.status) {
    return false;
  }

  if (
    normalizedTag &&
    !appTags.some(tag => tag.toLowerCase() === normalizedTag)
  ) {
    return false;
  }

  const history = buildConversationHistoryMetadata(conversation.messages);

  if (filters.attachment === 'with_attachments' && history.attachmentCount === 0) {
    return false;
  }

  if (filters.feedback === 'any') {
    if (history.feedbackSummary.positiveCount + history.feedbackSummary.negativeCount === 0) {
      return false;
    }
  } else if (filters.feedback === 'positive' && history.feedbackSummary.positiveCount === 0) {
    return false;
  } else if (filters.feedback === 'negative' && history.feedbackSummary.negativeCount === 0) {
    return false;
  }

  if (normalizedQuery) {
    const haystack = [
      conversation.title,
      conversation.app.name,
      ...appTags,
      ...conversation.messages.map(message => message.content),
    ]
      .join(' ')
      .toLowerCase();

    if (!haystack.includes(normalizedQuery)) {
      return false;
    }
  }

  return true;
}

function buildMessageFeedback(
  rating: WorkspaceMessageFeedbackRating | null
): WorkspaceConversationMessageFeedback | null {
  if (!rating) {
    return null;
  }

  return {
    rating,
    updatedAt: new Date().toISOString(),
  };
}

function toWorkspaceConversationListItem(
  conversation: WorkspaceConversationRecord,
  latestRun: WorkspaceRunRecord
): WorkspaceConversationListItem {
  const preview = buildConversationHistoryMetadata(conversation.messages);

  return {
    id: conversation.id,
    title: conversation.title,
    status: conversation.status,
    pinned: conversation.pinned,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    attachmentCount: preview.attachmentCount,
    feedbackSummary: preview.feedbackSummary,
    messageCount: preview.messageCount,
    lastMessagePreview: preview.lastMessagePreview,
    app: conversation.app,
    activeGroup: conversation.activeGroup,
    run: buildRunSummary(latestRun),
  };
}

function createRunRecord(input: {
  conversation: WorkspaceConversationRecord;
  createdAt: string;
  runId: string;
  traceId: string;
  triggeredFrom: WorkspaceRunTrigger;
  userId: string;
}): WorkspaceRunRecord {
  return {
    id: input.runId,
    conversationId: input.conversation.id,
    userId: input.userId,
    type: input.conversation.run.type,
    status: 'pending',
    triggeredFrom: input.triggeredFrom,
    traceId: input.traceId,
    createdAt: input.createdAt,
    finishedAt: null,
    elapsedTime: 0,
    totalTokens: 0,
    totalSteps: 0,
    app: input.conversation.app,
    activeGroup: input.conversation.activeGroup,
    error: null,
    failure: null,
    runtime: null,
    inputs: {},
    outputs: {},
    comments: [],
    toolExecutions: [],
    artifacts: [],
    citations: [],
    safetySignals: [],
    sourceBlocks: [],
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    timeline: [],
  };
}

function buildRunFailureFromState(input: {
  error: string | null;
  outputs: Record<string, unknown>;
  recordedAt?: string | null;
}): WorkspaceRunFailure | null {
  return parseWorkspaceRunFailure(input.outputs.failure, {
    error: input.error,
    recordedAt: input.recordedAt,
  });
}

function shouldCountRunTowardsQuota(run: WorkspaceRunRecord) {
  return ['succeeded', 'failed', 'stopped'].includes(run.status) && run.totalTokens > 0;
}

export function createWorkspaceService(options: {
  fileStorage?: WorkspaceFileStorage;
} = {}): WorkspaceService {
  const preferencesByUserId = new Map<string, WorkspacePreferences>();
  const quotaLimitsByUserId = new Map<string, WorkspaceQuotaLimitRecord[]>();
  const conversationsById = new Map<string, WorkspaceConversationRecord>();
  const runsById = new Map<string, WorkspaceRunRecord>();
  const runIdsByConversationId = new Map<string, string[]>();
  const attachmentsByConversationId = new Map<string, string[]>();
  const attachmentsById = new Map<string, WorkspaceConversationAttachmentRecord>();
  const artifactIdsByRunId = new Map<string, string[]>();
  const artifactsById = new Map<string, WorkspaceArtifactRecord>();
  const sharesById = new Map<string, WorkspaceConversationShareRecord>();
  const shareIdsByConversationId = new Map<string, string[]>();
  const notificationsById = new Map<string, WorkspaceNotificationRecord>();
  const notificationIdsByUserId = new Map<string, string[]>();
  const presenceByConversationId = new Map<
    string,
    Array<Omit<WorkspaceConversationPresence['viewers'][number], 'isCurrentUser'>>
  >();

  function getContextForUser(user: AuthUser) {
    const memberGroupIds = resolveDefaultMemberGroupIds(user.email);
    const apps = resolveSeededWorkspaceAppsForUser(user);
    const groups = WORKSPACE_GROUPS.filter(group => memberGroupIds.includes(group.id));

    return {
      apps,
      groups,
      memberGroupIds,
    };
  }

  function sanitizePreferencesForUser(
    user: AuthUser,
    input: WorkspacePreferences
  ): WorkspacePreferences {
    const context = getContextForUser(user);
    const visibleAppIds = new Set(context.apps.map(app => app.id));

    return {
      favoriteAppIds: dedupeIds(input.favoriteAppIds).filter(appId => visibleAppIds.has(appId)),
      recentAppIds: dedupeIds(input.recentAppIds).filter(appId => visibleAppIds.has(appId)),
      defaultActiveGroupId:
        input.defaultActiveGroupId && context.memberGroupIds.includes(input.defaultActiveGroupId)
          ? input.defaultActiveGroupId
          : null,
      updatedAt: input.updatedAt,
    };
  }

  function getQuotaLimitsForUser(
    user: AuthUser,
    context: ReturnType<typeof getContextForUser>
  ): WorkspaceQuotaLimitRecord[] {
    const current = quotaLimitsByUserId.get(user.id) ?? [];
    const currentKeys = new Set(current.map(limit => `${limit.scope}:${limit.scopeId}`));
    const nextLimits = [...current];

    for (const seed of buildDefaultQuotaLimitRecords(user, context.memberGroupIds)) {
      const key = `${seed.scope}:${seed.scopeId}`;

      if (!currentKeys.has(key)) {
        nextLimits.push(seed);
        currentKeys.add(key);
      }
    }

    quotaLimitsByUserId.set(user.id, nextLimits);

    return nextLimits;
  }

  function buildQuotaUsageTotalsForUser(user: AuthUser): {
    tenant: number;
    user: number;
    groupsById: Record<string, number>;
  } {
    const groupsById: Record<string, number> = {};
    let tenant = 0;
    let userUsage = 0;

    for (const conversation of conversationsById.values()) {
      const launchCost = conversation.launchCost;

      tenant += launchCost;

      if (conversation.userId === user.id) {
        userUsage += launchCost;
      }

      groupsById[conversation.activeGroup.id] =
        (groupsById[conversation.activeGroup.id] ?? 0) + launchCost;
    }

    for (const run of runsById.values()) {
      if (!shouldCountRunTowardsQuota(run)) {
        continue;
      }

      const usageCost = calculateCompletionQuotaCost(run.totalTokens);

      if (usageCost <= 0) {
        continue;
      }

      tenant += usageCost;

      if (run.userId === user.id) {
        userUsage += usageCost;
      }

      groupsById[run.activeGroup.id] = (groupsById[run.activeGroup.id] ?? 0) + usageCost;
    }

    return {
      tenant,
      user: userUsage,
      groupsById,
    };
  }

  function syncRunArtifacts(run: WorkspaceRunRecord, userId: string) {
    const existingCommentsByArtifactId = new Map<string, WorkspaceComment[]>();

    for (const artifactId of artifactIdsByRunId.get(run.id) ?? []) {
      const existingArtifact = artifactsById.get(artifactId);

      if (existingArtifact?.comments?.length) {
        existingCommentsByArtifactId.set(artifactId, existingArtifact.comments);
      }

      artifactsById.delete(artifactId);
    }

    const nextArtifactIds = run.artifacts.map((artifact, index) => {
      const record = createWorkspaceArtifactRecord({
        artifact: {
          ...artifact,
          comments: artifact.comments ?? existingCommentsByArtifactId.get(artifact.id),
        },
        conversationId: run.conversationId,
        runId: run.id,
        sequence: index,
        userId,
      });

      artifactsById.set(record.id, record);
      return record.id;
    });

    artifactIdsByRunId.set(run.id, nextArtifactIds);
  }

  function buildQuotaSnapshotForUser(
    user: AuthUser,
    context: ReturnType<typeof getContextForUser>
  ): {
    quotaServiceState: 'available';
    quotaUsagesByGroupId: Record<string, QuotaUsage[]>;
  } {
    return {
      quotaServiceState: 'available',
      quotaUsagesByGroupId: buildQuotaUsagesByGroupId({
        memberGroupIds: context.memberGroupIds,
        quotaLimits: getQuotaLimitsForUser(user, context),
        usageTotals: buildQuotaUsageTotalsForUser(user),
      }),
    };
  }

  function updateConversationLatestRun(
    conversation: WorkspaceConversationRecord,
    run: WorkspaceRunRecord
  ) {
    conversation.run = buildRunSummary(run);
    conversation.updatedAt = run.finishedAt ?? run.createdAt;
  }

  function toWorkspaceConversationData(
    conversation: WorkspaceConversationRecord
  ): WorkspaceConversation {
    return {
      id: conversation.id,
      title: conversation.title,
      status: conversation.status,
      pinned: conversation.pinned,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      launchId: conversation.launchId,
      app: conversation.app,
      activeGroup: conversation.activeGroup,
      messages: conversation.messages,
      run: conversation.run,
    };
  }

  function listRunRecords(conversationId: string) {
    return (runIdsByConversationId.get(conversationId) ?? [])
      .map(runId => runsById.get(runId))
      .filter((run): run is WorkspaceRunRecord => Boolean(run))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  function toWorkspaceConversationShare(
    share: WorkspaceConversationShareRecord
  ): WorkspaceConversationShare {
    return {
      id: share.id,
      conversationId: share.conversationId,
      status: share.status,
      access: share.access,
      shareUrl: buildShareUrl(share.id),
      group: share.group,
      createdAt: share.createdAt,
      revokedAt: share.revokedAt,
    };
  }

  function listShareRecords(conversationId: string) {
    return (shareIdsByConversationId.get(conversationId) ?? [])
      .map(shareId => sharesById.get(shareId))
      .filter((share): share is WorkspaceConversationShareRecord => Boolean(share))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  function findActiveShareRecordForUser(user: AuthUser, shareId: string) {
    const share = sharesById.get(shareId);

    if (!share || share.status !== "active") {
      return null;
    }

    const memberGroupIds = resolveDefaultMemberGroupIds(user.email);

    if (!memberGroupIds.includes(share.group.id)) {
      return null;
    }

    return share;
  }

  return {
    getCatalogForUser(user) {
      const context = getContextForUser(user);
      const preferences = sanitizePreferencesForUser(
        user,
        preferencesByUserId.get(user.id) ?? buildEmptyPreferences()
      );
      const quotaSnapshot = buildQuotaSnapshotForUser(user, context);

      return buildWorkspaceCatalog(user, {
        groups: context.groups,
        apps: context.apps,
        memberGroupIds: context.memberGroupIds,
        preferences,
        quotaServiceState: quotaSnapshot.quotaServiceState,
        quotaUsagesByGroupId: quotaSnapshot.quotaUsagesByGroupId,
      });
    },
    getPreferencesForUser(user) {
      return sanitizePreferencesForUser(
        user,
        preferencesByUserId.get(user.id) ?? buildEmptyPreferences()
      );
    },
    updatePreferencesForUser(user, input) {
      const nextPreferences = sanitizePreferencesForUser(user, {
        favoriteAppIds: input.favoriteAppIds,
        recentAppIds: input.recentAppIds,
        defaultActiveGroupId: input.defaultActiveGroupId,
        updatedAt: new Date().toISOString(),
      });

      preferencesByUserId.set(user.id, nextPreferences);

      return nextPreferences;
    },
    async launchAppForUser(user, input) {
      const catalog = await this.getCatalogForUser(user);
      const app = catalog.apps.find(candidate => candidate.id === input.appId);

      if (!app) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace app could not be found.',
        };
      }

      const quotaUsages =
        catalog.quotaUsagesByGroupId[input.activeGroupId] ??
        catalog.quotaUsagesByGroupId[catalog.defaultActiveGroupId] ??
        [];
      const guard = evaluateAppLaunch({
        app,
        activeGroupId: input.activeGroupId,
        memberGroupIds: catalog.memberGroupIds,
        quotas: quotaUsages,
        quotaServiceState: catalog.quotaServiceState,
      });

      if (!guard.canLaunch || !guard.attributedGroupId) {
        return {
          ok: false,
          statusCode: 409,
          code: 'WORKSPACE_LAUNCH_BLOCKED',
          message: 'The workspace app launch is blocked by the current authorization or quota state.',
          details: guard,
        };
      }

      const attributedGroup = catalog.groups.find(group => group.id === guard.attributedGroupId);

      if (!attributedGroup) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The attributed workspace group could not be found.',
        };
      }

      await this.updatePreferencesForUser(user, {
        favoriteAppIds: catalog.favoriteAppIds,
        recentAppIds: recordRecentApp(catalog.recentAppIds, app.id),
        defaultActiveGroupId: attributedGroup.id,
      });

      const launchId = randomUUID();
      const conversationId = `conv_${randomUUID()}`;
      const launchedAt = new Date().toISOString();
      const conversation: WorkspaceConversationRecord = {
        id: conversationId,
        title: app.name,
        status: 'active',
        pinned: false,
        createdAt: launchedAt,
        updatedAt: launchedAt,
        launchId,
        launchCost: app.launchCost,
        userId: user.id,
        app: {
          id: app.id,
          slug: app.slug,
          name: app.name,
          summary: app.summary,
          kind: app.kind,
          status: app.status,
          shortCode: app.shortCode,
        },
        activeGroup: attributedGroup,
        messages: [],
        run: {
          id: '',
          type: resolveRunType(app.kind),
          status: 'pending',
          triggeredFrom: 'app_launch',
          traceId: '',
          createdAt: launchedAt,
          finishedAt: null,
          elapsedTime: 0,
          totalTokens: 0,
          totalSteps: 0,
        },
      };
      const runId = `run_${randomUUID()}`;
      const traceId = buildTraceId();
      const run = createRunRecord({
        conversation,
        createdAt: launchedAt,
        runId,
        traceId,
        triggeredFrom: 'app_launch',
        userId: user.id,
      });
      appendTimelineEvent(
        run,
        'run_created',
        {
          triggeredFrom: 'app_launch',
          traceId,
        },
        launchedAt
      );

      runsById.set(runId, run);
      runIdsByConversationId.set(conversationId, [runId]);
      updateConversationLatestRun(conversation, run);
      conversationsById.set(conversationId, conversation);

      return {
        ok: true,
        data: {
          id: launchId,
          status: 'conversation_ready',
          launchUrl: buildLaunchUrl(conversationId),
          launchedAt,
          conversationId,
          runId,
          traceId,
          app: {
            id: app.id,
            slug: app.slug,
            name: app.name,
            summary: app.summary,
            kind: app.kind,
            status: app.status,
            shortCode: app.shortCode,
            launchCost: app.launchCost,
          },
          attributedGroup,
        },
      };
    },
    getConversationForUser(user, conversationId) {
      const conversation = conversationsById.get(conversationId);

      if (
        !conversation ||
        conversation.userId !== user.id ||
        conversation.status === 'deleted'
      ) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const latestRun = listRunRecords(conversationId)[0];

      if (latestRun) {
        updateConversationLatestRun(conversation, latestRun);
      }

      return {
        ok: true,
        data: toWorkspaceConversationData(conversation),
      };
    },
    listConversationsForUser(user, input) {
      const limit = Math.min(Math.max(input.limit ?? 12, 1), 50);
      const context = getContextForUser(user);
      const appTagsByAppId = new Map(context.apps.map(app => [app.id, app.tags]));
      const items = [...conversationsById.values()]
        .filter(
          conversation =>
            conversation.userId === user.id && conversation.status !== 'deleted'
        )
        .flatMap(conversation => {
          const latestRun = listRunRecords(conversation.id)[0];

          if (!latestRun) {
            return [];
          }

          if (
            !conversationMatchesListFilters({
              appTags: appTagsByAppId.get(conversation.app.id) ?? [],
              conversation,
              filters: input,
            })
          ) {
            return [];
          }

          return [toWorkspaceConversationListItem(conversation, latestRun)];
        })
        .sort((left, right) => {
          if (left.pinned !== right.pinned) {
            return left.pinned ? -1 : 1;
          }

          return right.updatedAt.localeCompare(left.updatedAt);
        })
        .slice(0, limit);

      return {
        ok: true,
        data: {
          items,
          filters: {
            appId: input.appId ?? null,
            attachment: input.attachment ?? null,
            feedback: input.feedback ?? null,
            groupId: input.groupId ?? null,
            query: input.query?.trim() || null,
            status: input.status ?? null,
            tag: input.tag?.trim() || null,
            limit,
          },
        },
      };
    },
    updateConversationForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      if (
        input.expectedUpdatedAt !== undefined &&
        input.expectedUpdatedAt !== conversation.updatedAt
      ) {
        return buildConversationUpdateConflict(
          toWorkspaceConversationData(conversation),
          input.expectedUpdatedAt,
        );
      }

      applyConversationUpdates(conversation, input);

      return {
        ok: true,
        data: toWorkspaceConversationData(conversation),
      };
    },
    listConversationRunsForUser(user, conversationId) {
      const conversation = conversationsById.get(conversationId);

      if (
        !conversation ||
        conversation.userId !== user.id ||
        conversation.status === 'deleted'
      ) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      return {
        ok: true,
        data: {
          conversationId,
          runs: listRunRecords(conversationId).map(buildRunSummary),
        },
      };
    },
    getRunForUser(user, runId) {
      const run = runsById.get(runId);
      const conversation =
        run ? conversationsById.get(run.conversationId) : null;

      if (
        !run ||
        run.userId !== user.id ||
        !conversation ||
        conversation.status === 'deleted'
      ) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace run could not be found.',
        };
      }

      run.usage = buildUsageFromOutputs(run);

      const { userId, ...runData } = run;

      return {
        ok: true,
        data: runData,
      };
    },
    async uploadConversationFileForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const attachmentId = `file_${randomUUID()}`;
      let storageKey: string | null = null;

      if (options.fileStorage) {
        const stored = await options.fileStorage.saveFile({
          tenantId: user.tenantId,
          userId: user.id,
          fileId: attachmentId,
          fileName: input.fileName,
          bytes: input.bytes,
        });
        storageKey = stored.storageKey;
      }

      const attachment: WorkspaceConversationAttachment = {
        id: attachmentId,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength,
        uploadedAt: new Date().toISOString(),
      };

      attachmentsById.set(attachmentId, {
        attachment,
        conversationId: input.conversationId,
        storageKey,
        userId: user.id,
      });
      attachmentsByConversationId.set(input.conversationId, [
        ...(attachmentsByConversationId.get(input.conversationId) ?? []),
        attachmentId,
      ]);

      return {
        ok: true,
        data: attachment,
      };
    },
    updateMessageFeedbackForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const messageIndex = conversation.messages.findIndex(
        message => message.id === input.messageId && message.role === 'assistant'
      );

      if (messageIndex < 0) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace message could not be found.',
        };
      }

      const currentMessage = conversation.messages[messageIndex];

      if (!currentMessage) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace message could not be found.',
        };
      }

      const nextFeedback = buildMessageFeedback(input.rating);
      const nextMessage: WorkspaceConversationMessage = {
        ...currentMessage,
        feedback: nextFeedback,
      };

      conversation.messages = conversation.messages.map((message, index) =>
        index === messageIndex ? nextMessage : message
      );
      conversation.updatedAt = nextFeedback?.updatedAt ?? new Date().toISOString();

      return {
        ok: true,
        data: {
          conversationId: input.conversationId,
          message: nextMessage,
        },
      };
    },
    listConversationAttachmentsForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const attachments = input.fileIds.flatMap(fileId => {
        const record = attachmentsById.get(fileId);

        if (
          !record ||
          record.userId !== user.id ||
          record.conversationId !== input.conversationId
        ) {
          return [];
        }

        return [record.attachment];
      });

      return {
        ok: true,
        data: attachments,
      };
    },
    createCommentForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const content = normalizeWorkspaceCommentContent(input.request.content);

      if (!content || input.request.targetId.trim().length === 0) {
        return {
          ok: false,
          statusCode: 400,
          code: 'WORKSPACE_INVALID_PAYLOAD',
          message:
            'Workspace comments require a non-empty target id and comment content.',
        };
      }

      const targetId = input.request.targetId.trim();
      const targetType = input.request.targetType;
      const mentions = input.mentions ?? [];
      const comment = createWorkspaceCommentRecord({
        authorDisplayName: user.displayName ?? null,
        content,
        conversationId: input.conversationId,
        mentions,
        targetId,
        targetType,
        userId: user.id,
      });
      let thread: WorkspaceComment[];

      if (targetType === 'message') {
        const messageIndex = conversation.messages.findIndex(
          message => message.id === targetId
        );
        const currentMessage =
          messageIndex >= 0 ? conversation.messages[messageIndex] ?? null : null;

        if (!currentMessage) {
          return {
            ok: false,
            statusCode: 404,
            code: 'WORKSPACE_NOT_FOUND',
            message: 'The target workspace message could not be found.',
          };
        }

        const nextThread = [...(currentMessage.comments ?? []), comment];
        conversation.messages = conversation.messages.map((message, index) =>
          index === messageIndex ? { ...message, comments: nextThread } : message
        );
        conversation.updatedAt = comment.updatedAt;
        thread = nextThread;
      } else if (targetType === 'run') {
        const run = runsById.get(targetId);

        if (!run || run.conversationId !== input.conversationId || run.userId !== user.id) {
          return {
            ok: false,
            statusCode: 404,
            code: 'WORKSPACE_NOT_FOUND',
            message: 'The target workspace run could not be found.',
          };
        }

        run.comments = [...run.comments, comment];
        conversation.updatedAt = comment.updatedAt;
        thread = run.comments;
      } else {
        const artifact = artifactsById.get(targetId);

        if (
          !artifact ||
          artifact.conversationId !== input.conversationId ||
          artifact.userId !== user.id
        ) {
          return {
            ok: false,
            statusCode: 404,
            code: 'WORKSPACE_NOT_FOUND',
            message: 'The target workspace artifact could not be found.',
          };
        }

        artifact.comments = [...(artifact.comments ?? []), comment];
        conversation.updatedAt = comment.updatedAt;
        thread = artifact.comments;
      }

      for (const mention of mentions) {
        if (mention.userId === user.id) {
          continue;
        }

        const notification = createWorkspaceNotificationRecord({
          actorDisplayName: user.displayName ?? null,
          actorUserId: user.id,
          comment,
          conversationId: input.conversationId,
          conversationTitle: conversation.title,
          targetId,
          targetType,
          userId: mention.userId,
        });
        notificationsById.set(notification.id, notification);
        notificationIdsByUserId.set(mention.userId, [
          notification.id,
          ...(notificationIdsByUserId.get(mention.userId) ?? []),
        ]);
      }

      return {
        ok: true,
        data: {
          conversationId: input.conversationId,
          targetType,
          targetId,
          comment,
          thread,
        },
      };
    },
    createSharedCommentForUser(user, input) {
      const share = findActiveShareRecordForUser(user, input.shareId);

      if (!share) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace share could not be found.',
        };
      }

      if (share.access === "read_only") {
        return {
          ok: false,
          statusCode: 403,
          code: "WORKSPACE_FORBIDDEN",
          message: "The current user can review the shared conversation, but cannot add comments.",
        };
      }

      const conversation = conversationsById.get(share.conversationId);

      if (!conversation) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const content = normalizeWorkspaceCommentContent(input.request.content);

      if (!content || input.request.targetId.trim().length === 0) {
        return {
          ok: false,
          statusCode: 400,
          code: 'WORKSPACE_INVALID_PAYLOAD',
          message:
            'Workspace comments require a non-empty target id and comment content.',
        };
      }

      const targetId = input.request.targetId.trim();
      const targetType = input.request.targetType;
      const mentions = input.mentions ?? [];
      const comment = createWorkspaceCommentRecord({
        authorDisplayName: user.displayName ?? null,
        content,
        conversationId: conversation.id,
        mentions,
        targetId,
        targetType,
        userId: user.id,
      });
      let thread: WorkspaceComment[];

      if (targetType === "message") {
        const messageIndex = conversation.messages.findIndex(
          (message) => message.id === targetId,
        );
        const currentMessage =
          messageIndex >= 0 ? conversation.messages[messageIndex] ?? null : null;

        if (!currentMessage) {
          return {
            ok: false,
            statusCode: 404,
            code: "WORKSPACE_NOT_FOUND",
            message: "The target workspace message could not be found.",
          };
        }

        const nextThread = [...(currentMessage.comments ?? []), comment];
        conversation.messages = conversation.messages.map((message, index) =>
          index === messageIndex ? { ...message, comments: nextThread } : message
        );
        conversation.updatedAt = comment.updatedAt;
        thread = nextThread;
      } else if (targetType === "run") {
        const run = runsById.get(targetId);

        if (!run || run.conversationId !== conversation.id) {
          return {
            ok: false,
            statusCode: 404,
            code: "WORKSPACE_NOT_FOUND",
            message: "The target workspace run could not be found.",
          };
        }

        run.comments = [...run.comments, comment];
        conversation.updatedAt = comment.updatedAt;
        thread = run.comments;
      } else {
        const artifact = artifactsById.get(targetId);

        if (!artifact || artifact.conversationId !== conversation.id) {
          return {
            ok: false,
            statusCode: 404,
            code: "WORKSPACE_NOT_FOUND",
            message: "The target workspace artifact could not be found.",
          };
        }

        artifact.comments = [...(artifact.comments ?? []), comment];
        conversation.updatedAt = comment.updatedAt;
        thread = artifact.comments;
      }

      for (const mention of mentions) {
        if (mention.userId === user.id) {
          continue;
        }

        const notification = createWorkspaceNotificationRecord({
          actorDisplayName: user.displayName ?? null,
          actorUserId: user.id,
          comment,
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          targetId,
          targetType,
          userId: mention.userId,
        });
        notificationsById.set(notification.id, notification);
        notificationIdsByUserId.set(mention.userId, [
          notification.id,
          ...(notificationIdsByUserId.get(mention.userId) ?? []),
        ]);
      }

      return {
        ok: true,
        data: {
          conversationId: conversation.id,
          targetType,
          targetId,
          comment,
          thread,
        },
      };
    },
    canUserAccessConversationForCollaboration(user, conversationId) {
      const conversation = conversationsById.get(conversationId);

      if (!conversation) {
        return false;
      }

      if (conversation.userId === user.id) {
        return true;
      }

      const memberGroupIds = resolveDefaultMemberGroupIds(user.email);

      return listShareRecords(conversationId).some(
        (share) => share.status === 'active' && memberGroupIds.includes(share.group.id)
      );
    },
    listNotificationsForUser(user) {
      const items = (notificationIdsByUserId.get(user.id) ?? [])
        .map((notificationId) => notificationsById.get(notificationId))
        .filter(
          (notification): notification is WorkspaceNotificationRecord =>
            notification !== undefined
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

      return {
        ok: true,
        data: {
          items,
          unreadCount: items.filter((item) => item.status === 'unread').length,
        },
      };
    },
    markNotificationReadForUser(user, notificationId) {
      const notification = notificationsById.get(notificationId);

      if (!notification || notification.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace notification could not be found.',
        };
      }

      if (notification.status === 'read') {
        return {
          ok: true,
          data: notification,
        };
      }

      const nextNotification: WorkspaceNotificationRecord = {
        ...notification,
        status: 'read',
        readAt: new Date().toISOString(),
      };
      notificationsById.set(notificationId, nextNotification);

      return {
        ok: true,
        data: nextNotification,
      };
    },
    getArtifactForUser(user, artifactId) {
      const artifact = artifactsById.get(artifactId);

      if (!artifact || artifact.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace artifact could not be found.',
        };
      }

      const { conversationId, runId, sequence, userId, ...artifactData } = artifact;

      void conversationId;
      void runId;
      void sequence;
      void userId;

      return {
        ok: true,
        data: artifactData,
      };
    },
    listPendingActionsForUser(user, conversationId) {
      const conversation = conversationsById.get(conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const run = runsById.get(conversation.run.id);

      if (!run || run.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace run could not be found.',
        };
      }

      const now = new Date().toISOString();
      const expirationResult = expireWorkspaceHitlSteps({
        items: readPendingActionsFromOutputs(run.outputs),
        now,
      });

      if (expirationResult.expiredItems.length > 0) {
        run.outputs = {
          ...run.outputs,
          pendingActions: expirationResult.items,
        };
        conversation.updatedAt = now;
      }

      return {
        ok: true,
        data: {
          conversationId,
          runId: run.id,
          items: expirationResult.items,
          expiredItems:
            expirationResult.expiredItems.length > 0
              ? expirationResult.expiredItems
              : undefined,
        },
      };
    },
    respondToPendingActionForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const run = runsById.get(conversation.run.id);

      if (!run || run.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace run could not be found.',
        };
      }

      const now = new Date().toISOString();
      const expirationResult = expireWorkspaceHitlSteps({
        items: readPendingActionsFromOutputs(run.outputs),
        now,
      });
      const pendingActions = expirationResult.items;

      if (expirationResult.expiredItems.length > 0) {
        run.outputs = {
          ...run.outputs,
          pendingActions,
        };
        conversation.updatedAt = now;
      }

      const pendingActionIndex = pendingActions.findIndex(
        (item) => item.id === input.stepId
      );

      if (pendingActionIndex < 0) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The requested workspace pending action could not be found.',
          details: {
            stepId: input.stepId,
          },
        };
      }

      const respondedAt = new Date().toISOString();
      const responseResult = applyWorkspaceHitlStepResponse({
        step: pendingActions[pendingActionIndex]!,
        request: input.request,
        actorUserId: user.id,
        actorDisplayName: user.displayName,
        respondedAt,
      });

      if (!responseResult.ok) {
        return {
          ok: false,
          statusCode:
            responseResult.code === 'WORKSPACE_ACTION_CONFLICT' ? 409 : 400,
          code: responseResult.code,
          message: responseResult.message,
          details: responseResult.details,
        };
      }

      const items = pendingActions.map((item, index) =>
        index === pendingActionIndex ? responseResult.item : item
      );
      const toolApprovalResolution = buildWorkspaceToolApprovalResolution({
        appName: conversation.app.name,
        attempt: run.toolExecutions.length + 1,
        outputs: run.outputs,
        step: responseResult.item,
      });
      const nextMessages = toolApprovalResolution
        ? [...conversation.messages, toolApprovalResolution.toolMessage, toolApprovalResolution.assistantMessage]
        : conversation.messages;
      const nextOutputs = toolApprovalResolution
        ? {
            ...toolApprovalResolution.nextOutputs,
            pendingActions: items,
          }
        : {
            ...run.outputs,
            pendingActions: items,
          };

      run.outputs = nextOutputs;
      run.toolExecutions = toolApprovalResolution?.nextToolExecutions ?? run.toolExecutions;
      conversation.messages = nextMessages;
      conversation.updatedAt = respondedAt;

      if (toolApprovalResolution) {
        run.timeline.push({
          id: `timeline_${randomUUID()}`,
          type: 'output_recorded',
          createdAt: respondedAt,
          metadata: {
            keys: ['pendingActions', 'assistant', 'toolExecutions', 'toolResults'],
            resolutionAction: responseResult.item.response?.action ?? null,
            toolExecutionCount: run.toolExecutions.length,
          },
        });
      }

      return {
        ok: true,
        data: {
          conversationId: conversation.id,
          runId: run.id,
          item: responseResult.item,
          items,
        },
      };
    },
    getSharedArtifactForUser(user, input) {
      const share = sharesById.get(input.shareId);

      if (!share || share.status !== 'active') {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace share could not be found.',
        };
      }

      const context = getContextForUser(user);

      if (!context.memberGroupIds.includes(share.group.id)) {
        return {
          ok: false,
          statusCode: 403,
          code: 'WORKSPACE_FORBIDDEN',
          message: 'The current user is not allowed to access this shared artifact.',
        };
      }

      const artifact = artifactsById.get(input.artifactId);

      if (!artifact || artifact.conversationId !== share.conversationId) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace artifact could not be found.',
        };
      }

      const { conversationId, runId, sequence, userId, ...artifactData } = artifact;

      void conversationId;
      void runId;
      void sequence;
      void userId;

      return {
        ok: true,
        data: artifactData,
      };
    },
    listConversationSharesForUser(user, conversationId) {
      const conversation = conversationsById.get(conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      return {
        ok: true,
        data: {
          conversationId,
          shares: listShareRecords(conversationId).map(toWorkspaceConversationShare),
        },
      };
    },
    getConversationPresenceForUser(user, conversationId) {
      const conversation = conversationsById.get(conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const nextEntries = pruneWorkspacePresenceEntries(
        presenceByConversationId.get(conversationId) ?? []
      );
      presenceByConversationId.set(conversationId, nextEntries);

      return {
        ok: true,
        data: buildWorkspaceConversationPresence({
          conversationId,
          entries: nextEntries,
          currentUserId: user.id,
        }),
      };
    },
    updateConversationPresenceForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const nextEntries = upsertWorkspacePresenceEntry({
        activeRunId: input.activeRunId,
        entries: presenceByConversationId.get(input.conversationId) ?? [],
        sessionId: input.sessionId,
        state: input.state,
        surface: input.surface,
        user,
      });
      presenceByConversationId.set(input.conversationId, nextEntries);

      return {
        ok: true,
        data: buildWorkspaceConversationPresence({
          conversationId: input.conversationId,
          entries: nextEntries,
          currentUserId: user.id,
        }),
      };
    },
    getSharedConversationPresenceForUser(user, shareId) {
      const share = sharesById.get(shareId);

      if (!share || share.status !== 'active') {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace share could not be found.',
        };
      }

      const context = getContextForUser(user);

      if (!context.memberGroupIds.includes(share.group.id)) {
        return {
          ok: false,
          statusCode: 403,
          code: 'WORKSPACE_FORBIDDEN',
          message: 'The current user is not allowed to access this shared conversation.',
        };
      }

      const nextEntries = pruneWorkspacePresenceEntries(
        presenceByConversationId.get(share.conversationId) ?? []
      );
      presenceByConversationId.set(share.conversationId, nextEntries);

      return {
        ok: true,
        data: buildWorkspaceConversationPresence({
          conversationId: share.conversationId,
          entries: nextEntries,
          currentUserId: user.id,
        }),
      };
    },
    updateSharedConversationPresenceForUser(user, input) {
      const share = sharesById.get(input.shareId);

      if (!share || share.status !== 'active') {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace share could not be found.',
        };
      }

      const context = getContextForUser(user);

      if (!context.memberGroupIds.includes(share.group.id)) {
        return {
          ok: false,
          statusCode: 403,
          code: 'WORKSPACE_FORBIDDEN',
          message: 'The current user is not allowed to access this shared conversation.',
        };
      }

      const nextEntries = upsertWorkspacePresenceEntry({
        activeRunId: input.activeRunId,
        entries: presenceByConversationId.get(share.conversationId) ?? [],
        sessionId: input.sessionId,
        state: input.state,
        surface: input.surface ?? 'shared_conversation',
        user,
      });
      presenceByConversationId.set(share.conversationId, nextEntries);

      return {
        ok: true,
        data: buildWorkspaceConversationPresence({
          conversationId: share.conversationId,
          entries: nextEntries,
          currentUserId: user.id,
        }),
      };
    },
    createConversationShareForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const context = getContextForUser(user);
      const targetGroup = context.groups.find(group => group.id === input.groupId);

      if (!targetGroup) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace group could not be found.',
        };
      }

      const existingShare = listShareRecords(input.conversationId).find(
        share => share.group.id === input.groupId
      );
      const now = new Date().toISOString();

      if (existingShare) {
        existingShare.status = 'active';
        existingShare.access = input.access;
        existingShare.revokedAt = null;

        return {
          ok: true,
          data: toWorkspaceConversationShare(existingShare),
        };
      }

      const share: WorkspaceConversationShareRecord = {
        id: `share_${randomUUID()}`,
        access: input.access,
        conversationId: input.conversationId,
        creatorUserId: user.id,
        group: targetGroup,
        status: 'active',
        createdAt: now,
        revokedAt: null,
      };

      sharesById.set(share.id, share);
      shareIdsByConversationId.set(input.conversationId, [
        ...(shareIdsByConversationId.get(input.conversationId) ?? []),
        share.id,
      ]);

      return {
        ok: true,
        data: toWorkspaceConversationShare(share),
      };
    },
    updateSharedConversationForUser(user, input) {
      const share = findActiveShareRecordForUser(user, input.shareId);

      if (!share) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace share could not be found.",
        };
      }

      if (share.access !== "editor") {
        return {
          ok: false,
          statusCode: 403,
          code: "WORKSPACE_FORBIDDEN",
          message:
            "The current user can review the shared conversation, but cannot edit conversation metadata.",
        };
      }

      if (input.status === "deleted") {
        return {
          ok: false,
          statusCode: 403,
          code: "WORKSPACE_FORBIDDEN",
          message: "Shared editors cannot delete workspace conversations.",
        };
      }

      const conversation = conversationsById.get(share.conversationId);

      if (!conversation) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace conversation could not be found.",
        };
      }

      if (
        input.expectedUpdatedAt !== undefined &&
        input.expectedUpdatedAt !== conversation.updatedAt
      ) {
        return buildConversationUpdateConflict(
          toWorkspaceConversationData(conversation),
          input.expectedUpdatedAt,
        );
      }

      applyConversationUpdates(conversation, input);

      return {
        ok: true,
        data: toWorkspaceConversationData(conversation),
      };
    },
    revokeConversationShareForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);
      const share = sharesById.get(input.shareId);

      if (
        !conversation ||
        conversation.userId !== user.id ||
        !share ||
        share.conversationId !== input.conversationId
      ) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace share could not be found.',
        };
      }

      share.status = 'revoked';
      share.revokedAt = new Date().toISOString();

      return {
        ok: true,
        data: toWorkspaceConversationShare(share),
      };
    },
    getSharedConversationForUser(user, shareId) {
      const share = sharesById.get(shareId);

      if (!share || share.status !== 'active') {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace share could not be found.',
        };
      }

      const context = getContextForUser(user);

      if (!context.memberGroupIds.includes(share.group.id)) {
        return {
          ok: false,
          statusCode: 403,
          code: 'WORKSPACE_FORBIDDEN',
          message: 'The current user is not allowed to access this shared conversation.',
        };
      }

      const conversation = conversationsById.get(share.conversationId);

      if (!conversation) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const latestRun = listRunRecords(conversation.id)[0];

      if (latestRun) {
        updateConversationLatestRun(conversation, latestRun);
      }

      const { userId, launchCost, ...conversationData } = conversation;

      return {
        ok: true,
        data: {
          share: toWorkspaceConversationShare(share),
          conversation: conversationData,
        },
      };
    },
    appendRunTimelineEventForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);
      const run = runsById.get(input.runId);

      if (
        !conversation ||
        conversation.userId !== user.id ||
        !run ||
        run.userId !== user.id ||
        run.conversationId !== input.conversationId
      ) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace run could not be found.',
        };
      }

      appendTimelineEvent(run, input.type, input.metadata);
      run.usage = buildUsageFromOutputs(run);

      const { userId, ...runData } = run;

      return {
        ok: true,
        data: runData,
      };
    },
    createConversationRunForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const createdAt = new Date().toISOString();
      const run = createRunRecord({
        conversation,
        createdAt,
        runId: `run_${randomUUID()}`,
        traceId: buildTraceId(),
        triggeredFrom: input.triggeredFrom,
        userId: user.id,
      });
      appendTimelineEvent(
        run,
        'run_created',
        {
          triggeredFrom: input.triggeredFrom,
          traceId: run.traceId,
        },
        createdAt
      );

      runsById.set(run.id, run);
      artifactIdsByRunId.set(run.id, []);
      runIdsByConversationId.set(conversation.id, [
        ...(runIdsByConversationId.get(conversation.id) ?? []),
        run.id,
      ]);
      updateConversationLatestRun(conversation, run);

      return {
        ok: true,
        data: toWorkspaceConversationData(conversation),
      };
    },
    updateConversationRunForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);
      const run = runsById.get(input.runId);

      if (
        !conversation ||
        conversation.userId !== user.id ||
        !run ||
        run.userId !== user.id ||
        run.conversationId !== input.conversationId
      ) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      run.status = input.status;
      run.finishedAt =
        input.finishedAt ??
        (input.status === 'succeeded' || input.status === 'failed' || input.status === 'stopped'
          ? new Date().toISOString()
          : run.finishedAt);
      run.elapsedTime = input.elapsedTime ?? run.elapsedTime;
      run.totalTokens = input.totalTokens ?? run.totalTokens;
      run.totalSteps = input.totalSteps ?? run.totalSteps;
      run.error = input.error ?? run.error;

      if (input.inputs) {
        run.inputs = {
          ...run.inputs,
          ...input.inputs,
        };
        appendTimelineEvent(run, 'input_recorded', {
          keys: Object.keys(input.inputs),
        });
      }

      if (input.outputs) {
        run.outputs = {
          ...run.outputs,
          ...input.outputs,
        };
        run.runtime = buildRuntimeFromOutputs(run.outputs);
        run.toolExecutions = buildToolExecutionsFromOutputs(run.outputs);
        run.artifacts = buildArtifactsFromOutputs(run.outputs);
        run.citations = buildCitationsFromOutputs(run.outputs);
        run.safetySignals = buildSafetySignalsFromOutputs(run.outputs);
        run.sourceBlocks = buildSourceBlocksFromOutputs(run.outputs);
        appendTimelineEvent(run, 'output_recorded', {
          keys: Object.keys(input.outputs),
          toolExecutionCount: run.toolExecutions.length,
        });
      }

      if (input.status === 'running') {
        appendTimelineEvent(run, 'run_started', {
          status: input.status,
        });
      }

      if (input.status === 'succeeded') {
        appendTimelineEvent(run, 'run_succeeded', {
          status: input.status,
        });
      }

      if (input.status === 'failed') {
        appendTimelineEvent(run, 'run_failed', {
          status: input.status,
          error: input.error ?? null,
        });
      }

      if (input.status === 'stopped') {
        appendTimelineEvent(run, 'run_stopped', {
          status: input.status,
        });
      }

      if (input.status === 'failed') {
        run.failure = buildRunFailureFromState({
          error: run.error,
          outputs: run.outputs,
          recordedAt: run.finishedAt ?? new Date().toISOString(),
        });
      } else if (input.status === 'succeeded' || input.status === 'stopped') {
        run.failure = null;
      } else if (input.outputs || input.error !== undefined) {
        run.failure = buildRunFailureFromState({
          error: run.error,
          outputs: run.outputs,
          recordedAt: run.finishedAt,
        });
      }

      run.artifacts = buildArtifactsFromOutputs(run.outputs);
      run.citations = buildCitationsFromOutputs(run.outputs);
      run.safetySignals = buildSafetySignalsFromOutputs(run.outputs);
      run.sourceBlocks = buildSourceBlocksFromOutputs(run.outputs);
      run.runtime = buildRuntimeFromOutputs(run.outputs);
      run.toolExecutions = buildToolExecutionsFromOutputs(run.outputs);
      syncRunArtifacts(run, user.id);
      run.usage = buildUsageFromOutputs(run);

      if (input.messageHistory) {
        conversation.messages = mergeMessageCommentThreads(
          input.messageHistory,
          conversation.messages,
        );
      }

      updateConversationLatestRun(conversation, run);

      return {
        ok: true,
        data: toWorkspaceConversationData(conversation),
      };
    },
  };
}

export type {
  WorkspaceArtifactResult,
  WorkspaceCommentCreateInput,
  WorkspaceCommentCreateResult,
  WorkspaceConversationAttachmentLookupInput,
  WorkspaceConversationAttachmentLookupResult,
  WorkspaceConversationMessageFeedbackResult,
  WorkspaceConversationMessageFeedbackUpdateInput,
  WorkspaceConversationListInput,
  WorkspaceConversationListResult,
  WorkspacePendingActionsResult,
  WorkspacePendingActionRespondInput,
  WorkspacePendingActionRespondResult,
  WorkspaceConversationResult,
  WorkspaceConversationRunsResult,
  WorkspaceConversationUpdateInput,
  WorkspaceConversationShareCreateInput,
  WorkspaceConversationShareResult,
  WorkspaceConversationShareRevokeInput,
  WorkspaceSharedCommentCreateInput,
  WorkspaceSharedConversationUpdateInput,
  WorkspaceConversationSharesResult,
  WorkspaceConversationUploadInput,
  WorkspaceConversationUploadResult,
  WorkspaceLaunchResult,
  WorkspaceRunCreateInput,
  WorkspaceRunResult,
  WorkspaceRunTimelineEventAppendInput,
  WorkspaceRunUpdateInput,
  WorkspaceSharedArtifactLookupInput,
  WorkspaceSharedConversationResult,
  WorkspaceService,
};
