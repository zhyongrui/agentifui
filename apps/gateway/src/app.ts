import Fastify, { type FastifyInstance } from 'fastify';

import type { GatewayEnv } from './config/env.js';
import { registerBasePlugins } from './plugins/base.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerRootRoutes } from './routes/root.js';

type BuildAppOptions = {
  logger?: boolean;
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

  await registerBasePlugins(app, env);
  await registerRootRoutes(app, env);
  await registerAuthRoutes(app, env);

  return app;
}
