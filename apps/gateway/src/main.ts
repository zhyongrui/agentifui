import 'dotenv/config';

import { buildApp } from './app.js';
import { parseGatewayEnv } from './config/env.js';

async function start() {
  const env = parseGatewayEnv(process.env);
  const app = await buildApp(env);

  try {
    await app.listen({ host: env.host, port: env.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
