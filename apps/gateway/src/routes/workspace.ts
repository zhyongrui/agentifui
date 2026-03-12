import type { WorkspaceCatalogResponse, WorkspaceErrorResponse } from '@agentifui/shared/apps';
import type { FastifyInstance } from 'fastify';

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

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  authService: AuthService,
  workspaceService: WorkspaceService
) {
  app.get('/workspace/apps', async (request, reply) => {
    const sessionToken = readBearerToken(request.headers.authorization);

    if (!sessionToken) {
      reply.code(401);
      return buildErrorResponse(
        'WORKSPACE_UNAUTHORIZED',
        'A valid session token is required to access the workspace.'
      );
    }

    const user = await authService.getUserBySessionToken(sessionToken);

    if (!user) {
      reply.code(401);
      return buildErrorResponse(
        'WORKSPACE_UNAUTHORIZED',
        'The current workspace session is missing or has expired.'
      );
    }

    if (user.status !== 'active') {
      reply.code(403);
      return buildErrorResponse(
        'WORKSPACE_FORBIDDEN',
        'Only active users can enter the apps workspace.',
        {
          status: user.status,
        }
      );
    }

    const response: WorkspaceCatalogResponse = {
      ok: true,
      data: workspaceService.getCatalogForUser(user),
    };

    return response;
  });
}
