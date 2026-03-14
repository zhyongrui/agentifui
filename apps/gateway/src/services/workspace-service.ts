import type { AuthUser } from '@agentifui/shared/auth';
import type {
  QuotaUsage,
  WorkspaceAppLaunch,
  WorkspaceArtifact,
  WorkspaceArtifactJsonValue,
  WorkspaceArtifactSummary,
  WorkspaceCatalog,
  WorkspaceConversationAttachment,
  WorkspaceConversation,
  WorkspaceConversationListAttachmentFilter,
  WorkspaceConversationListFeedbackFilter,
  WorkspaceConversationListStatusFilter,
  WorkspaceConversationStatus,
  WorkspaceConversationMessageFeedback,
  WorkspaceConversationListItem,
  WorkspaceConversationShare,
  WorkspaceConversationMessage,
  WorkspacePendingActionRespondRequest,
  WorkspaceHitlStep,
  WorkspaceMessageFeedbackRating,
  WorkspacePreferences,
  WorkspacePreferencesUpdateRequest,
  WorkspaceRun,
  WorkspaceRunFailure,
  WorkspaceRunStatus,
  WorkspaceRunSummary,
  WorkspaceRunTimelineEvent,
  WorkspaceRunTimelineEventType,
  WorkspaceRunTrigger,
  WorkspaceRunType,
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
  parseWorkspaceRunFailure,
} from './workspace-run-failure.js';
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

type WorkspaceLaunchFailure = {
  ok: false;
  statusCode: 404 | 409;
  code: 'WORKSPACE_NOT_FOUND' | 'WORKSPACE_LAUNCH_BLOCKED';
  message: string;
  details?: unknown;
};

type WorkspaceLookupFailure = {
  ok: false;
  statusCode: 404;
  code: 'WORKSPACE_NOT_FOUND';
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
  | WorkspaceLookupFailure;

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

type WorkspaceConversationShareCreateInput = {
  conversationId: string;
  groupId: string;
};

type WorkspaceConversationShareRevokeInput = {
  conversationId: string;
  shareId: string;
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
  createConversationShareForUser(
    user: AuthUser,
    input: WorkspaceConversationShareCreateInput
  ): WorkspaceConversationShareResult | Promise<WorkspaceConversationShareResult>;
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

type WorkspaceConversationShareRecord = {
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

function readPendingActionsFromOutputs(outputs: Record<string, unknown>): WorkspaceHitlStep[] {
  return parseWorkspaceHitlSteps(outputs.pendingActions);
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
    inputs: {},
    outputs: {},
    artifacts: [],
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
    for (const artifactId of artifactIdsByRunId.get(run.id) ?? []) {
      artifactsById.delete(artifactId);
    }

    const nextArtifactIds = run.artifacts.map((artifact, index) => {
      const record = createWorkspaceArtifactRecord({
        artifact,
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
      access: 'read_only',
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

      if (input.title !== undefined) {
        conversation.title = input.title;
      }

      if (input.status !== undefined) {
        conversation.status = input.status;
      }

      if (input.pinned !== undefined) {
        conversation.pinned = input.pinned;
      }

      conversation.updatedAt = new Date().toISOString();

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

      run.outputs = {
        ...run.outputs,
        pendingActions: items,
      };
      conversation.updatedAt = respondedAt;

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
        existingShare.revokedAt = null;

        return {
          ok: true,
          data: toWorkspaceConversationShare(existingShare),
        };
      }

      const share: WorkspaceConversationShareRecord = {
        id: `share_${randomUUID()}`,
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
        run.artifacts = buildArtifactsFromOutputs(run.outputs);
        appendTimelineEvent(run, 'output_recorded', {
          keys: Object.keys(input.outputs),
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
      syncRunArtifacts(run, user.id);
      run.usage = buildUsageFromOutputs(run);

      if (input.messageHistory) {
        conversation.messages = input.messageHistory;
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
