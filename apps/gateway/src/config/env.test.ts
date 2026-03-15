import { describe, expect, it } from 'vitest';

import { parseGatewayEnv } from './env.js';

describe('parseGatewayEnv', () => {
  it('uses defaults when values are absent', () => {
    expect(parseGatewayEnv({})).toEqual({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 4000,
      corsOrigin: true,
      databaseUrl: undefined,
      betterAuthSecret: 'agentifui-dev-secret-change-me',
      betterAuthUrl: 'http://127.0.0.1:4000',
      ssoDomainMap: {},
      defaultTenantId: 'dev-tenant',
      defaultSsoUserStatus: 'pending',
      degradedRuntimeIds: [],
      uploadsDir: undefined,
      authLockoutThreshold: 5,
      authLockoutDurationMs: 1800000,
    });
  });

  it('parses explicit values', () => {
    expect(
      parseGatewayEnv({
        NODE_ENV: 'production',
        GATEWAY_HOST: '127.0.0.1',
        GATEWAY_PORT: '4100',
        GATEWAY_CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_URL: 'postgresql://agentifui:agentifui@localhost:5432/agentifui',
        BETTER_AUTH_SECRET: 'production-secret',
        BETTER_AUTH_URL: 'https://gateway.agentifui.test',
        GATEWAY_SSO_DOMAINS: 'iflabx.com=iflabx-sso, agentifui.com=agentifui-saml',
        GATEWAY_DEFAULT_TENANT_ID: 'tenant-a',
        GATEWAY_SSO_JIT_DEFAULT_STATUS: 'active',
        GATEWAY_AUTH_LOCKOUT_THRESHOLD: '3',
        GATEWAY_AUTH_LOCKOUT_DURATION_MS: '60000',
      })
    ).toEqual({
      nodeEnv: 'production',
      host: '127.0.0.1',
      port: 4100,
      corsOrigin: 'http://localhost:3000',
      databaseUrl: 'postgresql://agentifui:agentifui@localhost:5432/agentifui',
      betterAuthSecret: 'production-secret',
      betterAuthUrl: 'https://gateway.agentifui.test',
      ssoDomainMap: {
        'iflabx.com': 'iflabx-sso',
        'agentifui.com': 'agentifui-saml',
      },
      defaultTenantId: 'tenant-a',
      defaultSsoUserStatus: 'active',
      degradedRuntimeIds: [],
      uploadsDir: undefined,
      authLockoutThreshold: 3,
      authLockoutDurationMs: 60000,
    });
  });

  it('rejects invalid ports', () => {
    expect(() =>
      parseGatewayEnv({
        GATEWAY_PORT: 'invalid',
      })
    ).toThrowError('Invalid GATEWAY_PORT value: invalid');
  });

  it('rejects invalid auth lockout values', () => {
    expect(() =>
      parseGatewayEnv({
        GATEWAY_AUTH_LOCKOUT_THRESHOLD: '0',
      })
    ).toThrowError('Invalid GATEWAY_AUTH_LOCKOUT_THRESHOLD value: 0');
  });

  it('requires BETTER_AUTH_SECRET in production', () => {
    expect(() =>
      parseGatewayEnv({
        NODE_ENV: 'production',
      })
    ).toThrowError('BETTER_AUTH_SECRET is required in production.');
  });

  it('rejects invalid sso jit status values', () => {
    expect(() =>
      parseGatewayEnv({
        GATEWAY_SSO_JIT_DEFAULT_STATUS: 'suspended',
      })
    ).toThrowError('Invalid GATEWAY_SSO_JIT_DEFAULT_STATUS value: suspended');
  });
});
