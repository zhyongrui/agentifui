import Fastify, { type FastifyInstance } from 'fastify';

import type { GatewayEnv } from './config/env.js';
import { registerBasePlugins } from './plugins/base.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerRootRoutes } from './routes/root.js';
import { registerWorkspaceRoutes } from './routes/workspace.js';
import { createAuthService, type AuthService } from './services/auth-service.js';
import {
  createWorkspaceService,
  type WorkspaceService,
} from './services/workspace-service.js';

type BuildAppOptions = {
  logger?: boolean;
  authService?: AuthService;
  workspaceService?: WorkspaceService;
};

export async function buildApp(
  env: GatewayEnv,
  options: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            transport:
              env.nodeEnv === 'development'
                ? { target: 'pino-pretty' }
                : undefined,
          },
  });

  const authService =
    options.authService ??
    createAuthService({
      defaultTenantId: env.defaultTenantId,
      defaultSsoUserStatus: env.defaultSsoUserStatus,
      lockoutThreshold: env.authLockoutThreshold,
      lockoutDurationMs: env.authLockoutDurationMs,
    });
  const workspaceService = options.workspaceService ?? createWorkspaceService();

  await registerBasePlugins(app, env);
  await registerRootRoutes(app, env);
  await registerAuthRoutes(app, env, authService);
  await registerWorkspaceRoutes(app, authService, workspaceService);

  return app;
}
