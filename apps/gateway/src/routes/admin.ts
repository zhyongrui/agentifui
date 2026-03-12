import type {
  AdminAppGrantCreateRequest,
  AdminAppGrantCreateResponse,
  AdminAppGrantDeleteResponse,
  AdminAppsResponse,
  AdminAuditExportFormat,
  AdminAuditExportJsonBundle,
  AdminAuditExportMetadata,
  AdminAuditFilters,
  AdminAuditPayloadMode,
  AdminAuditResponse,
  AdminErrorResponse,
  AdminGroupsResponse,
  AdminUsersResponse,
} from '@agentifui/shared/admin';
import type { AuthAuditEntityType, AuthAuditLevel, AuthUser } from '@agentifui/shared/auth';
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

function isGrantEffect(value: unknown): value is AdminAppGrantCreateRequest['effect'] {
  return value === 'allow' || value === 'deny';
}

function isAuditLevel(value: unknown): value is AuthAuditLevel {
  return value === 'critical' || value === 'info' || value === 'warning';
}

function isAuditEntityType(value: unknown): value is AuthAuditEntityType {
  return (
    value === 'conversation' ||
    value === 'run' ||
    value === 'session' ||
    value === 'user' ||
    value === 'workspace_app'
  );
}

function isAuditExportFormat(value: unknown): value is AdminAuditExportFormat {
  return value === 'csv' || value === 'json';
}

function isAuditPayloadMode(value: unknown): value is AdminAuditPayloadMode {
  return value === 'masked' || value === 'raw';
}

function readQueryString(value: unknown) {
  if (Array.isArray(value)) {
    return readQueryString(value[0]);
  }

  return typeof value === 'string' ? value.trim() : '';
}

function buildAuditExportMetadata(
  format: AdminAuditExportFormat,
  appliedFilters: AdminAuditFilters,
  eventCount: number
): AdminAuditExportMetadata {
  const exportedAt = new Date().toISOString();

  return {
    format,
    filename: `admin-audit-${exportedAt.replace(/[:.]/g, '-')}.${format}`,
    exportedAt,
    eventCount,
    appliedFilters,
  };
}

function toCsvCell(value: string | number | null) {
  const normalized = value === null ? '' : String(value);

  return `"${normalized.replaceAll('"', '""')}"`;
}

function buildAuditExportCsv(bundle: AdminAuditExportJsonBundle) {
  const header = [
    'event_id',
    'occurred_at',
    'action',
    'level',
    'actor_user_id',
    'entity_type',
    'entity_id',
    'trace_id',
    'run_id',
    'conversation_id',
    'app_id',
    'app_name',
    'active_group_id',
    'active_group_name',
    'ip_address',
    'payload_mode',
    'payload_sensitive',
    'payload_high_risk_match_count',
    'payload_match_count',
    'payload_matches_json',
    'payload_json',
  ];

  const rows = bundle.events.map(event =>
    [
      event.id,
      event.occurredAt,
      event.action,
      event.level,
      event.actorUserId,
      event.entityType,
      event.entityId,
      event.context.traceId,
      event.context.runId,
      event.context.conversationId,
      event.context.appId,
      event.context.appName,
      event.context.activeGroupId,
      event.context.activeGroupName,
      event.ipAddress,
      event.payloadInspection.mode,
      event.payloadInspection.containsSensitiveData ? 'true' : 'false',
      event.payloadInspection.highRiskMatchCount,
      event.payloadInspection.matches.length,
      JSON.stringify(event.payloadInspection.matches),
      JSON.stringify(event.payload),
    ]
      .map(toCsvCell)
      .join(',')
  );

  return [header.map(toCsvCell).join(','), ...rows].join('\n');
}

function parseAuditFilters(query: Record<string, unknown>):
  | {
      ok: true;
      filters: AdminAuditFilters;
    }
  | {
      ok: false;
      response: AdminErrorResponse;
    } {
  const level = readQueryString(query.level);
  const entityType = readQueryString(query.entityType);
  const limit = readQueryString(query.limit);
  const occurredAfter = readQueryString(query.occurredAfter);
  const occurredBefore = readQueryString(query.occurredBefore);
  const payloadMode = readQueryString(query.payloadMode);

  if (level && !isAuditLevel(level)) {
    return {
      ok: false,
      response: buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Audit filters require level to be info, warning or critical.'
      ),
    };
  }

  if (entityType && !isAuditEntityType(entityType)) {
    return {
      ok: false,
      response: buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Audit filters require a supported entity type.'
      ),
    };
  }

  if (payloadMode && !isAuditPayloadMode(payloadMode)) {
    return {
      ok: false,
      response: buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Audit filters require payloadMode to be masked or raw.'
      ),
    };
  }

  const normalizedLevel = level ? (level as AuthAuditLevel) : null;
  const normalizedEntityType = entityType ? (entityType as AuthAuditEntityType) : null;
  const normalizedPayloadMode = payloadMode ? (payloadMode as AdminAuditPayloadMode) : null;

  let parsedLimit: number | null = null;

  if (limit) {
    parsedLimit = Number.parseInt(limit, 10);

    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 200) {
      return {
        ok: false,
        response: buildErrorResponse(
          'ADMIN_INVALID_PAYLOAD',
          'Audit filters require limit to be an integer between 1 and 200.'
        ),
      };
    }
  }

  const parseTimestamp = (
    value: string,
    field: 'occurredAfter' | 'occurredBefore'
  ): null | { error: AdminErrorResponse } | { value: string } => {
    if (!value) {
      return null;
    }

    const timestamp = new Date(value);

    if (Number.isNaN(timestamp.getTime())) {
      return {
        error: buildErrorResponse(
          'ADMIN_INVALID_PAYLOAD',
          `Audit filters require ${field} to be a valid ISO-8601 timestamp.`
        ),
      };
    }

    return {
      value: timestamp.toISOString(),
    };
  };

  const parsedOccurredAfter = parseTimestamp(occurredAfter, 'occurredAfter');

  if (parsedOccurredAfter && 'error' in parsedOccurredAfter) {
    return {
      ok: false,
      response: parsedOccurredAfter.error,
    };
  }

  const parsedOccurredBefore = parseTimestamp(occurredBefore, 'occurredBefore');

  if (parsedOccurredBefore && 'error' in parsedOccurredBefore) {
    return {
      ok: false,
      response: parsedOccurredBefore.error,
    };
  }

  return {
    ok: true,
    filters: {
      action: readQueryString(query.action) || null,
      level: normalizedLevel,
      actorUserId: readQueryString(query.actorUserId) || null,
      entityType: normalizedEntityType,
      traceId: readQueryString(query.traceId) || null,
      runId: readQueryString(query.runId) || null,
      conversationId: readQueryString(query.conversationId) || null,
      occurredAfter: parsedOccurredAfter?.value ?? null,
      occurredBefore: parsedOccurredBefore?.value ?? null,
      payloadMode: normalizedPayloadMode,
      limit: parsedLimit,
    },
  };
}

async function requireTenantAdminSession(
  authService: AuthService,
  adminService: AdminService,
  authorization: string | undefined
): Promise<
  | {
      ok: true;
      user: AuthUser;
    }
  | {
      ok: false;
      statusCode: 401 | 403 | 503;
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

  const canReadAdmin = await adminService.canReadAdminForUser(user);

  if (!canReadAdmin) {
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
  };
}

async function recordAdminReadEvent(
  auditService: AuditService,
  input: {
    user: AuthUser;
    ipAddress: string | null;
    resource: '/admin/apps' | '/admin/audit' | '/admin/audit/export' | '/admin/groups' | '/admin/users';
    resultCount?: number;
    filters?: AdminAuditFilters;
    exportFormat?: AdminAuditExportFormat;
  }
) {
  await auditService.recordEvent({
    tenantId: input.user.tenantId,
    actorUserId: input.user.id,
    action: 'admin.workspace.read',
    entityType: 'session',
    entityId: input.user.id,
    ipAddress: input.ipAddress,
    payload: {
      resource: input.resource,
      resultCount: input.resultCount ?? null,
      filters: input.filters ?? null,
      exportFormat: input.exportFormat ?? null,
    },
  });
}

async function recordGrantRejectedEvent(
  auditService: AuditService,
  input: {
    user: AuthUser;
    ipAddress: string | null;
    operation: 'create' | 'revoke';
    appId: string | null;
    grantId?: string | null;
    subjectUserEmail?: string | null;
    effect?: AdminAppGrantCreateRequest['effect'] | null;
    reason?: string | null;
    failureCode: string;
    failureMessage: string;
    details?: unknown;
  }
) {
  await auditService.recordEvent({
    tenantId: input.user.tenantId,
    actorUserId: input.user.id,
    action: 'admin.workspace_grant.rejected',
    level: 'warning',
    entityType: 'workspace_app',
    entityId: input.appId,
    ipAddress: input.ipAddress,
    payload: {
      operation: input.operation,
      appId: input.appId,
      grantId: input.grantId ?? null,
      subjectUserEmail: input.subjectUserEmail ?? null,
      effect: input.effect ?? null,
      reason: input.reason ?? null,
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      details: input.details ?? null,
    },
  });
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  authService: AuthService,
  adminService: AdminService,
  auditService: AuditService
) {
  app.get('/admin/users', async (request, reply) => {
    const session = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const response: AdminUsersResponse = {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        users: await adminService.listUsersForUser(session.user),
      },
    };

    await recordAdminReadEvent(auditService, {
      user: session.user,
      ipAddress: request.ip,
      resource: '/admin/users',
      resultCount: response.data.users.length,
    });

    return response;
  });

  app.get('/admin/groups', async (request, reply) => {
    const session = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const response: AdminGroupsResponse = {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        groups: await adminService.listGroupsForUser(session.user),
      },
    };

    await recordAdminReadEvent(auditService, {
      user: session.user,
      ipAddress: request.ip,
      resource: '/admin/groups',
      resultCount: response.data.groups.length,
    });

    return response;
  });

  app.get('/admin/apps', async (request, reply) => {
    const session = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const response: AdminAppsResponse = {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        apps: await adminService.listAppsForUser(session.user),
      },
    };

    await recordAdminReadEvent(auditService, {
      user: session.user,
      ipAddress: request.ip,
      resource: '/admin/apps',
      resultCount: response.data.apps.length,
    });

    return response;
  });

  app.get('/admin/audit', async (request, reply) => {
    const session = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const parsedFilters = parseAuditFilters((request.query ?? {}) as Record<string, unknown>);

    if (!parsedFilters.ok) {
      reply.code(400);
      return parsedFilters.response;
    }

    const resolvedFilters: AdminAuditFilters = {
      ...parsedFilters.filters,
      payloadMode: parsedFilters.filters.payloadMode ?? 'masked',
    };
    const auditData = await adminService.listAuditForUser(session.user, resolvedFilters);
    const response: AdminAuditResponse = {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        appliedFilters: resolvedFilters,
        countsByAction: auditData.countsByAction,
        events: auditData.events,
      },
    };

    await recordAdminReadEvent(auditService, {
      user: session.user,
      ipAddress: request.ip,
      resource: '/admin/audit',
      resultCount: response.data.events.length,
      filters: resolvedFilters,
    });

    return response;
  });

  app.get('/admin/audit/export', async (request, reply) => {
    const session = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const query = (request.query ?? {}) as Record<string, unknown>;
    const format = readQueryString(query.format);

    if (!isAuditExportFormat(format)) {
      reply.code(400);
      return buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Audit export requires format to be csv or json.'
      );
    }

    const parsedFilters = parseAuditFilters(query);

    if (!parsedFilters.ok) {
      reply.code(400);
      return parsedFilters.response;
    }

    const exportFilters: AdminAuditFilters = {
      ...parsedFilters.filters,
      payloadMode: parsedFilters.filters.payloadMode ?? 'masked',
      limit: parsedFilters.filters.limit ?? 1000,
    };
    const auditData = await adminService.listAuditForUser(session.user, exportFilters);
    const metadata = buildAuditExportMetadata(format, exportFilters, auditData.events.length);
    const bundle: AdminAuditExportJsonBundle = {
      metadata,
      events: auditData.events,
    };

    reply.header('content-disposition', `attachment; filename="${metadata.filename}"`);
    reply.header('x-agentifui-export-format', metadata.format);
    reply.header('x-agentifui-export-filename', metadata.filename);
    reply.header('x-agentifui-exported-at', metadata.exportedAt);
    reply.header('x-agentifui-export-count', String(metadata.eventCount));

    await recordAdminReadEvent(auditService, {
      user: session.user,
      ipAddress: request.ip,
      resource: '/admin/audit/export',
      resultCount: auditData.events.length,
      filters: exportFilters,
      exportFormat: format,
    });

    if (format === 'json') {
      reply.type('application/json; charset=utf-8');
      return JSON.stringify(bundle, null, 2);
    }

    reply.type('text/csv; charset=utf-8');
    return buildAuditExportCsv(bundle);
  });

  app.post('/admin/apps/:appId/grants', async (request, reply) => {
    const session = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const params = request.params as { appId?: string };
    const body = (request.body ?? {}) as Partial<AdminAppGrantCreateRequest>;
    const appId = params.appId?.trim();
    const subjectUserEmail = body.subjectUserEmail?.trim();
    const reason = typeof body.reason === 'string' ? body.reason : null;

    if (!appId || !subjectUserEmail || !isGrantEffect(body.effect)) {
      await recordGrantRejectedEvent(auditService, {
        user: session.user,
        ipAddress: request.ip,
        operation: 'create',
        appId: appId ?? null,
        subjectUserEmail: subjectUserEmail ?? null,
        effect: isGrantEffect(body.effect) ? body.effect : null,
        reason,
        failureCode: 'ADMIN_INVALID_PAYLOAD',
        failureMessage:
          'Admin app grants require an app id, target user email and allow/deny effect.',
      });
      reply.code(400);
      return buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Admin app grants require an app id, target user email and allow/deny effect.'
      );
    }

    const result = await adminService.createAppGrantForUser(session.user, {
      appId,
      subjectUserEmail,
      effect: body.effect,
      reason,
    });

    if (!result.ok) {
      await recordGrantRejectedEvent(auditService, {
        user: session.user,
        ipAddress: request.ip,
        operation: 'create',
        appId,
        subjectUserEmail,
        effect: body.effect,
        reason,
        failureCode: result.code,
        failureMessage: result.message,
        details: result.details,
      });
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: 'admin.workspace_grant.created',
      entityType: 'user',
      entityId: result.data.grant.user.id,
      ipAddress: request.ip,
      payload: {
        appId: result.data.app.id,
        appName: result.data.app.name,
        effect: result.data.grant.effect,
        subjectUserEmail: result.data.grant.user.email,
        reason: result.data.grant.reason,
        grantId: result.data.grant.id,
      },
    });

    const response: AdminAppGrantCreateResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.delete('/admin/apps/:appId/grants/:grantId', async (request, reply) => {
    const session = await requireTenantAdminSession(
      authService,
      adminService,
      request.headers.authorization
    );

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const params = request.params as { appId?: string; grantId?: string };
    const appId = params.appId?.trim();
    const grantId = params.grantId?.trim();

    if (!appId || !grantId) {
      await recordGrantRejectedEvent(auditService, {
        user: session.user,
        ipAddress: request.ip,
        operation: 'revoke',
        appId: appId ?? null,
        grantId: grantId ?? null,
        failureCode: 'ADMIN_INVALID_PAYLOAD',
        failureMessage: 'Admin app grant revocation requires an app id and grant id.',
      });
      reply.code(400);
      return buildErrorResponse(
        'ADMIN_INVALID_PAYLOAD',
        'Admin app grant revocation requires an app id and grant id.'
      );
    }

    const result = await adminService.revokeAppGrantForUser(session.user, {
      appId,
      grantId,
    });

    if (!result.ok) {
      await recordGrantRejectedEvent(auditService, {
        user: session.user,
        ipAddress: request.ip,
        operation: 'revoke',
        appId,
        grantId,
        failureCode: result.code,
        failureMessage: result.message,
        details: result.details,
      });
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: 'admin.workspace_grant.revoked',
      entityType: 'user',
      entityId: result.data.revokedGrant.user.id,
      ipAddress: request.ip,
      payload: {
        appId: result.data.app.id,
        appName: result.data.app.name,
        effect: result.data.revokedGrant.effect,
        subjectUserEmail: result.data.revokedGrant.user.email,
        reason: result.data.revokedGrant.reason,
        grantId: result.data.revokedGrantId,
      },
    });

    const response: AdminAppGrantDeleteResponse = {
      ok: true,
      data: {
        app: result.data.app,
        revokedGrantId: result.data.revokedGrantId,
      },
    };

    return response;
  });
}
