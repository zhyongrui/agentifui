import type { AdminErrorResponse } from '@agentifui/shared/admin';
import type {
  KnowledgeIngestionStatus,
  KnowledgeSourceCreateRequest,
  KnowledgeSourceCreateResponse,
  KnowledgeSourceListFilters,
  KnowledgeSourceListResponse,
  KnowledgeSourceKind,
  KnowledgeSourceScope,
  KnowledgeSourceStatusUpdateRequest,
  KnowledgeSourceStatusUpdateResponse,
} from '@agentifui/shared';
import type { FastifyInstance } from 'fastify';

import type { AdminService } from '../services/admin-service.js';
import type { AuditService } from '../services/audit-service.js';
import type { AuthService } from '../services/auth-service.js';
import type { KnowledgeService } from '../services/knowledge-service.js';

function buildErrorResponse(
  code: AdminErrorResponse['error']['code'],
  message: string,
  details?: unknown
): AdminErrorResponse {
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

function readQueryString(value: unknown) {
  if (Array.isArray(value)) {
    return readQueryString(value[0]);
  }

  return typeof value === 'string' ? value.trim() : '';
}

function isKnowledgeStatus(value: unknown): value is KnowledgeIngestionStatus {
  return value === 'queued' || value === 'processing' || value === 'succeeded' || value === 'failed';
}

function isKnowledgeSourceKind(value: unknown): value is KnowledgeSourceKind {
  return value === 'url' || value === 'markdown' || value === 'file';
}

function isKnowledgeSourceScope(value: unknown): value is KnowledgeSourceScope {
  return value === 'tenant' || value === 'group';
}

async function requireAdminSession(
  authService: AuthService,
  adminService: AdminService,
  authorization: string | undefined,
) {
  const sessionToken = readBearerToken(authorization);

  if (!sessionToken) {
    return {
      ok: false as const,
      statusCode: 401 as const,
      response: buildErrorResponse('ADMIN_UNAUTHORIZED', 'Admin access requires a bearer session.'),
    };
  }

  const user = await authService.getUserBySessionToken(sessionToken);

  if (!user) {
    return {
      ok: false as const,
      statusCode: 401 as const,
      response: buildErrorResponse('ADMIN_UNAUTHORIZED', 'The admin session is invalid or expired.'),
    };
  }

  if (!(await adminService.canReadAdminForUser(user))) {
    return {
      ok: false as const,
      statusCode: 403 as const,
      response: buildErrorResponse('ADMIN_FORBIDDEN', 'This user cannot access admin knowledge sources.'),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export async function registerAdminSourceRoutes(
  app: FastifyInstance,
  authService: AuthService,
  adminService: AdminService,
  knowledgeService: KnowledgeService,
  auditService: AuditService,
) {
  app.get('/admin/sources', async (request, reply): Promise<KnowledgeSourceListResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const query = (request.query ?? {}) as Record<string, unknown>;
    const status = readQueryString(query.status);
    const scope = readQueryString(query.scope);
    const filters: KnowledgeSourceListFilters = {
      status: status && isKnowledgeStatus(status) ? status : undefined,
      scope: scope && isKnowledgeSourceScope(scope) ? scope : undefined,
      groupId: readQueryString(query.groupId) || undefined,
      q: readQueryString(query.q) || undefined,
    };
    const result = await knowledgeService.listSourcesForUser(session.user, filters);

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: 'admin.workspace.read',
      entityType: 'session',
      entityId: session.user.id,
      ipAddress: request.ip,
      payload: {
        resource: '/admin/sources',
        filters,
        resultCount: result.sources.length,
      },
    });

    return {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        filters: result.filters,
        statusCounts: result.statusCounts,
        sources: result.sources,
      },
    };
  });

  app.post('/admin/sources', async (request, reply): Promise<KnowledgeSourceCreateResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const body = (request.body ?? {}) as Partial<KnowledgeSourceCreateRequest>;

    if (!isKnowledgeSourceKind(body.sourceKind) || !isKnowledgeSourceScope(body.scope)) {
      reply.code(400);
      return buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Knowledge source creation requires a valid sourceKind and scope.',
      );
    }

    const result = await knowledgeService.createSourceForUser(session.user, {
      title: body.title ?? '',
      sourceKind: body.sourceKind,
      sourceUri: typeof body.sourceUri === 'string' ? body.sourceUri : null,
      scope: body.scope,
      groupId: typeof body.groupId === 'string' ? body.groupId : null,
      labels: Array.isArray(body.labels)
        ? body.labels.filter((value: unknown): value is string => typeof value === 'string')
        : [],
      updatedSourceAt: typeof body.updatedSourceAt === 'string' ? body.updatedSourceAt : null,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: 'knowledge.source.created',
      entityType: 'knowledge_source',
      entityId: result.data.id,
      ipAddress: request.ip,
      payload: {
        scope: result.data.scope,
        groupId: result.data.groupId,
        sourceKind: result.data.sourceKind,
        sourceUri: result.data.sourceUri,
        labels: result.data.labels,
      },
    });

    return {
      ok: true,
      data: result.data,
    };
  });

  app.put(
    '/admin/sources/:sourceId/status',
    async (request, reply): Promise<KnowledgeSourceStatusUpdateResponse | AdminErrorResponse> => {
      const session = await requireAdminSession(authService, adminService, request.headers.authorization);

      if (!session.ok) {
        reply.code(session.statusCode);
        return session.response;
      }

      const sourceId = request.params && typeof request.params === 'object'
        ? Reflect.get(request.params, 'sourceId')
        : null;
      const body = (request.body ?? {}) as Partial<KnowledgeSourceStatusUpdateRequest>;

      if (typeof sourceId !== 'string' || !isKnowledgeStatus(body.status)) {
        reply.code(400);
        return buildErrorResponse(
          'ADMIN_INVALID_PAYLOAD',
          'Knowledge source status updates require a source id and a valid status.',
        );
      }

      const result = await knowledgeService.updateSourceStatusForUser(session.user, sourceId, {
        status: body.status,
        chunkCount: typeof body.chunkCount === 'number' ? body.chunkCount : null,
        lastError: typeof body.lastError === 'string' ? body.lastError : null,
      });

      if (!result.ok) {
        reply.code(result.statusCode);
        return buildErrorResponse(result.code, result.message, result.details);
      }

      await auditService.recordEvent({
        tenantId: session.user.tenantId,
        actorUserId: session.user.id,
        action: 'knowledge.source.status_updated',
        entityType: 'knowledge_source',
        entityId: result.data.id,
        ipAddress: request.ip,
        payload: {
          status: result.data.status,
          chunkCount: result.data.chunkCount,
          lastError: result.data.lastError,
        },
      });

      return {
        ok: true,
        data: result.data,
      };
    },
  );
}
