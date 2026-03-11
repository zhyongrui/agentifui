import { afterAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';

const app = await buildApp(
  {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 4000,
    corsOrigin: true,
    ssoDomainMap: {
      'iflabx.com': 'iflabx-sso',
    },
  },
  { logger: false }
);

afterAll(async () => {
  await app.close();
});

describe('auth route skeleton', () => {
  it('discovers a configured sso domain', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sso/discovery',
      payload: {
        email: 'developer@iflabx.com',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      data: {
        domain: 'iflabx.com',
        hasSso: true,
        providerId: 'iflabx-sso',
      },
    });
  });

  it('rejects weak register passwords before persistence exists', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'developer@iflabx.com',
        password: 'weak',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'AUTH_PASSWORD_TOO_WEAK',
      },
    });
  });

  it('returns a not implemented contract for login after payload validation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'developer@iflabx.com',
        password: 'Secure123',
      },
    });

    expect(response.statusCode).toBe(501);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'AUTH_NOT_IMPLEMENTED',
      },
    });
  });

  it('returns a successful logout payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      data: {
        loggedOut: true,
      },
    });
  });
});
