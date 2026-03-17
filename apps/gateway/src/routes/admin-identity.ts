import type {
  AdminAccessRequestReviewRequest,
  AdminAccessRequestReviewResponse,
  AdminBreakGlassCreateRequest,
  AdminBreakGlassCreateResponse,
  AdminBreakGlassUpdateRequest,
  AdminBreakGlassUpdateResponse,
  AdminDomainClaimCreateRequest,
  AdminDomainClaimCreateResponse,
  AdminDomainClaimReviewRequest,
  AdminDomainClaimReviewResponse,
  AdminErrorResponse,
  AdminIdentityOverviewResponse,
  AdminTenantGovernanceUpdateRequest,
  AdminTenantGovernanceUpdateResponse,
  AdminUserMfaResetRequest,
  AdminUserMfaResetResponse,
} from '@agentifui/shared/admin';
import type { AuthUser } from '@agentifui/shared/auth';
import type { FastifyInstance } from 'fastify';

import type { AdminService } from '../services/admin-service.js';
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

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

async function requireTenantAdminSession(
  authService: AuthService,
  adminService: AdminService,
  authorization: string | undefined
): Promise<
  | {
      ok: true;
      user: AuthUser;
      canReadPlatformAdmin: boolean;
    }
  | {
      ok: false;
      statusCode: 401 | 403;
      response: AdminErrorResponse;
    }
> {
  const sessionToken = readBearerToken(authorization);

  if (!sessionToken) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse(
        'ADMIN_UNAUTHORIZED',
        'A valid session token is required to access the admin workspace.'
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
        'The current session is missing or has expired.'
      ),
    };
  }

  if (user.status !== 'active') {
    return {
      ok: false,
      statusCode: 403,
      response: buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Only active tenant administrators can access the admin workspace.',
        {
          status: user.status,
        }
      ),
    };
  }

  if (!(await adminService.canReadAdminForUser(user))) {
    return {
      ok: false,
      statusCode: 403,
      response: buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Tenant admin access is required to view this page.'
      ),
    };
  }

  return {
    ok: true,
    user,
    canReadPlatformAdmin: await adminService.canReadPlatformAdminForUser(user),
  };
}

async function recordIdentityAuditEvent(
  auditService: AuditService,
  input: {
    user: AuthUser;
    ipAddress: string | null;
    action:
      | 'admin.identity.domain_claim.created'
      | 'admin.identity.domain_claim.reviewed'
      | 'admin.identity.access_request.reviewed'
      | 'admin.identity.mfa.reset'
      | 'admin.identity.break_glass.created'
      | 'admin.identity.break_glass.revoked'
      | 'admin.identity.governance.updated'
      | 'admin.workspace.read';
    entityType:
      | 'access_request'
      | 'break_glass_session'
      | 'domain_claim'
      | 'session'
      | 'tenant'
      | 'user';
    entityId: string | null;
    payload: Record<string, unknown>;
  }
) {
  await auditService.recordEvent({
    tenantId: input.user.tenantId,
    actorUserId: input.user.id,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    ipAddress: input.ipAddress,
    payload: input.payload,
  });
}

export async function registerAdminIdentityRoutes(
  app: FastifyInstance,
  authService: AuthService,
  adminService: AdminService,
  auditService: AuditService
) {
  app.get('/admin/identity', async (request, reply) => {
    const access = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const query = (request.query ?? {}) as { tenantId?: string };
    const tenantId = query.tenantId?.trim();

    if (tenantId && !access.canReadPlatformAdmin && tenantId !== access.user.tenantId) {
      reply.code(403);
      return buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Tenant admins can only view identity controls for their own tenant.'
      );
    }

    const overview = await adminService.getIdentityOverviewForUser(access.user, {
      tenantId,
    });
    const response: AdminIdentityOverviewResponse = {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        capabilities: {
          canReadAdmin: true,
          canReadPlatformAdmin: access.canReadPlatformAdmin,
        },
        tenant: overview.tenant,
        domainClaims: overview.domainClaims,
        pendingAccessRequests: overview.pendingAccessRequests,
        breakGlassSessions: overview.breakGlassSessions,
        governance: overview.governance,
      },
    };

    await recordIdentityAuditEvent(auditService, {
      user: access.user,
      ipAddress: request.ip,
      action: 'admin.workspace.read',
      entityType: 'session',
      entityId: access.user.id,
      payload: {
        resource: '/admin/identity',
        tenantId: tenantId ?? access.user.tenantId,
      },
    });

    return response;
  });

  app.post('/admin/identity/domain-claims', async (request, reply) => {
    const access = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const body = (request.body ?? {}) as Partial<AdminDomainClaimCreateRequest>;
    const tenantId = body.tenantId?.trim();

    if (tenantId && !access.canReadPlatformAdmin && tenantId !== access.user.tenantId) {
      reply.code(403);
      return buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Tenant admins can only create domain claims for their own tenant.'
      );
    }

    if (
      typeof body.domain !== 'string' ||
      !body.domain.trim() ||
      typeof body.providerId !== 'string' ||
      !body.providerId.trim()
    ) {
      reply.code(400);
      return buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Domain claims require a domain and provider identifier.'
      );
    }

    const result = await adminService.createDomainClaimForUser(access.user, {
      tenantId,
      domain: body.domain,
      providerId: body.providerId,
      jitUserStatus: body.jitUserStatus === 'active' ? 'active' : 'pending',
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await recordIdentityAuditEvent(auditService, {
      user: access.user,
      ipAddress: request.ip,
      action: 'admin.identity.domain_claim.created',
      entityType: 'domain_claim',
      entityId: result.data.claim.id,
      payload: {
        tenantId: result.data.claim.tenantId,
        domain: result.data.claim.domain,
        providerId: result.data.claim.providerId,
        status: result.data.claim.status,
      },
    });

    const response: AdminDomainClaimCreateResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.put('/admin/identity/domain-claims/:claimId/review', async (request, reply) => {
    const access = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    if (!access.canReadPlatformAdmin) {
      reply.code(403);
      return buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Root admin access is required to review domain claims.'
      );
    }

    const params = request.params as { claimId?: string };
    const body = (request.body ?? {}) as Partial<AdminDomainClaimReviewRequest>;

    if (
      !params.claimId?.trim() ||
      (body.status !== 'approved' && body.status !== 'rejected')
    ) {
      reply.code(400);
      return buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Domain claim review requires a claim id and approved/rejected status.'
      );
    }

    const result = await adminService.reviewDomainClaimForUser(access.user, {
      claimId: params.claimId.trim(),
      status: body.status,
      reviewReason: body.reviewReason,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await recordIdentityAuditEvent(auditService, {
      user: access.user,
      ipAddress: request.ip,
      action: 'admin.identity.domain_claim.reviewed',
      entityType: 'domain_claim',
      entityId: result.data.claim.id,
      payload: {
        tenantId: result.data.claim.tenantId,
        domain: result.data.claim.domain,
        status: result.data.claim.status,
      },
    });

    const response: AdminDomainClaimReviewResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.put('/admin/identity/access-requests/:requestId/review', async (request, reply) => {
    const access = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = request.params as { requestId?: string };
    const body = (request.body ?? {}) as Partial<AdminAccessRequestReviewRequest>;

    if (
      !params.requestId?.trim() ||
      (body.decision !== 'approved' &&
        body.decision !== 'rejected' &&
        body.decision !== 'transferred')
    ) {
      reply.code(400);
      return buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Access request review requires a request id and approved/rejected/transferred decision.'
      );
    }

    if (body.decision === 'transferred' && !access.canReadPlatformAdmin) {
      reply.code(403);
      return buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Root admin access is required to transfer access requests between tenants.'
      );
    }

    const result = await adminService.reviewAccessRequestForUser(access.user, {
      requestId: params.requestId.trim(),
      decision: body.decision,
      reviewReason: body.reviewReason,
      targetTenantId: body.targetTenantId,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await recordIdentityAuditEvent(auditService, {
      user: access.user,
      ipAddress: request.ip,
      action: 'admin.identity.access_request.reviewed',
      entityType: 'access_request',
      entityId: result.data.request.id,
      payload: {
        tenantId: result.data.request.tenantId,
        status: result.data.request.status,
        targetTenantId: result.data.request.targetTenantId,
      },
    });

    const response: AdminAccessRequestReviewResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.put('/admin/identity/users/:userId/mfa/reset', async (request, reply) => {
    const access = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = request.params as { userId?: string };
    const body = (request.body ?? {}) as Partial<AdminUserMfaResetRequest>;

    if (!params.userId?.trim()) {
      reply.code(400);
      return buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'MFA reset requires a target user id.'
      );
    }

    const result = await adminService.resetUserMfaForUser(access.user, {
      userId: params.userId.trim(),
      reason: body.reason,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await recordIdentityAuditEvent(auditService, {
      user: access.user,
      ipAddress: request.ip,
      action: 'admin.identity.mfa.reset',
      entityType: 'user',
      entityId: result.data.userId,
      payload: {
        reason: result.data.reason,
      },
    });

    const response: AdminUserMfaResetResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.post('/admin/identity/break-glass', async (request, reply) => {
    const access = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    if (!access.canReadPlatformAdmin) {
      reply.code(403);
      return buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Root admin access is required to create break-glass sessions.'
      );
    }

    const body = (request.body ?? {}) as Partial<AdminBreakGlassCreateRequest>;

    if (typeof body.reason !== 'string' || !body.reason.trim()) {
      reply.code(400);
      return buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Break-glass sessions require a reason.'
      );
    }

    const result = await adminService.createBreakGlassSessionForUser(access.user, {
      tenantId: body.tenantId,
      reason: body.reason,
      justification: body.justification,
      expiresInMinutes: body.expiresInMinutes,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await recordIdentityAuditEvent(auditService, {
      user: access.user,
      ipAddress: request.ip,
      action: 'admin.identity.break_glass.created',
      entityType: 'break_glass_session',
      entityId: result.data.session.id,
      payload: {
        tenantId: result.data.session.tenantId,
        expiresAt: result.data.session.expiresAt,
      },
    });

    const response: AdminBreakGlassCreateResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.put('/admin/identity/break-glass/:sessionId', async (request, reply) => {
    const access = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    if (!access.canReadPlatformAdmin) {
      reply.code(403);
      return buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Root admin access is required to revoke break-glass sessions.'
      );
    }

    const params = request.params as { sessionId?: string };
    const body = (request.body ?? {}) as Partial<AdminBreakGlassUpdateRequest>;

    if (!params.sessionId?.trim() || body.status !== 'revoked') {
      reply.code(400);
      return buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Break-glass updates require a session id and revoked status.'
      );
    }

    const result = await adminService.updateBreakGlassSessionForUser(access.user, {
      sessionId: params.sessionId.trim(),
      status: 'revoked',
      reviewNotes: body.reviewNotes,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await recordIdentityAuditEvent(auditService, {
      user: access.user,
      ipAddress: request.ip,
      action: 'admin.identity.break_glass.revoked',
      entityType: 'break_glass_session',
      entityId: result.data.session.id,
      payload: {
        tenantId: result.data.session.tenantId,
        status: result.data.session.status,
      },
    });

    const response: AdminBreakGlassUpdateResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.put('/admin/identity/governance', async (request, reply) => {
    const access = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const body = (request.body ?? {}) as Partial<AdminTenantGovernanceUpdateRequest>;

    if (body.tenantId?.trim() && !access.canReadPlatformAdmin && body.tenantId.trim() !== access.user.tenantId) {
      reply.code(403);
      return buildErrorResponse(
        'ADMIN_FORBIDDEN',
        'Tenant admins can only update governance settings for their own tenant.'
      );
    }

    const result = await adminService.updateTenantGovernanceForUser(access.user, body);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await recordIdentityAuditEvent(auditService, {
      user: access.user,
      ipAddress: request.ip,
      action: 'admin.identity.governance.updated',
      entityType: 'tenant',
      entityId: result.data.governance.tenantId,
      payload: {
        legalHoldEnabled: result.data.governance.legalHoldEnabled,
        retentionOverrideDays: result.data.governance.retentionOverrideDays,
        policyPack: result.data.governance.policyPack,
        scimPlanning: result.data.governance.scimPlanning,
      },
    });

    const response: AdminTenantGovernanceUpdateResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });
}
