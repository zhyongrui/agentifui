import {
  WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES,
  WORKSPACE_ATTACHMENT_MAX_BYTES,
} from '@agentifui/shared/apps';
import type {
  WorkspaceAppLaunchRequest,
  WorkspaceAppLaunchResponse,
  WorkspaceCatalogResponse,
  WorkspaceConversationListResponse,
  WorkspaceConversationMessageFeedbackRequest,
  WorkspaceConversationMessageFeedbackResponse,
  WorkspaceConversationResponse,
  WorkspaceConversationShareCreateRequest,
  WorkspaceConversationShareResponse,
  WorkspaceConversationSharesResponse,
  WorkspaceConversationUploadRequest,
  WorkspaceConversationUploadResponse,
  WorkspaceConversationRunsResponse,
  WorkspaceErrorResponse,
  WorkspacePreferencesResponse,
  WorkspacePreferencesUpdateRequest,
  WorkspaceSharedConversationResponse,
  WorkspaceRunResponse,
} from '@agentifui/shared/apps';
import type { AuthUser } from '@agentifui/shared/auth';
import type { FastifyInstance } from 'fastify';

import type { AuditService } from '../services/audit-service.js';
import type { AuthService } from '../services/auth-service.js';
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

function isMessageFeedbackRating(value: unknown): value is 'positive' | 'negative' | null {
  return value === null || value === 'positive' || value === 'negative';
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
  auditService: AuditService
) {
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
      appId?: unknown;
      groupId?: unknown;
      limit?: unknown;
      q?: unknown;
    };
    const appId = readSingleQueryValue(query.appId);
    const groupId = readSingleQueryValue(query.groupId);
    const limitValue = readSingleQueryValue(query.limit);
    const searchQuery = readSingleQueryValue(query.q);
    const limit = limitValue
      ? Number.parseInt(limitValue, 10)
      : undefined;

    if (limitValue && (!Number.isFinite(limit) || (limit ?? 0) <= 0)) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace conversation history requires a positive numeric limit when provided.'
      );
    }

    const result = await workspaceService.listConversationsForUser(access.user, {
      appId,
      groupId,
      limit,
      query: searchQuery,
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

    if (!conversationId || !groupId) {
      reply.code(400);
      return buildErrorResponse(
        'WORKSPACE_INVALID_PAYLOAD',
        'Workspace share creation requires a conversation id and group id.'
      );
    }

    const result = await workspaceService.createConversationShareForUser(access.user, {
      conversationId,
      groupId,
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
}
