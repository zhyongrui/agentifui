import type { FastifyInstance } from 'fastify';

import type { GatewayEnv } from '../config/env.js';
import type { ObservabilityService } from '../services/observability-service.js';

export async function registerRootRoutes(
  app: FastifyInstance,
  env: GatewayEnv,
  observabilityService: ObservabilityService
) {
  app.get('/health', async () => {
    const snapshot = observabilityService.getSnapshot();

    return {
      status: 'ok' as const,
      service: 'gateway' as const,
      slice: 'M0',
      environment: env.nodeEnv,
      startedAt: snapshot.startedAt,
      uptimeSeconds: snapshot.uptimeSeconds,
      inflightRequests: snapshot.inflightRequests,
      time: new Date().toISOString(),
    };
  });

  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return observabilityService.renderPrometheus();
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
