import Fastify, { type FastifyInstance } from 'fastify';

import type { GatewayEnv } from './config/env.js';
import { registerBasePlugins } from './plugins/base.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerRootRoutes } from './routes/root.js';
import { createAuthService, type AuthService } from './services/auth-service.js';

type BuildAppOptions = {
  logger?: boolean;
  authService?: AuthService;
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
      lockoutThreshold: env.authLockoutThreshold,
      lockoutDurationMs: env.authLockoutDurationMs,
    });

  await registerBasePlugins(app, env);
  await registerRootRoutes(app, env);
  await registerAuthRoutes(app, env, authService);

  return app;
}
