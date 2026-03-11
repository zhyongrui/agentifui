import { describe, expect, it } from 'vitest';

import { createAuthService } from './auth-service.js';

function createTestService() {
  return createAuthService({
    defaultTenantId: 'tenant-test',
    lockoutThreshold: 5,
    lockoutDurationMs: 1800000,
  });
}

describe('auth service', () => {
  it('registers a user and returns a login next step', () => {
    const service = createTestService();
    const result = service.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        nextStep: 'login',
        user: {
          tenantId: 'tenant-test',
          email: 'developer@iflabx.com',
          displayName: 'Developer',
          status: 'active',
        },
      },
    });
  });

  it('prevents duplicate registrations for the same email', () => {
    const service = createTestService();

    service.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    const result = service.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'AUTH_EMAIL_ALREADY_EXISTS',
      statusCode: 409,
    });
  });

  it('logs a user in after successful registration', () => {
    const service = createTestService();

    service.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    const result = service.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.sessionToken).toEqual(expect.any(String));
      expect(result.data.user.lastLoginAt).toEqual(expect.any(String));
    }
  });

  it('locks the account after repeated invalid passwords', () => {
    const service = createTestService();

    service.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = service.login({
        email: 'developer@iflabx.com',
        password: 'WrongPass1',
      });

      expect(result).toMatchObject({
        ok: false,
        code: 'AUTH_INVALID_CREDENTIALS',
        statusCode: 401,
      });
    }

    const locked = service.login({
      email: 'developer@iflabx.com',
      password: 'WrongPass1',
    });

    expect(locked).toMatchObject({
      ok: false,
      code: 'AUTH_ACCOUNT_LOCKED',
      statusCode: 423,
    });
  });

  it('rejects pending accounts even with correct credentials', () => {
    const service = createTestService();

    service.seedPendingUser({
      email: 'pending@iflabx.com',
      password: 'Secure123',
    });

    const result = service.login({
      email: 'pending@iflabx.com',
      password: 'Secure123',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'AUTH_ACCOUNT_PENDING',
      statusCode: 403,
    });
  });

  it('accepts a valid invitation and allows the user to log in', () => {
    const service = createTestService();
    const invitation = service.seedInvitation({
      email: 'invitee@iflabx.com',
    });

    const activation = service.acceptInvitation({
      token: invitation.data.token,
      password: 'Secure123',
      displayName: 'Invited User',
    });

    expect(activation).toMatchObject({
      ok: true,
      data: {
        activated: true,
        userStatus: 'active',
        nextStep: 'login',
        user: {
          tenantId: 'tenant-test',
          email: 'invitee@iflabx.com',
          displayName: 'Invited User',
          status: 'active',
        },
      },
    });

    const login = service.login({
      email: 'invitee@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);
  });

  it('rejects expired invitation links', () => {
    const service = createTestService();
    const invitation = service.seedInvitation({
      email: 'invitee@iflabx.com',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    const activation = service.acceptInvitation({
      token: invitation.data.token,
      password: 'Secure123',
    });

    expect(activation).toMatchObject({
      ok: false,
      code: 'AUTH_INVITE_LINK_EXPIRED',
      statusCode: 410,
    });
  });
});
