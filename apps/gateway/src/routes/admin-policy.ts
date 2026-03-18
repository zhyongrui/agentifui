import type {
  AdminErrorResponse,
  AdminPolicyExceptionCreateRequest,
  AdminPolicyExceptionCreateResponse,
  AdminPolicyExceptionReviewRequest,
  AdminPolicyExceptionReviewResponse,
  AdminPolicyOverviewResponse,
  AdminPolicySimulationRequest,
  AdminPolicySimulationResponse,
} from '@agentifui/shared/admin';
import type { AuthUser } from '@agentifui/shared/auth';
import type { FastifyInstance } from 'fastify';

import type { AdminService } from '../services/admin-service.js';
import type { AuditService } from '../services/audit-service.js';
import type { AuthService } from '../services/auth-service.js';
import type { PolicyService } from '../services/policy-service.js';

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

function isSimulationScope(value: unknown): value is AdminPolicySimulationRequest['scope'] {
  return (
    value === 'chat' ||
    value === 'retrieval' ||
    value === 'sharing' ||
    value === 'artifact_download' ||
    value === 'export'
  );
}

function isExceptionScope(value: unknown): value is AdminPolicyExceptionCreateRequest['scope'] {
  return value === 'tenant' || value === 'group' || value === 'app' || value === 'runtime';
}

function isDetector(value: unknown): value is AdminPolicyExceptionCreateRequest['detector'] {
  return (
    value === 'secret' ||
    value === 'pii' ||
    value === 'regulated_term' ||
    value === 'exfiltration_pattern'
  );
}

async function requireTenantAdminSession(
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
      response: buildErrorResponse(
        'ADMIN_UNAUTHORIZED',
        'A valid admin session is required to access policy controls.'
      ),
    };
  }

  const user = await authService.getUserBySessionToken(sessionToken);

  if (!user) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse(
        'ADMIN_UNAUTHORIZED',
        'The current admin session is invalid or expired.'
      ),
    };
  }

  if (!(await adminService.canReadAdminForUser(user))) {
    return {
      ok: false,
      statusCode: 403,
      response: buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Tenant admin access is required to access policy controls.'
      ),
    };
  }

  return {
    ok: true,
    user,
    canReadPlatformAdmin: await adminService.canReadPlatformAdminForUser(user),
  };
}

function resolveTargetTenantId(
  user: AuthUser,
  canReadPlatformAdmin: boolean,
  tenantId: string | undefined
) {
  const trimmed = tenantId?.trim();

  if (!trimmed) {
    return {
      ok: true as const,
      tenantId: user.tenantId,
    };
  }

  if (!canReadPlatformAdmin && trimmed !== user.tenantId) {
    return {
      ok: false as const,
      response: buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Tenant admins can only manage policy controls for their own tenant.'
      ),
    };
  }

  return {
    ok: true as const,
    tenantId: trimmed,
  };
}

export async function registerAdminPolicyRoutes(
  app: FastifyInstance,
  authService: AuthService,
  adminService: AdminService,
  policyService: PolicyService,
  auditService: AuditService
) {
  app.get('/admin/policy', async (request, reply): Promise<AdminPolicyOverviewResponse | AdminErrorResponse> => {
    const access = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const tenantResult = resolveTargetTenantId(
      access.user,
      access.canReadPlatformAdmin,
      ((request.query ?? {}) as { tenantId?: string }).tenantId
    );

    if (!tenantResult.ok) {
      reply.code(403);
      return tenantResult.response;
    }

    const overview = await policyService.getOverviewForUser(access.user, {
      tenantId: tenantResult.tenantId,
    });

    await auditService.recordEvent({
      tenantId: tenantResult.tenantId,
      actorUserId: access.user.id,
      action: 'admin.workspace.read',
      entityType: 'tenant',
      entityId: tenantResult.tenantId,
      ipAddress: request.ip,
      payload: {
        resource: '/admin/policy',
        tenantId: tenantResult.tenantId,
      },
    });

    return {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        governance: overview.governance,
        exceptions: overview.exceptions,
        recentEvaluations: overview.recentEvaluations,
      },
    };
  });

  app.post(
    '/admin/policy/simulations',
    async (request, reply): Promise<AdminPolicySimulationResponse | AdminErrorResponse> => {
      const access = await requireTenantAdminSession(
        authService,
        adminService,
        request.headers.authorization
      );

      if (!access.ok) {
        reply.code(access.statusCode);
        return access.response;
      }

      const body = (request.body ?? {}) as Partial<AdminPolicySimulationRequest>;
      const tenantResult = resolveTargetTenantId(
        access.user,
        access.canReadPlatformAdmin,
        body.tenantId ?? undefined
      );

      if (!tenantResult.ok) {
        reply.code(403);
        return tenantResult.response;
      }

      if (!isSimulationScope(body.scope) || typeof body.content !== 'string' || !body.content.trim()) {
        reply.code(400);
        return buildErrorResponse(
          'ADMIN_INVALID_PAYLOAD',
          'Policy simulation requires a valid scope and non-empty content.'
        );
      }

      const evaluation = await policyService.evaluateForUser(access.user, {
        tenantId: tenantResult.tenantId,
        scope: body.scope,
        content: body.content,
        groupId: body.groupId?.trim() || null,
        appId: body.appId?.trim() || null,
        runtimeId: body.runtimeId?.trim() || null,
      });

      await auditService.recordEvent({
        tenantId: tenantResult.tenantId,
        actorUserId: access.user.id,
        action: 'admin.policy.simulated',
        entityType: 'policy_evaluation',
        entityId: evaluation.id,
        ipAddress: request.ip,
        payload: {
          scope: body.scope,
          outcome: evaluation.outcome,
          detectorMatches: evaluation.detectorMatches,
          exceptionIds: evaluation.exceptionIds,
        },
      });

      return {
        ok: true,
        data: {
          evaluation,
        },
      };
    }
  );

  app.post(
    '/admin/policy/exceptions',
    async (request, reply): Promise<AdminPolicyExceptionCreateResponse | AdminErrorResponse> => {
      const access = await requireTenantAdminSession(
        authService,
        adminService,
        request.headers.authorization
      );

      if (!access.ok) {
        reply.code(access.statusCode);
        return access.response;
      }

      const body = (request.body ?? {}) as Partial<AdminPolicyExceptionCreateRequest>;
      const tenantResult = resolveTargetTenantId(
        access.user,
        access.canReadPlatformAdmin,
        body.tenantId ?? undefined
      );

      if (!tenantResult.ok) {
        reply.code(403);
        return tenantResult.response;
      }

      if (!isExceptionScope(body.scope) || !isDetector(body.detector) || typeof body.label !== 'string') {
        reply.code(400);
        return buildErrorResponse(
          'ADMIN_INVALID_PAYLOAD',
          'Policy exceptions require scope, detector, and label.'
        );
      }

      const result = await policyService.createExceptionForUser(access.user, {
        tenantId: tenantResult.tenantId,
        scope: body.scope,
        scopeId: body.scopeId ?? null,
        detector: body.detector,
        label: body.label,
        expiresAt: body.expiresAt ?? null,
        note: body.note ?? null,
      });

      if (!result.ok) {
        reply.code(result.statusCode);
        return buildErrorResponse(result.code, result.message, result.details);
      }

      await auditService.recordEvent({
        tenantId: tenantResult.tenantId,
        actorUserId: access.user.id,
        action: 'admin.policy.exception.created',
        entityType: 'policy_exception',
        entityId: result.data.exception.id,
        ipAddress: request.ip,
        payload: {
          detector: result.data.exception.detector,
          scope: result.data.exception.scope,
          scopeId: result.data.exception.scopeId,
          expiresAt: result.data.exception.expiresAt,
        },
      });

      return {
        ok: true,
        data: result.data,
      };
    }
  );

  app.put(
    '/admin/policy/exceptions/:exceptionId/review',
    async (request, reply): Promise<AdminPolicyExceptionReviewResponse | AdminErrorResponse> => {
      const access = await requireTenantAdminSession(
        authService,
        adminService,
        request.headers.authorization
      );

      if (!access.ok) {
        reply.code(access.statusCode);
        return access.response;
      }

      const exceptionId = ((request.params ?? {}) as { exceptionId?: string }).exceptionId?.trim();
      const body = (request.body ?? {}) as Partial<AdminPolicyExceptionReviewRequest>;

      if (!exceptionId) {
        reply.code(400);
        return buildErrorResponse(
          'ADMIN_INVALID_PAYLOAD',
          'Policy exception review requires an exception id.'
        );
      }

      const result = await policyService.reviewExceptionForUser(access.user, exceptionId, {
        note: body.note ?? null,
        expiresAt: body.expiresAt ?? null,
      });

      if (!result.ok) {
        reply.code(result.statusCode);
        return buildErrorResponse(result.code, result.message, result.details);
      }

      await auditService.recordEvent({
        tenantId: result.data.exception.tenantId,
        actorUserId: access.user.id,
        action: 'admin.policy.exception.reviewed',
        entityType: 'policy_exception',
        entityId: result.data.exception.id,
        ipAddress: request.ip,
        payload: {
          expiresAt: result.data.exception.expiresAt,
          reviewCount: result.data.exception.reviewHistory.length,
        },
      });

      return {
        ok: true,
        data: result.data,
      };
    }
  );
}
