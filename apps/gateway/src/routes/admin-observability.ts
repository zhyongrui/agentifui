import type {
  AdminErrorResponse,
  AdminObservabilityAnnotationCreateRequest,
  AdminObservabilityAnnotationCreateResponse,
  AdminObservabilityResponse,
} from '@agentifui/shared/admin';
import type { AuthUser } from '@agentifui/shared/auth';
import type { FastifyInstance } from 'fastify';

import type { AdminService } from '../services/admin-service.js';
import type { AdminObservabilityService } from '../services/admin-observability-service.js';
import type { AuditService } from '../services/audit-service.js';
import type { AuthService } from '../services/auth-service.js';

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

  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

async function requireAdminSession(
  authService: AuthService,
  adminService: AdminService,
  authorization: string | undefined
): Promise<
  | {
      ok: true;
      canReadPlatformAdmin: boolean;
      user: AuthUser;
    }
  | {
      ok: false;
      response: AdminErrorResponse;
      statusCode: 401 | 403;
    }
> {
  const sessionToken = readBearerToken(authorization);

  if (!sessionToken) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse('ADMIN_UNAUTHORIZED', 'Admin access requires a bearer session.'),
    };
  }

  const user = await authService.getUserBySessionToken(sessionToken);

  if (!user) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse('ADMIN_UNAUTHORIZED', 'The admin session is invalid or expired.'),
    };
  }

  if (!(await adminService.canReadAdminForUser(user))) {
    return {
      ok: false,
      statusCode: 403,
      response: buildErrorResponse('ADMIN_FORBIDDEN', 'This user cannot access observability controls.'),
    };
  }

  return {
    ok: true,
    user,
    canReadPlatformAdmin: await adminService.canReadPlatformAdminForUser(user),
  };
}

function resolveTenantId(user: AuthUser, canReadPlatformAdmin: boolean, tenantId: string | undefined) {
  const normalizedTenantId = tenantId?.trim();

  if (!normalizedTenantId) {
    return {
      ok: true as const,
      tenantId: user.tenantId,
    };
  }

  if (!canReadPlatformAdmin && normalizedTenantId !== user.tenantId) {
    return {
      ok: false as const,
      response: buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Tenant admins can only inspect observability data for their own tenant.'
      ),
    };
  }

  return {
    ok: true as const,
    tenantId: normalizedTenantId,
  };
}

export async function registerAdminObservabilityRoutes(
  app: FastifyInstance,
  authService: AuthService,
  adminService: AdminService,
  adminObservabilityService: AdminObservabilityService,
  auditService: AuditService
) {
  app.get('/admin/observability', async (request, reply): Promise<AdminObservabilityResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const tenantResult = resolveTenantId(
      session.user,
      session.canReadPlatformAdmin,
      ((request.query ?? {}) as { tenantId?: string }).tenantId
    );

    if (!tenantResult.ok) {
      reply.code(403);
      return tenantResult.response;
    }

    const data = await adminObservabilityService.getOverviewForUser(session.user, {
      tenantId: tenantResult.tenantId,
    });

    await auditService.recordEvent({
      tenantId: tenantResult.tenantId,
      actorUserId: session.user.id,
      action: 'admin.workspace.read',
      entityType: 'tenant',
      entityId: tenantResult.tenantId,
      ipAddress: request.ip,
      payload: {
        resource: '/admin/observability',
        tenantId: tenantResult.tenantId,
      },
    });

    return {
      ok: true,
      data,
    };
  });

  app.post(
    '/admin/observability/annotations',
    async (request, reply): Promise<AdminObservabilityAnnotationCreateResponse | AdminErrorResponse> => {
      const session = await requireAdminSession(authService, adminService, request.headers.authorization);

      if (!session.ok) {
        reply.code(session.statusCode);
        return session.response;
      }

      const body = (request.body ?? {}) as Partial<AdminObservabilityAnnotationCreateRequest>;
      const tenantResult = resolveTenantId(session.user, session.canReadPlatformAdmin, body.tenantId ?? undefined);

      if (!tenantResult.ok) {
        reply.code(403);
        return tenantResult.response;
      }

      if (typeof body.note !== 'string' || !body.note.trim()) {
        reply.code(400);
        return buildErrorResponse('ADMIN_INVALID_PAYLOAD', 'Observability annotations require a note.');
      }

      const annotation = await adminObservabilityService.createAnnotationForUser(session.user, {
        tenantId: tenantResult.tenantId,
        traceId: body.traceId ?? null,
        runId: body.runId ?? null,
        note: body.note,
      });

      await auditService.recordEvent({
        tenantId: tenantResult.tenantId,
        actorUserId: session.user.id,
        action: 'admin.observability.annotation.created',
        entityType: 'operator_annotation',
        entityId: annotation.id,
        ipAddress: request.ip,
        payload: {
          traceId: annotation.traceId,
          runId: annotation.runId,
          tenantId: annotation.tenantId,
        },
      });

      return {
        ok: true,
        data: {
          annotation,
        },
      };
    }
  );
}
