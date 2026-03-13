import {
  WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES,
  WORKSPACE_ATTACHMENT_MAX_BYTES,
} from '@agentifui/shared/apps';
import type {
  WorkspaceAppLaunchRequest,
  WorkspaceAppLaunchResponse,
  WorkspaceCatalogResponse,
  WorkspaceConversationResponse,
  WorkspaceConversationUploadRequest,
  WorkspaceConversationUploadResponse,
  WorkspaceConversationRunsResponse,
  WorkspaceErrorResponse,
  WorkspacePreferencesResponse,
  WorkspacePreferencesUpdateRequest,
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
}
