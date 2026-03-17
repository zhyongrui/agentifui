import type { WorkspaceBillingResponse, WorkspaceErrorResponse } from '@agentifui/shared/apps';
import type { FastifyInstance } from 'fastify';

import type { AuthService } from '../services/auth-service.js';
import type { BillingService } from '../services/billing-service.js';

function buildErrorResponse(code: WorkspaceErrorResponse['error']['code'], message: string, details?: unknown): WorkspaceErrorResponse {
  return { ok: false, error: { code, message, details } };
}

function readBearerToken(value: string | undefined): string | null {
  if (!value) return null;
  const [scheme, token] = value.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export async function registerWorkspaceBillingRoutes(app: FastifyInstance, authService: AuthService, billingService: BillingService) {
  app.get('/workspace/billing', async (request, reply): Promise<WorkspaceBillingResponse | WorkspaceErrorResponse> => {
    const sessionToken = readBearerToken(request.headers.authorization);
    if (!sessionToken) { reply.code(401); return buildErrorResponse('WORKSPACE_UNAUTHORIZED', 'Workspace access requires a bearer session.'); }
    const user = await authService.getUserBySessionToken(sessionToken);
    if (!user) { reply.code(401); return buildErrorResponse('WORKSPACE_UNAUTHORIZED', 'The workspace session is invalid or expired.'); }
    return { ok: true, data: await billingService.getWorkspaceBillingForUser(user) };
  });
}
