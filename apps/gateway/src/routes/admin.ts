import type {
  AdminAppsResponse,
  AdminAuditResponse,
  AdminErrorResponse,
  AdminGroupsResponse,
  AdminUsersResponse,
} from '@agentifui/shared/admin';
import type { AuthUser } from '@agentifui/shared/auth';
import type { FastifyInstance } from 'fastify';

import type { AdminService } from '../services/admin-service.js';
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

export async function registerAdminRoutes(
  app: FastifyInstance,
  authService: AuthService,
  adminService: AdminService
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

    const auditData = await adminService.listAuditForUser(session.user);
    const response: AdminAuditResponse = {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        countsByAction: auditData.countsByAction,
        events: auditData.events,
      },
    };

    return response;
  });
}
