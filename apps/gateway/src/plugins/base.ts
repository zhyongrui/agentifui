import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

import type { GatewayEnv } from '../config/env.js';

export async function registerBasePlugins(
  app: FastifyInstance,
  env: GatewayEnv
) {
  await app.register(cors, { origin: env.corsOrigin });
}
