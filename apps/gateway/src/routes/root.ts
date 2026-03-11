import type { FastifyInstance } from 'fastify';

import type { GatewayEnv } from '../config/env.js';

export async function registerRootRoutes(
  app: FastifyInstance,
  env: GatewayEnv
) {
  app.get('/health', async () => {
    return {
      status: 'ok' as const,
      service: 'gateway' as const,
      slice: 'M0',
      environment: env.nodeEnv,
      time: new Date().toISOString(),
    };
  });

  app.get('/', async () => {
    return {
      name: 'AgentifUI Gateway',
      message:
        'M0 engineering runway is ready. Next step is implementing /auth/* routes.',
      environment: env.nodeEnv,
    };
  });
}
