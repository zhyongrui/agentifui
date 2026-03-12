import { afterEach, describe, expect, it, vi } from 'vitest';

import { loginWithPassword } from './auth-client.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('auth client', () => {
  it('posts login requests through the same-origin gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            sessionToken: 'session-123',
            user: {
              id: 'user-1',
              tenantId: 'tenant-dev',
              email: 'developer@iflabx.com',
              displayName: 'Developer',
              status: 'active',
              createdAt: '2026-03-12T00:00:00.000Z',
              lastLoginAt: '2026-03-12T00:00:00.000Z',
            },
          },
        }),
      })
    );

    const result = await loginWithPassword({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'developer@iflabx.com',
        password: 'Secure123',
      }),
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        sessionToken: 'session-123',
      },
    });
  });
});
