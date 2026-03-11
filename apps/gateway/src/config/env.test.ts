import { describe, expect, it } from 'vitest';

import { parseGatewayEnv } from './env.js';

describe('parseGatewayEnv', () => {
  it('uses defaults when values are absent', () => {
    expect(parseGatewayEnv({})).toEqual({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 4000,
      corsOrigin: true,
      ssoDomainMap: {},
    });
  });

  it('parses explicit values', () => {
    expect(
      parseGatewayEnv({
        NODE_ENV: 'production',
        GATEWAY_HOST: '127.0.0.1',
        GATEWAY_PORT: '4100',
        GATEWAY_CORS_ORIGIN: 'http://localhost:3000',
        GATEWAY_SSO_DOMAINS: 'iflabx.com=iflabx-sso, agentifui.com=agentifui-saml',
      })
    ).toEqual({
      nodeEnv: 'production',
      host: '127.0.0.1',
      port: 4100,
      corsOrigin: 'http://localhost:3000',
      ssoDomainMap: {
        'iflabx.com': 'iflabx-sso',
        'agentifui.com': 'agentifui-saml',
      },
    });
  });

  it('rejects invalid ports', () => {
    expect(() =>
      parseGatewayEnv({
        GATEWAY_PORT: 'invalid',
      })
    ).toThrowError('Invalid GATEWAY_PORT value: invalid');
  });
});
