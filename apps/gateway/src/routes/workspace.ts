import {
  WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES,
  WORKSPACE_ATTACHMENT_MAX_BYTES,
} from '@agentifui/shared/apps';
import type {
  WorkspaceArtifact,
  WorkspaceArtifactResponse,
  WorkspaceAppLaunchRequest,
  WorkspaceAppLaunchResponse,
  WorkspaceCatalogResponse,
  WorkspaceConversationListAttachmentFilter,
  WorkspaceConversationListFeedbackFilter,
  WorkspaceConversationListResponse,
  WorkspaceConversationListStatusFilter,
  WorkspaceCommentCreateRequest,
  WorkspaceCommentCreateResponse,
  WorkspaceCommentMention,
  WorkspaceConversationMessageFeedbackRequest,
  WorkspaceConversationPresenceResponse,
  WorkspaceConversationPresenceUpdateRequest,
  WorkspaceConversationMessageFeedbackResponse,
  WorkspaceConversationResponse,
  WorkspaceConversationShareAccess,
  WorkspaceConversationStatus,
  WorkspaceConversationShareCreateRequest,
  WorkspaceConversationShareResponse,
  WorkspaceConversationSharesResponse,
  WorkspaceConversationUploadRequest,
  WorkspaceConversationUploadResponse,
  WorkspaceConversationUpdateRequest,
  WorkspaceConversationUpdateResponse,
  WorkspacePendingActionRespondRequest,
  WorkspacePendingActionRespondResponse,
  WorkspacePendingActionsResponse,
  WorkspaceConversationRunsResponse,
  WorkspaceErrorResponse,
  WorkspacePreferencesResponse,
  WorkspacePreferencesUpdateRequest,
  WorkspaceNotificationReadResponse,
  WorkspaceNotificationsResponse,
  WorkspaceSharedConversationResponse,
  WorkspaceRunResponse,
} from '@agentifui/shared/apps';
import type { AuthUser } from '@agentifui/shared/auth';
import type { FastifyInstance } from 'fastify';

import type { AuditService } from '../services/audit-service.js';
import type { AuthService } from '../services/auth-service.js';
import type { WorkspaceRuntimeService } from '../services/workspace-runtime.js';
import {
  dedupeWorkspaceCommentMentions,
  extractWorkspaceCommentMentionEmails,
} from '../services/workspace-comments.js';
import { readWorkspaceToolApprovalMetadata } from '../services/workspace-tool-approval.js';
import type { WorkspaceService } from '../services/workspace-service.js';

function buildErrorResponse(
  code: WorkspaceErrorResponse['error']['code'],
  message: string,
  details?: unknown
): WorkspaceErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}

function readBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string');
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isWorkspaceCommentCreateRequest(
  value: unknown
): value is WorkspaceCommentCreateRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const request = value as Record<string, unknown>;

  return (
    (request.targetType === 'message' ||
      request.targetType === 'run' ||
      request.targetType === 'artifact') &&
    typeof request.targetId === 'string' &&
    typeof request.content === 'string'
  );
}

async function resolveWorkspaceCommentMentions(input: {
  authService: AuthService;
  workspaceService: WorkspaceService;
  actorUser: AuthUser;
  conversationId: string;
  content: string;
}): Promise<WorkspaceCommentMention[]> {
  const mentionEmails = extractWorkspaceCommentMentionEmails(input.content);

  if (mentionEmails.length === 0) {
    return [];
  }

  const mentions: WorkspaceCommentMention[] = [];

  for (const email of mentionEmails) {
    const mentionedUser = await input.authService.getUserByEmail(email);

    if (
      !mentionedUser ||
      mentionedUser.tenantId !== input.actorUser.tenantId ||
      mentionedUser.id === input.actorUser.id
    ) {
      continue;
    }

    const hasAccess =
      await input.workspaceService.canUserAccessConversationForCollaboration(
        mentionedUser,
        input.conversationId
      );

    if (!hasAccess) {
      continue;
    }

    mentions.push({
      userId: mentionedUser.id,
      email: mentionedUser.email,
      displayName: mentionedUser.displayName ?? null,
    });
  }

  return dedupeWorkspaceCommentMentions(mentions);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(entry => typeof entry === 'string');
}

function isPendingActionRespondRequest(
  value: unknown
): value is WorkspacePendingActionRespondRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const request = value as Record<string, unknown>;

  if (
    request.action === 'approve' ||
    request.action === 'reject' ||
    request.action === 'cancel'
  ) {
    return request.note === undefined || isNullableString(request.note);
  }

  if (request.action === 'submit') {
    return (
      (request.note === undefined || isNullableString(request.note)) &&
      isStringRecord(request.values)
    );
  }

  return false;
}

function isMessageFeedbackRating(value: unknown): value is 'positive' | 'negative' | null {
  return value === null || value === 'positive' || value === 'negative';
}

function isConversationPresenceUpdateRequest(
  value: unknown
): value is WorkspaceConversationPresenceUpdateRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const request = value as Record<string, unknown>;

  return (
    typeof request.sessionId === 'string' &&
    request.sessionId.trim().length > 0 &&
    (request.activeRunId === undefined || isNullableString(request.activeRunId)) &&
    (request.surface === undefined ||
      request.surface === 'conversation' ||
      request.surface === 'shared_conversation') &&
    (request.state === undefined ||
      request.state === 'active' ||
      request.state === 'idle')
  );
}

function isConversationStatus(value: unknown): value is WorkspaceConversationStatus {
  return value === 'active' || value === 'archived' || value === 'deleted';
}

function isConversationShareAccess(value: unknown): value is WorkspaceConversationShareAccess {
  return value === 'read_only' || value === 'commenter' || value === 'editor';
}

function isConversationListStatusFilter(
  value: unknown,
): value is WorkspaceConversationListStatusFilter {
  return value === 'active' || value === 'archived';
}

function isConversationListAttachmentFilter(
  value: unknown,
): value is WorkspaceConversationListAttachmentFilter {
  return value === 'with_attachments';
}

function isConversationListFeedbackFilter(
  value: unknown,
): value is WorkspaceConversationListFeedbackFilter {
  return value === 'any' || value === 'positive' || value === 'negative';
}

function readSingleQueryValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim();

    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return readSingleQueryValue(value[0]);
  }

  return null;
}

function decodeBase64Payload(value: string): Buffer | null {
  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    return null;
  }

  try {
    return Buffer.from(normalized, 'base64');
  } catch {
    return null;
  }
}

function sanitizeArtifactFileName(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-');
  const collapsed = normalized.replace(/^-+|-+$/g, '');

  return collapsed.length > 0 ? collapsed : fallback;
}

function escapeCsvCell(value: string | number | boolean | null): string {
  if (value === null) {
    return '';
  }

  const cell = String(value);

  if (/[",\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }

  return cell;
}

function toCsvTableArtifact(artifact: Extract<WorkspaceArtifact, { kind: 'table' }>): string {
  const lines = [
    artifact.columns.map(column => escapeCsvCell(column)).join(','),
    ...artifact.rows.map(row => row.map(cell => escapeCsvCell(cell)).join(',')),
  ];

  return `${lines.join('\n')}\n`;
}

function buildArtifactDownloadPayload(artifact: WorkspaceArtifact): {
  body: string;
  contentType: string;
  fileName: string;
} {
  const baseName = sanitizeArtifactFileName(artifact.title, artifact.id);

  if (artifact.kind === 'markdown') {
    return {
      body: artifact.content,
      contentType: artifact.mimeType ?? 'text/markdown; charset=utf-8',
      fileName: `${baseName}.md`,
    };
  }

  if (artifact.kind === 'text') {
    return {
      body: artifact.content,
      contentType: artifact.mimeType ?? 'text/plain; charset=utf-8',
      fileName: `${baseName}.txt`,
    };
  }

  if (artifact.kind === 'json') {
    return {
      body: `${JSON.stringify(artifact.content, null, 2)}\n`,
      contentType: artifact.mimeType ?? 'application/json; charset=utf-8',
      fileName: `${baseName}.json`,
    };
  }

  if (artifact.kind === 'table') {
    return {
      body: toCsvTableArtifact(artifact),
      contentType: 'text/csv; charset=utf-8',
      fileName: `${baseName}.csv`,
    };
  }

  if (artifact.kind === 'link') {
    return {
      body: `${artifact.label}\n${artifact.href}\n`,
      contentType: 'text/plain; charset=utf-8',
      fileName: `${baseName}.txt`,
    };
  }

  return {
    body: artifact.content,
    contentType: artifact.mimeType ?? 'text/plain; charset=utf-8',
    fileName: `${baseName}.txt`,
  };
}

async function recordArtifactAccessAudit(input: {
  accessScope: 'owner' | 'shared_read_only' | 'shared_commenter' | 'shared_editor';
  artifact: WorkspaceArtifact;
  auditService: AuditService;
  ipAddress: string;
  shareId?: string;
  user: AuthUser;
  verb: 'downloaded' | 'viewed';
}) {
  await input.auditService.recordEvent({
    tenantId: input.user.tenantId,
    actorUserId: input.user.id,
    action:
      input.verb === 'downloaded'
        ? 'workspace.artifact.downloaded'
        : 'workspace.artifact.viewed',
    entityType: 'artifact',
    entityId: input.artifact.id,
    ipAddress: input.ipAddress,
    payload: {
      accessScope: input.accessScope,
      artifactId: input.artifact.id,
      title: input.artifact.title,
      kind: input.artifact.kind,
      source: input.artifact.source,
      status: input.artifact.status,
      mimeType: input.artifact.mimeType,
      sizeBytes: input.artifact.sizeBytes,
      shareId: input.shareId ?? null,
    },
  });
}

function toSharedAccessScope(
  access: WorkspaceConversationShareAccess,
): 'shared_read_only' | 'shared_commenter' | 'shared_editor' {
  if (access === 'commenter') {
    return 'shared_commenter';
  }

  if (access === 'editor') {
    return 'shared_editor';
  }

  return 'shared_read_only';
}

async function requireActiveWorkspaceSession(
  authService: AuthService,
  authorization: string | undefined
): Promise<
  | {
      ok: true;
      user: AuthUser;
    }
  | {
      ok: false;
      statusCode: 401 | 403;
      response: WorkspaceErrorResponse;
    }
> {
  const sessionToken = readBearerToken(authorization);

  if (!sessionToken) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse(
        'WORKSPACE_UNAUTHORIZED',
        'A valid session token is required to access the workspace.'
      ),
    };
  }

  const user = await authService.getUserBySessionToken(sessionToken);

  if (!user) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse(
        'WORKSPACE_UNAUTHORIZED',
        'The current workspace session is missing or has expired.'
      ),
    };
  }

  if (user.status !== 'active') {
    return {
      ok: false,
      statusCode: 403,
      response: buildErrorResponse(
        'WORKSPACE_FORBIDDEN',
        'Only active users can enter the apps workspace.',
        {
          status: user.status,
        }
      ),
    };
  }

  return {
    ok: true,
    user,
  };
}

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  authService: AuthService,
  workspaceService: WorkspaceService,
  auditService: AuditService,
  runtimeService: WorkspaceRuntimeService
) {
  function readRuntimeDegradedError() {
    const snapshot = runtimeService.getHealthSnapshot();

    if (snapshot.overallStatus !== 'degraded') {
      return null;
    }

    return buildErrorResponse(
      'WORKSPACE_FORBIDDEN',
      'Workspace runtime is currently degraded. Conversation history remains readable, but new uploads and pending-action responses are temporarily disabled until the runtime recovers.',
      {
        reason: 'runtime_degraded',
        runtime: snapshot,
      }
    );
  }

  app.get('/workspace/apps', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const response: WorkspaceCatalogResponse = {
      ok: true,
      data: await workspaceService.getCatalogForUser(access.user),
    };

    return response;
  });

  app.get('/workspace/preferences', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const response: WorkspacePreferencesResponse = {
      ok: true,
      data: await workspaceService.getPreferencesForUser(access.user),
    };

    return response;
  });

  app.put('/workspace/preferences', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const body = (request.body ?? {}) as Partial<WorkspacePreferencesUpdateRequest>;

    if (
      !isStringArray(body.favoriteAppIds) ||
      !isStringArray(body.recentAppIds) ||
      !isNullableString(body.defaultActiveGroupId)
    ) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace preferences require favorite/recent app id arrays and a nullable default active group id.'
      );
    }

    const response: WorkspacePreferencesResponse = {
      ok: true,
      data: await workspaceService.updatePreferencesForUser(access.user, {
        favoriteAppIds: body.favoriteAppIds,
        recentAppIds: body.recentAppIds,
        defaultActiveGroupId: body.defaultActiveGroupId,
      }),
    };

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: 'workspace.preferences.updated',
      entityType: 'user',
      entityId: access.user.id,
      ipAddress: request.ip,
      payload: {
        favoriteAppIds: response.data.favoriteAppIds,
        recentAppIds: response.data.recentAppIds,
        defaultActiveGroupId: response.data.defaultActiveGroupId,
        updatedAt: response.data.updatedAt,
      },
    });

    return response;
  });

  app.post('/workspace/apps/launch', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const body = (request.body ?? {}) as Partial<WorkspaceAppLaunchRequest>;
    const appId = body.appId?.trim();
    const activeGroupId = body.activeGroupId?.trim();

    if (!appId || !activeGroupId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace app launch requires an app id and active group id.'
      );
    }

    const result = await workspaceService.launchAppForUser(access.user, {
      appId,
      activeGroupId,
    });

    if (!result.ok) {
      const quotaReason =
        typeof result.details === 'object' && result.details !== null
          ? (result.details as Record<string, unknown>).reason
          : null;

      if (quotaReason === 'quota_exceeded' || quotaReason === 'quota_service_degraded') {
        await auditService.recordEvent({
          tenantId: access.user.tenantId,
          actorUserId: access.user.id,
          action: 'workspace.quota.launch_blocked',
          level: quotaReason === 'quota_exceeded' ? 'warning' : 'critical',
          entityType: 'workspace_app',
          entityId: appId,
          ipAddress: request.ip,
          payload: {
            appId,
            activeGroupId,
            reason: quotaReason,
            details: result.details ?? null,
          },
        });
      }

      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceAppLaunchResponse = {
      ok: true,
      data: result.data,
    };

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: 'workspace.app.launched',
      entityType: result.data.runId ? 'run' : 'workspace_app',
      entityId: result.data.runId ?? result.data.app.id,
      ipAddress: request.ip,
      payload: {
        launchId: result.data.id,
        appId: result.data.app.id,
        appName: result.data.app.name,
        conversationId: result.data.conversationId,
        runId: result.data.runId,
        traceId: result.data.traceId,
        activeGroupId: result.data.attributedGroup.id,
        activeGroupName: result.data.attributedGroup.name,
      },
    });

    return response;
  });

  app.get('/workspace/conversations', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const query = (request.query ?? {}) as {
      attachment?: unknown;
      appId?: unknown;
      feedback?: unknown;
      groupId?: unknown;
      limit?: unknown;
      q?: unknown;
      status?: unknown;
      tag?: unknown;
    };
    const attachmentValue = readSingleQueryValue(query.attachment);
    const appId = readSingleQueryValue(query.appId);
    const feedbackValue = readSingleQueryValue(query.feedback);
    const groupId = readSingleQueryValue(query.groupId);
    const limitValue = readSingleQueryValue(query.limit);
    const searchQuery = readSingleQueryValue(query.q);
    const statusValue = readSingleQueryValue(query.status);
    const tag = readSingleQueryValue(query.tag);
    const limit = limitValue
      ? Number.parseInt(limitValue, 10)
      : undefined;
    const attachment =
      attachmentValue === null
        ? null
        : isConversationListAttachmentFilter(attachmentValue)
          ? attachmentValue
          : undefined;
    const feedback =
      feedbackValue === null
        ? null
        : isConversationListFeedbackFilter(feedbackValue)
          ? feedbackValue
          : undefined;
    const status =
      statusValue === null
        ? null
        : isConversationListStatusFilter(statusValue)
          ? statusValue
          : undefined;

    if (
      (limitValue && (!Number.isFinite(limit) || (limit ?? 0) <= 0)) ||
      (attachmentValue !== null && attachment === undefined) ||
      (feedbackValue !== null && feedback === undefined) ||
      (statusValue !== null && status === undefined)
    ) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace conversation history requires valid attachment, feedback, status, and numeric limit filters when provided.'
      );
    }

    const result = await workspaceService.listConversationsForUser(access.user, {
      attachment,
      appId,
      feedback,
      groupId,
      limit,
      query: searchQuery,
      status,
      tag,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationListResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.get('/workspace/conversations/:conversationId', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
    };
    const conversationId = params.conversationId?.trim();

    if (!conversationId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace conversation lookup requires a conversation id.'
      );
    }

    const result = await workspaceService.getConversationForUser(access.user, conversationId);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.get('/workspace/conversations/:conversationId/presence', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
    };
    const conversationId = params.conversationId?.trim();

    if (!conversationId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace presence lookup requires a conversation id.'
      );
    }

    const result = await workspaceService.getConversationPresenceForUser(
      access.user,
      conversationId
    );

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationPresenceResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.put('/workspace/conversations/:conversationId/presence', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
    };
    const conversationId = params.conversationId?.trim();
    const body = request.body;

    if (!conversationId || !isConversationPresenceUpdateRequest(body)) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace presence updates require a conversation id plus a valid session id and optional state changes.'
      );
    }

    const result = await workspaceService.updateConversationPresenceForUser(access.user, {
      conversationId,
      sessionId: body.sessionId.trim(),
      activeRunId:
        body.activeRunId === undefined ? undefined : body.activeRunId?.trim() || null,
      state: body.state,
      surface: body.surface,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationPresenceResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.put('/workspace/conversations/:conversationId', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
    };
    const conversationId = params.conversationId?.trim();
    const body = (request.body ?? {}) as Partial<WorkspaceConversationUpdateRequest>;
    const title =
      typeof body.title === 'string' ? body.title.trim() : undefined;
    const nextTitle = body.title === undefined ? undefined : title;
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt.trim() : undefined;
    const nextExpectedUpdatedAt =
      body.expectedUpdatedAt === undefined ? undefined : expectedUpdatedAt;
    const nextStatus =
      body.status === undefined
        ? undefined
        : isConversationStatus(body.status)
          ? body.status
          : null;
    const nextPinned =
      typeof body.pinned === 'boolean' ? body.pinned : body.pinned === undefined ? undefined : null;

    if (
      !conversationId ||
      (body.expectedUpdatedAt !== undefined && !nextExpectedUpdatedAt) ||
      nextStatus === null ||
      nextPinned === null ||
      (body.title !== undefined && !nextTitle)
    ) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace conversation updates require a conversation id plus valid title, status, or pinned changes.'
      );
    }

    if (
      nextTitle === undefined &&
      nextStatus === undefined &&
      nextPinned === undefined
    ) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace conversation updates require at least one title, status, or pinned change.'
      );
    }

    const result = await workspaceService.updateConversationForUser(access.user, {
      conversationId,
      expectedUpdatedAt: nextExpectedUpdatedAt,
      title: nextTitle,
      status: nextStatus ?? undefined,
      pinned: nextPinned ?? undefined,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationUpdateResponse = {
      ok: true,
      data: result.data,
    };

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: result.data.status === 'deleted'
        ? 'workspace.conversation.deleted'
        : 'workspace.conversation.updated',
      entityType: 'conversation',
      entityId: conversationId,
      ipAddress: request.ip,
      payload: {
        conversationId,
        title: result.data.title,
        status: result.data.status,
        pinned: result.data.pinned,
      },
    });

    return response;
  });

  app.get('/workspace/conversations/:conversationId/pending-actions', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
    };
    const conversationId = params.conversationId?.trim();

    if (!conversationId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace pending action lookup requires a conversation id.'
      );
    }

    const result = await workspaceService.listPendingActionsForUser(access.user, conversationId);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspacePendingActionsResponse = {
      ok: true,
      data: result.data,
    };

    for (const item of result.data.expiredItems ?? []) {
      await auditService.recordEvent({
        tenantId: access.user.tenantId,
        action: 'workspace.pending_action.expired',
        entityType: 'pending_action',
        entityId: item.id,
        ipAddress: request.ip,
        payload: {
          conversationId,
          runId: result.data.runId,
          stepId: item.id,
          kind: item.kind,
          status: item.status,
          expiresAt: item.expiresAt,
          observedByUserId: access.user.id,
        },
      });
    }

    return response;
  });

  app.post('/workspace/conversations/:conversationId/pending-actions/:stepId/respond', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
      stepId?: string;
    };
    const conversationId = params.conversationId?.trim();
    const stepId = params.stepId?.trim();
    const body = request.body ?? {};

    if (!conversationId || !stepId || !isPendingActionRespondRequest(body)) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace pending action responses require a conversation id, step id and a valid approve/reject/submit/cancel payload.'
      );
    }

    const runtimeDegradedError = readRuntimeDegradedError();

    if (runtimeDegradedError) {
      reply.code(403);
      return runtimeDegradedError;
    }

    const result = await workspaceService.respondToPendingActionForUser(access.user, {
      conversationId,
      stepId,
      request: body,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspacePendingActionRespondResponse = {
      ok: true,
      data: result.data,
    };

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action:
        body.action === 'cancel'
          ? 'workspace.pending_action.cancelled'
          : 'workspace.pending_action.responded',
      entityType: 'pending_action',
      entityId: stepId,
      ipAddress: request.ip,
      payload: {
        conversationId,
        runId: result.data.runId,
        stepId,
        kind: result.data.item.kind,
        action: body.action,
        status: result.data.item.status,
        note: body.note ?? null,
        values: body.action === 'submit' ? body.values : null,
      },
    });

    const toolApprovalMetadata = readWorkspaceToolApprovalMetadata(result.data.item);

    if (toolApprovalMetadata) {
      const runResult = await workspaceService.getRunForUser(
        access.user,
        result.data.runId,
      );
      const runContext = runResult.ok ? runResult.data : null;
      const toolExecution =
        runContext?.toolExecutions
          .filter(
            (execution) =>
              execution.request.id === toolApprovalMetadata.toolCallId &&
              execution.request.function.name === toolApprovalMetadata.toolName,
          )
          .at(-1) ?? null;

      await auditService.recordEvent({
        tenantId: access.user.tenantId,
        actorUserId: access.user.id,
        action: 'workspace.tool_execution.approval_decided',
        entityType: 'pending_action',
        entityId: stepId,
        ipAddress: request.ip,
        level: body.action === 'approve' ? 'info' : 'warning',
        payload: {
          conversationId,
          runId: result.data.runId,
          stepId,
          toolCallId: toolApprovalMetadata.toolCallId,
          toolName: toolApprovalMetadata.toolName,
          policyTag: toolApprovalMetadata.policyTag,
          decisionAction: body.action,
          decisionStatus: result.data.item.status,
          failure: toolExecution?.failure ?? null,
          traceId: runContext?.traceId ?? null,
          appId: runContext?.app.id ?? null,
          appName: runContext?.app.name ?? null,
          activeGroupId: runContext?.activeGroup.id ?? null,
          activeGroupName: runContext?.activeGroup.name ?? null,
        },
      });

      await auditService.recordEvent({
        tenantId: access.user.tenantId,
        actorUserId: access.user.id,
        action:
          body.action === 'approve'
            ? 'workspace.tool_execution.completed'
            : 'workspace.tool_execution.blocked',
        entityType: 'run',
        entityId: result.data.runId,
        ipAddress: request.ip,
        level: body.action === 'approve' ? 'info' : 'warning',
        payload: {
          conversationId,
          runId: result.data.runId,
          stepId,
          toolCallId: toolApprovalMetadata.toolCallId,
          toolName: toolApprovalMetadata.toolName,
          policyTag: toolApprovalMetadata.policyTag,
          decisionAction: body.action,
          decisionStatus: result.data.item.status,
          failure: toolExecution?.failure ?? null,
          traceId: runContext?.traceId ?? null,
          appId: runContext?.app.id ?? null,
          appName: runContext?.app.name ?? null,
          activeGroupId: runContext?.activeGroup.id ?? null,
          activeGroupName: runContext?.activeGroup.name ?? null,
        },
      });
    }

    return response;
  });

  app.put('/workspace/conversations/:conversationId/messages/:messageId/feedback', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
      messageId?: string;
    };
    const conversationId = params.conversationId?.trim();
    const messageId = params.messageId?.trim();
    const body = (request.body ?? {}) as Partial<WorkspaceConversationMessageFeedbackRequest>;

    if (!conversationId || !messageId || !isMessageFeedbackRating(body.rating)) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace message feedback requires a conversation id, message id and nullable positive/negative rating.'
      );
    }

    const result = await workspaceService.updateMessageFeedbackForUser(access.user, {
      conversationId,
      messageId,
      rating: body.rating,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationMessageFeedbackResponse = {
      ok: true,
      data: result.data,
    };

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: 'workspace.message.feedback.updated',
      entityType: 'conversation_message',
      entityId: messageId,
      ipAddress: request.ip,
      payload: {
        conversationId,
        messageId,
        rating: body.rating,
      },
    });

    return response;
  });

  app.post('/workspace/conversations/:conversationId/comments', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
    };
    const conversationId = params.conversationId?.trim();
    const body = request.body;

    if (!conversationId || !isWorkspaceCommentCreateRequest(body)) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace comments require a conversation id plus a valid message/run/artifact target and non-empty content.'
      );
    }

    const mentions = await resolveWorkspaceCommentMentions({
      authService,
      workspaceService,
      actorUser: access.user,
      conversationId,
      content: body.content,
    });

    const result = await workspaceService.createCommentForUser(access.user, {
      conversationId,
      request: body,
      mentions,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceCommentCreateResponse = {
      ok: true,
      data: result.data,
    };

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: 'workspace.comment.created',
      entityType: 'conversation_comment',
      entityId: result.data.comment.id,
      ipAddress: request.ip,
      payload: {
        conversationId,
        targetType: result.data.targetType,
        targetId: result.data.targetId,
        threadLength: result.data.thread.length,
        mentionCount: result.data.comment.mentions?.length ?? 0,
        mentionedUserIds:
          result.data.comment.mentions?.map((mention) => mention.userId) ?? [],
      },
    });

    return response;
  });

  app.get('/workspace/notifications', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const result = await workspaceService.listNotificationsForUser(access.user);

    const response: WorkspaceNotificationsResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.put('/workspace/notifications/:notificationId/read', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      notificationId?: string;
    };
    const notificationId = params.notificationId?.trim();

    if (!notificationId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace notification updates require a notification id.'
      );
    }

    const result = await workspaceService.markNotificationReadForUser(
      access.user,
      notificationId
    );

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceNotificationReadResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.post('/workspace/conversations/:conversationId/uploads', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
    };
    const conversationId = params.conversationId?.trim();
    const body = (request.body ?? {}) as Partial<WorkspaceConversationUploadRequest>;
    const fileName = body.fileName?.trim();
    const contentType = body.contentType?.trim().toLowerCase();
    const base64Data = body.base64Data?.trim();

    if (!conversationId || !fileName || !contentType || !base64Data) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace uploads require a conversation id, file name, content type, and base64 payload.'
      );
    }

    const bytes = decodeBase64Payload(base64Data);

    if (!bytes || bytes.byteLength === 0) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace uploads require a valid non-empty base64 payload.'
      );
    }

    if (
      !(WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES as readonly string[]).includes(contentType)
    ) {
      reply.code(409);
      return buildErrorResponse(
        'WORKSPACE_UPLOAD_BLOCKED',
        'The uploaded file type is not allowed in the current workspace.',
        {
          acceptedContentTypes: WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES,
          contentType,
        }
      );
    }

    if (bytes.byteLength > WORKSPACE_ATTACHMENT_MAX_BYTES) {
      reply.code(409);
      return buildErrorResponse(
        'WORKSPACE_UPLOAD_BLOCKED',
        'The uploaded file exceeds the current workspace attachment limit.',
        {
          maxBytes: WORKSPACE_ATTACHMENT_MAX_BYTES,
          sizeBytes: bytes.byteLength,
        }
      );
    }

    const runtimeDegradedError = readRuntimeDegradedError();

    if (runtimeDegradedError) {
      reply.code(403);
      return runtimeDegradedError;
    }

    const result = await workspaceService.uploadConversationFileForUser(access.user, {
      conversationId,
      fileName,
      contentType,
      bytes,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationUploadResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.get('/workspace/conversations/:conversationId/shares', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
    };
    const conversationId = params.conversationId?.trim();

    if (!conversationId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace share lookup requires a conversation id.'
      );
    }

    const result = await workspaceService.listConversationSharesForUser(access.user, conversationId);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationSharesResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.post('/workspace/conversations/:conversationId/shares', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
    };
    const conversationId = params.conversationId?.trim();
    const body = (request.body ?? {}) as Partial<WorkspaceConversationShareCreateRequest>;
    const groupId = body.groupId?.trim();
    const shareAccess =
      body.access === undefined
        ? 'read_only'
        : isConversationShareAccess(body.access)
          ? body.access
          : null;

    if (!conversationId || !groupId || shareAccess === null) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace share creation requires a conversation id, group id, and valid access mode.'
      );
    }

    const result = await workspaceService.createConversationShareForUser(access.user, {
      conversationId,
      groupId,
      access: shareAccess,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationShareResponse = {
      ok: true,
      data: result.data,
    };

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: 'workspace.conversation_share.created',
      entityType: 'conversation_share',
      entityId: result.data.id,
      ipAddress: request.ip,
      payload: {
        shareId: result.data.id,
        conversationId: result.data.conversationId,
        groupId: result.data.group.id,
        groupName: result.data.group.name,
        access: result.data.access,
        shareUrl: result.data.shareUrl,
      },
    });

    return response;
  });

  app.delete('/workspace/conversations/:conversationId/shares/:shareId', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
      shareId?: string;
    };
    const conversationId = params.conversationId?.trim();
    const shareId = params.shareId?.trim();

    if (!conversationId || !shareId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace share revoke requires a conversation id and share id.'
      );
    }

    const result = await workspaceService.revokeConversationShareForUser(access.user, {
      conversationId,
      shareId,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationShareResponse = {
      ok: true,
      data: result.data,
    };

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: 'workspace.conversation_share.revoked',
      entityType: 'conversation_share',
      entityId: result.data.id,
      ipAddress: request.ip,
      payload: {
        shareId: result.data.id,
        conversationId: result.data.conversationId,
        groupId: result.data.group.id,
        groupName: result.data.group.name,
      },
    });

    return response;
  });

  app.get('/workspace/conversations/:conversationId/runs', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      conversationId?: string;
    };
    const conversationId = params.conversationId?.trim();

    if (!conversationId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace run history lookup requires a conversation id.'
      );
    }

    const result = await workspaceService.listConversationRunsForUser(access.user, conversationId);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationRunsResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.get('/workspace/runs/:runId', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      runId?: string;
    };
    const runId = params.runId?.trim();

    if (!runId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace run lookup requires a run id.'
      );
    }

    const result = await workspaceService.getRunForUser(access.user, runId);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceRunResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.get('/workspace/artifacts/:artifactId', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      artifactId?: string;
    };
    const artifactId = params.artifactId?.trim();

    if (!artifactId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace artifact lookup requires an artifact id.'
      );
    }

    const result = await workspaceService.getArtifactForUser(access.user, artifactId);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceArtifactResponse = {
      ok: true,
      data: result.data,
    };

    await recordArtifactAccessAudit({
      accessScope: 'owner',
      artifact: result.data,
      auditService,
      ipAddress: request.ip,
      user: access.user,
      verb: 'viewed',
    });

    return response;
  });

  app.get('/workspace/artifacts/:artifactId/download', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      artifactId?: string;
    };
    const artifactId = params.artifactId?.trim();

    if (!artifactId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace artifact download requires an artifact id.'
      );
    }

    const result = await workspaceService.getArtifactForUser(access.user, artifactId);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const download = buildArtifactDownloadPayload(result.data);

    reply.header('content-type', download.contentType);
    reply.header('content-disposition', `attachment; filename="${download.fileName}"`);
    reply.header('x-agentifui-artifact-filename', download.fileName);
    reply.header('x-agentifui-artifact-kind', result.data.kind);
    reply.header('x-agentifui-artifact-id', result.data.id);

    await recordArtifactAccessAudit({
      accessScope: 'owner',
      artifact: result.data,
      auditService,
      ipAddress: request.ip,
      user: access.user,
      verb: 'downloaded',
    });

    return reply.send(download.body);
  });

  app.get('/workspace/shares/:shareId', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      shareId?: string;
    };
    const shareId = params.shareId?.trim();

    if (!shareId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace shared conversation lookup requires a share id.'
      );
    }

    const result = await workspaceService.getSharedConversationForUser(access.user, shareId);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceSharedConversationResponse = {
      ok: true,
      data: result.data,
    };

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: 'workspace.conversation_share.accessed',
      entityType: 'conversation_share',
      entityId: result.data.share.id,
      ipAddress: request.ip,
      payload: {
        shareId: result.data.share.id,
        conversationId: result.data.share.conversationId,
        groupId: result.data.share.group.id,
        groupName: result.data.share.group.name,
      },
    });

    return response;
  });

  app.put('/workspace/shares/:shareId/conversation', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      shareId?: string;
    };
    const shareId = params.shareId?.trim();
    const body = (request.body ?? {}) as Partial<WorkspaceConversationUpdateRequest>;
    const title = typeof body.title === 'string' ? body.title.trim() : undefined;
    const nextTitle = body.title === undefined ? undefined : title;
    const expectedUpdatedAt =
      typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt.trim() : undefined;
    const nextExpectedUpdatedAt =
      body.expectedUpdatedAt === undefined ? undefined : expectedUpdatedAt;
    const nextStatus =
      body.status === undefined ? undefined : isConversationStatus(body.status) ? body.status : null;
    const nextPinned =
      typeof body.pinned === 'boolean' ? body.pinned : body.pinned === undefined ? undefined : null;

    if (
      !shareId ||
      (body.expectedUpdatedAt !== undefined && !nextExpectedUpdatedAt) ||
      nextStatus === null ||
      nextPinned === null ||
      (body.title !== undefined && !nextTitle)
    ) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace shared conversation updates require a share id plus valid title, status, or pinned changes.'
      );
    }

    if (nextTitle === undefined && nextStatus === undefined && nextPinned === undefined) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace shared conversation updates require at least one title, status, or pinned change.'
      );
    }

    const sharedConversation = await workspaceService.getSharedConversationForUser(access.user, shareId);

    if (!sharedConversation.ok) {
      reply.code(sharedConversation.statusCode);
      return buildErrorResponse(
        sharedConversation.code,
        sharedConversation.message,
        sharedConversation.details
      );
    }

    const result = await workspaceService.updateSharedConversationForUser(access.user, {
      shareId,
      expectedUpdatedAt: nextExpectedUpdatedAt,
      title: nextTitle,
      status: nextStatus ?? undefined,
      pinned: nextPinned ?? undefined,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationUpdateResponse = {
      ok: true,
      data: result.data,
    };

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: 'workspace.conversation.updated',
      entityType: 'conversation',
      entityId: result.data.id,
      ipAddress: request.ip,
      payload: {
        accessScope: 'shared_editor',
        conversationId: result.data.id,
        shareId,
        title: result.data.title,
        status: result.data.status,
        pinned: result.data.pinned,
        shareAccess: sharedConversation.data.share.access,
      },
    });

    return response;
  });

  app.get('/workspace/shares/:shareId/presence', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      shareId?: string;
    };
    const shareId = params.shareId?.trim();

    if (!shareId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace shared presence lookup requires a share id.'
      );
    }

    const result = await workspaceService.getSharedConversationPresenceForUser(
      access.user,
      shareId
    );

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationPresenceResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.put('/workspace/shares/:shareId/presence', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      shareId?: string;
    };
    const shareId = params.shareId?.trim();
    const body = request.body;

    if (!shareId || !isConversationPresenceUpdateRequest(body)) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace shared presence updates require a share id plus a valid session id and optional state changes.'
      );
    }

    const result = await workspaceService.updateSharedConversationPresenceForUser(access.user, {
      shareId,
      sessionId: body.sessionId.trim(),
      activeRunId:
        body.activeRunId === undefined ? undefined : body.activeRunId?.trim() || null,
      state: body.state,
      surface: body.surface ?? 'shared_conversation',
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceConversationPresenceResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.post('/workspace/shares/:shareId/comments', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      shareId?: string;
    };
    const shareId = params.shareId?.trim();
    const body = request.body;

    if (!shareId || !isWorkspaceCommentCreateRequest(body)) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace shared comments require a share id plus a valid message/run/artifact target and non-empty content.'
      );
    }

    const sharedConversation = await workspaceService.getSharedConversationForUser(access.user, shareId);

    if (!sharedConversation.ok) {
      reply.code(sharedConversation.statusCode);
      return buildErrorResponse(
        sharedConversation.code,
        sharedConversation.message,
        sharedConversation.details
      );
    }

    const mentions = await resolveWorkspaceCommentMentions({
      authService,
      workspaceService,
      actorUser: access.user,
      conversationId: sharedConversation.data.conversation.id,
      content: body.content,
    });

    const result = await workspaceService.createSharedCommentForUser(access.user, {
      shareId,
      request: body,
      mentions,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceCommentCreateResponse = {
      ok: true,
      data: result.data,
    };

    await auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: 'workspace.comment.created',
      entityType: 'conversation_comment',
      entityId: result.data.comment.id,
      ipAddress: request.ip,
      payload: {
        accessScope: toSharedAccessScope(sharedConversation.data.share.access),
        shareAccess: sharedConversation.data.share.access,
        shareId,
        conversationId: result.data.conversationId,
        targetType: result.data.targetType,
        targetId: result.data.targetId,
        threadLength: result.data.thread.length,
        mentionCount: result.data.comment.mentions?.length ?? 0,
        mentionedUserIds:
          result.data.comment.mentions?.map((mention) => mention.userId) ?? [],
      },
    });

    return response;
  });

  app.get('/workspace/shares/:shareId/artifacts/:artifactId', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      shareId?: string;
      artifactId?: string;
    };
    const shareId = params.shareId?.trim();
    const artifactId = params.artifactId?.trim();

    if (!shareId || !artifactId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace shared artifact lookup requires both a share id and artifact id.'
      );
    }

    const result = await workspaceService.getSharedArtifactForUser(access.user, {
      shareId,
      artifactId,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: WorkspaceArtifactResponse = {
      ok: true,
      data: result.data,
    };

    const sharedConversation = await workspaceService.getSharedConversationForUser(access.user, shareId);

    if (!sharedConversation.ok) {
      reply.code(sharedConversation.statusCode);
      return buildErrorResponse(
        sharedConversation.code,
        sharedConversation.message,
        sharedConversation.details
      );
    }

    await recordArtifactAccessAudit({
      accessScope: toSharedAccessScope(sharedConversation.data.share.access),
      artifact: result.data,
      auditService,
      ipAddress: request.ip,
      shareId,
      user: access.user,
      verb: 'viewed',
    });

    return response;
  });

  app.get('/workspace/shares/:shareId/artifacts/:artifactId/download', async (request, reply) => {
    const access = await requireActiveWorkspaceSession(authService, request.headers.authorization);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      shareId?: string;
      artifactId?: string;
    };
    const shareId = params.shareId?.trim();
    const artifactId = params.artifactId?.trim();

    if (!shareId || !artifactId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace shared artifact download requires both a share id and artifact id.'
      );
    }

    const result = await workspaceService.getSharedArtifactForUser(access.user, {
      shareId,
      artifactId,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const download = buildArtifactDownloadPayload(result.data);

    const sharedConversation = await workspaceService.getSharedConversationForUser(access.user, shareId);

    if (!sharedConversation.ok) {
      reply.code(sharedConversation.statusCode);
      return buildErrorResponse(
        sharedConversation.code,
        sharedConversation.message,
        sharedConversation.details
      );
    }

    reply.header('content-type', download.contentType);
    reply.header('content-disposition', `attachment; filename="${download.fileName}"`);
    reply.header('x-agentifui-artifact-filename', download.fileName);
    reply.header('x-agentifui-artifact-kind', result.data.kind);
    reply.header('x-agentifui-artifact-id', result.data.id);

    await recordArtifactAccessAudit({
      accessScope: toSharedAccessScope(sharedConversation.data.share.access),
      artifact: result.data,
      auditService,
      ipAddress: request.ip,
      shareId,
      user: access.user,
      verb: 'downloaded',
    });

    return reply.send(download.body);
  });
}
