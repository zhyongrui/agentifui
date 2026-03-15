import { afterAll, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

const env = {
  nodeEnv: 'test' as const,
  host: '127.0.0.1',
  port: 4000,
  corsOrigin: true,
  ssoDomainMap: {},
  defaultTenantId: 'test-tenant',
  defaultSsoUserStatus: 'pending' as const,
  authLockoutThreshold: 5,
  authLockoutDurationMs: 1800000,
};

const app = await buildApp(env, { logger: false });

afterAll(async () => {
  await app.close();
});

describe('gateway app', () => {
  it('returns a health payload', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'gateway',
      slice: 'M0',
      environment: 'test',
      startedAt: expect.any(String),
      uptimeSeconds: expect.any(Number),
      inflightRequests: expect.any(Number),
      runtime: {
        overallStatus: 'available',
        runtimes: expect.arrayContaining([
          expect.objectContaining({
            id: 'placeholder',
            status: 'available',
          }),
        ]),
      },
    });
  });

  it('returns the root description payload', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: 'AgentifUI Gateway',
      environment: 'test',
    });
  });

  it('exposes a prometheus-style metrics payload', async () => {
    await app.inject({
      method: 'GET',
      url: '/health',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('agentifui_gateway_requests_total');
    expect(response.body).toContain('agentifui_gateway_request_count_by_route_total');
    expect(response.body).toContain('route="/health"');
  });

  it('surfaces degraded runtime health when configured through the gateway env', async () => {
    const degradedApp = await buildApp(
      {
        ...env,
        degradedRuntimeIds: ['placeholder'],
      },
      { logger: false }
    );

    try {
      const response = await degradedApp.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        runtime: {
          overallStatus: 'degraded',
          runtimes: expect.arrayContaining([
            expect.objectContaining({
              id: 'placeholder',
              status: 'degraded',
            }),
          ]),
        },
      });
    } finally {
      await degradedApp.close();
    }
  });
});
