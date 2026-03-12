import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createPersistentAuthService } from '../services/persistent-auth-service.js';
import { generateTotpCode } from '../services/totp-service.js';
import {
  createPersistentTestDatabase,
  PERSISTENT_TEST_ENV,
  resetPersistentTestDatabase,
} from '../test/persistent-db.js';

async function createPersistentApp() {
  return buildApp(PERSISTENT_TEST_ENV, {
    logger: false,
  });
}

const PERSISTENCE_TEST_TIMEOUT_MS = 30000;

describe.sequential('persistent auth runtime', () => {
  it(
    'persists sessions and revokes them on logout across app restarts',
    async () => {
    await resetPersistentTestDatabase();

    const app = await createPersistentApp();
    let appClosed = false;

    try {
      const register = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'persistent@iflabx.com',
          password: 'Secure123',
          displayName: 'Persistent User',
        },
      });

      expect(register.statusCode).toBe(201);

      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'persistent@iflabx.com',
          password: 'Secure123',
        },
      });

      expect(login.statusCode).toBe(200);
      const sessionToken = login.json().data.sessionToken as string;

      const auditBeforeRestart = await app.inject({
        method: 'GET',
        url: '/auth/audit-events',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(auditBeforeRestart.statusCode).toBe(200);
      expect(auditBeforeRestart.json().data.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'auth.login.succeeded',
          }),
        ])
      );

      await app.close();
      appClosed = true;

      const restartedApp = await createPersistentApp();
      let restartedAppClosed = false;

      try {
        const workspace = await restartedApp.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${sessionToken}`,
          },
        });

        expect(workspace.statusCode).toBe(200);
        expect(workspace.json().data.apps.length).toBeGreaterThan(0);

        const logout = await restartedApp.inject({
          method: 'POST',
          url: '/auth/logout',
          headers: {
            authorization: `Bearer ${sessionToken}`,
          },
        });

        expect(logout.statusCode).toBe(200);

        const workspaceAfterLogout = await restartedApp.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${sessionToken}`,
          },
        });

        expect(workspaceAfterLogout.statusCode).toBe(401);
      } finally {
        if (!restartedAppClosed) {
          await restartedApp.close();
          restartedAppClosed = true;
        }
      }
    } finally {
      if (!appClosed) {
        await app.close();
      }
    }
    },
    PERSISTENCE_TEST_TIMEOUT_MS
  );

  it(
    'persists mfa enrollment across restarts and requires totp on the next login',
    async () => {
    await resetPersistentTestDatabase();

    const app = await createPersistentApp();
    let appClosed = false;

    try {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'mfa@iflabx.com',
          password: 'Secure123',
        },
      });

      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'mfa@iflabx.com',
          password: 'Secure123',
        },
      });
      const sessionToken = login.json().data.sessionToken as string;

      const setup = await app.inject({
        method: 'POST',
        url: '/auth/mfa/setup',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(setup.statusCode).toBe(200);
      const setupPayload = setup.json().data as {
        setupToken: string;
        manualEntryKey: string;
      };

      const enable = await app.inject({
        method: 'POST',
        url: '/auth/mfa/enable',
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          setupToken: setupPayload.setupToken,
          code: generateTotpCode(setupPayload.manualEntryKey),
        },
      });

      expect(enable.statusCode).toBe(200);

      await app.close();
      appClosed = true;

      const restartedApp = await createPersistentApp();
      let restartedAppClosed = false;

      try {
        const secondLogin = await restartedApp.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'mfa@iflabx.com',
            password: 'Secure123',
          },
        });

        expect(secondLogin.statusCode).toBe(401);
        expect(secondLogin.json()).toMatchObject({
          ok: false,
          error: {
            code: 'AUTH_MFA_REQUIRED',
          },
        });

        const ticket = secondLogin.json().error.details.ticket as string;
        const verify = await restartedApp.inject({
          method: 'POST',
          url: '/auth/mfa/verify',
          payload: {
            ticket,
            code: generateTotpCode(setupPayload.manualEntryKey),
          },
        });

        expect(verify.statusCode).toBe(200);

        const verifiedSessionToken = verify.json().data.sessionToken as string;
        const status = await restartedApp.inject({
          method: 'GET',
          url: '/auth/mfa/status',
          headers: {
            authorization: `Bearer ${verifiedSessionToken}`,
          },
        });

        expect(status.statusCode).toBe(200);
        expect(status.json()).toMatchObject({
          ok: true,
          data: {
            enabled: true,
          },
        });
      } finally {
        if (!restartedAppClosed) {
          await restartedApp.close();
          restartedAppClosed = true;
        }
      }
    } finally {
      if (!appClosed) {
        await app.close();
      }
    }
    },
    PERSISTENCE_TEST_TIMEOUT_MS
  );

  it(
    'persists invitation consumption and prevents token reuse after restart',
    async () => {
    await resetPersistentTestDatabase();

    const database = createPersistentTestDatabase();
    const authService = createPersistentAuthService(database, {
      defaultTenantId: PERSISTENT_TEST_ENV.defaultTenantId,
      defaultSsoUserStatus: PERSISTENT_TEST_ENV.defaultSsoUserStatus,
      lockoutThreshold: PERSISTENT_TEST_ENV.authLockoutThreshold,
      lockoutDurationMs: PERSISTENT_TEST_ENV.authLockoutDurationMs,
    });
    const invitation = await authService.seedInvitation({
      email: 'invitee@iflabx.com',
    });

    expect(invitation.ok).toBe(true);

    const app = await createPersistentApp();
    let appClosed = false;

    try {
      const accept = await app.inject({
        method: 'POST',
        url: '/auth/invitations/accept',
        payload: {
          token: invitation.data.token,
          password: 'Secure123',
          displayName: 'Invited User',
        },
      });

      expect(accept.statusCode).toBe(200);

      await app.close();
      appClosed = true;

      const restartedApp = await createPersistentApp();
      let restartedAppClosed = false;

      try {
        const secondAccept = await restartedApp.inject({
          method: 'POST',
          url: '/auth/invitations/accept',
          payload: {
            token: invitation.data.token,
            password: 'Secure123',
          },
        });

        expect(secondAccept.statusCode).toBe(404);

        const login = await restartedApp.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'invitee@iflabx.com',
            password: 'Secure123',
          },
        });

        expect(login.statusCode).toBe(200);
      } finally {
        if (!restartedAppClosed) {
          await restartedApp.close();
          restartedAppClosed = true;
        }
      }
    } finally {
      await database.end({ timeout: 5 });
      if (!appClosed) {
        await app.close();
      }
    }
    },
    PERSISTENCE_TEST_TIMEOUT_MS
  );
});
