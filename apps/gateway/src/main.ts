import cors from '@fastify/cors';
import Fastify from 'fastify';

const port = Number(process.env.GATEWAY_PORT ?? 4000);
const host = process.env.GATEWAY_HOST ?? '0.0.0.0';

async function start() {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty' }
          : undefined,
    },
  });

  await app.register(cors, { origin: true });

  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'gateway',
      slice: 'S1-1',
      time: new Date().toISOString(),
    };
  });

  app.get('/', async () => {
    return {
      name: 'AgentifUI Gateway',
      message: 'Start implementing auth routes for S1-1 here.',
    };
  });

  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
