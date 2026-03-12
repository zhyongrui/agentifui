import type { WorkspaceCatalogResponse } from '@agentifui/shared/apps';
import { randomUUID } from 'node:crypto';
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
      const loginPayload = login.json().data as {
        sessionToken: string;
        user: {
          id: string;
        };
      };
      const sessionToken = loginPayload.sessionToken;

      const runtimeDatabase = createPersistentTestDatabase();

      try {
        const [credentialAccount] = await runtimeDatabase<{
          account_id: string;
          provider_id: string;
        }[]>`
          select account_id, provider_id
          from better_auth_accounts
          where user_id = ${loginPayload.user.id}
          limit 1
        `;

        expect(credentialAccount).toMatchObject({
          account_id: loginPayload.user.id,
          provider_id: 'credential',
        });

        const [sessionRow] = await runtimeDatabase<{ token: string }[]>`
          select token
          from better_auth_sessions
          where user_id = ${loginPayload.user.id}
          limit 1
        `;

        expect(sessionRow?.token).toBe(sessionToken);
      } finally {
        await runtimeDatabase.end({ timeout: 5 });
      }

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

        const runtimeDatabase = createPersistentTestDatabase();

        try {
          const sessionRows = await runtimeDatabase<{ id: string }[]>`
            select id
            from better_auth_sessions
            where token = ${sessionToken}
          `;

          expect(sessionRows).toHaveLength(0);
        } finally {
          await runtimeDatabase.end({ timeout: 5 });
        }

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

  it(
    'seeds DB-backed workspace memberships and preserves app grants by user segment',
    async () => {
      await resetPersistentTestDatabase();

      const app = await createPersistentApp();
      let appClosed = false;

      try {
        const developerRegister = await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: 'developer@iflabx.com',
            password: 'Secure123',
            displayName: 'Developer',
          },
        });
        const securityRegister = await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: 'security-audit@iflabx.com',
            password: 'Secure123',
            displayName: 'Security Auditor',
          },
        });

        expect(developerRegister.statusCode).toBe(201);
        expect(securityRegister.statusCode).toBe(201);

        const developerLogin = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'developer@iflabx.com',
            password: 'Secure123',
          },
        });
        const securityLogin = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'security-audit@iflabx.com',
            password: 'Secure123',
          },
        });

        expect(developerLogin.statusCode).toBe(200);
        expect(securityLogin.statusCode).toBe(200);

        const developerPayload = developerLogin.json().data as {
          sessionToken: string;
          user: {
            id: string;
          };
        };
        const securityPayload = securityLogin.json().data as {
          sessionToken: string;
          user: {
            id: string;
          };
        };

        const developerWorkspace = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${developerPayload.sessionToken}`,
          },
        });
        const securityWorkspace = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${securityPayload.sessionToken}`,
          },
        });

        expect(developerWorkspace.statusCode).toBe(200);
        expect(developerWorkspace.json().data.memberGroupIds).toEqual([
          'grp_product',
          'grp_research',
        ]);
        expect(developerWorkspace.json().data.apps.map((workspaceApp: { id: string }) => workspaceApp.id)).toEqual([
          'app_market_brief',
          'app_service_copilot',
          'app_release_radar',
          'app_policy_watch',
          'app_runbook_mentor',
        ]);

        expect(securityWorkspace.statusCode).toBe(200);
        expect(securityWorkspace.json().data.memberGroupIds).toEqual(['grp_security']);
        expect(securityWorkspace.json().data.apps.map((workspaceApp: { id: string }) => workspaceApp.id)).toEqual([
          'app_audit_lens',
        ]);

        const runtimeDatabase = createPersistentTestDatabase();

        try {
          const developerMembershipRows = await runtimeDatabase<{
            group_id: string;
            is_primary: boolean;
          }[]>`
            select group_id, is_primary
            from group_members
            where user_id = ${developerPayload.user.id}
            order by is_primary desc, created_at asc
          `;
          const securityMembershipRows = await runtimeDatabase<{
            group_id: string;
            is_primary: boolean;
          }[]>`
            select group_id, is_primary
            from group_members
            where user_id = ${securityPayload.user.id}
            order by is_primary desc, created_at asc
          `;

          expect(developerMembershipRows).toEqual([
            {
              group_id: 'grp_product',
              is_primary: true,
            },
            {
              group_id: 'grp_research',
              is_primary: false,
            },
          ]);
          expect(securityMembershipRows).toEqual([
            {
              group_id: 'grp_security',
              is_primary: true,
            },
          ]);
        } finally {
          await runtimeDatabase.end({ timeout: 5 });
        }
      } finally {
        if (!appClosed) {
          await app.close();
          appClosed = true;
        }
      }
    },
    PERSISTENCE_TEST_TIMEOUT_MS
  );

  it(
    'applies role allow, user allow, and explicit deny precedence when building the workspace catalog',
    async () => {
      await resetPersistentTestDatabase();

      const app = await createPersistentApp();
      let appClosed = false;

      try {
        const adminRegister = await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: 'admin@iflabx.com',
            password: 'Secure123',
            displayName: 'Tenant Admin',
          },
        });
        const developerRegister = await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: 'developer@iflabx.com',
            password: 'Secure123',
            displayName: 'Developer',
          },
        });

        expect(adminRegister.statusCode).toBe(201);
        expect(developerRegister.statusCode).toBe(201);

        const adminLogin = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'admin@iflabx.com',
            password: 'Secure123',
          },
        });
        const developerLogin = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'developer@iflabx.com',
            password: 'Secure123',
          },
        });

        expect(adminLogin.statusCode).toBe(200);
        expect(developerLogin.statusCode).toBe(200);

        const adminSessionToken = adminLogin.json().data.sessionToken as string;
        const adminUserId = adminLogin.json().data.user.id as string;
        const developerSessionToken = developerLogin.json().data.sessionToken as string;
        const developerUserId = developerLogin.json().data.user.id as string;

        const adminWorkspace = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${adminSessionToken}`,
          },
        });

        expect(adminWorkspace.statusCode).toBe(200);

        const adminBody = adminWorkspace.json() as WorkspaceCatalogResponse;

        expect(adminBody.data.apps.map(workspaceApp => workspaceApp.id)).toEqual([
          'app_market_brief',
          'app_service_copilot',
          'app_release_radar',
          'app_policy_watch',
          'app_runbook_mentor',
          'app_tenant_control',
        ]);

        const runtimeDatabase = createPersistentTestDatabase();

        try {
          const adminRoles = await runtimeDatabase<{ role_id: string }[]>`
            select role_id
            from rbac_user_roles
            where user_id = ${adminUserId}
            order by created_at asc
          `;

          expect(adminRoles.map(role => role.role_id)).toEqual(['tenant_admin', 'user']);

          await runtimeDatabase`
            insert into workspace_app_access_grants (
              id,
              tenant_id,
              app_id,
              subject_type,
              subject_id,
              effect,
              reason,
              created_at,
              expires_at
            )
            values (
              ${randomUUID()},
              ${PERSISTENT_TEST_ENV.defaultTenantId},
              'app_audit_lens',
              'user',
              ${developerUserId},
              'allow',
              'temporary audit review',
              now(),
              now() + interval '7 days'
            )
          `;
          await runtimeDatabase`
            insert into workspace_app_access_grants (
              id,
              tenant_id,
              app_id,
              subject_type,
              subject_id,
              effect,
              reason,
              created_at
            )
            values (
              ${randomUUID()},
              ${PERSISTENT_TEST_ENV.defaultTenantId},
              'app_release_radar',
              'user',
              ${developerUserId},
              'deny',
              'release access paused',
              now()
            )
          `;
        } finally {
          await runtimeDatabase.end({ timeout: 5 });
        }

        const developerWorkspace = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${developerSessionToken}`,
          },
        });

        expect(developerWorkspace.statusCode).toBe(200);

        const developerBody = developerWorkspace.json() as WorkspaceCatalogResponse;

        expect(developerBody.data.memberGroupIds).toEqual(['grp_product', 'grp_research']);
        expect(developerBody.data.apps.map(workspaceApp => workspaceApp.id)).toEqual([
          'app_market_brief',
          'app_service_copilot',
          'app_policy_watch',
          'app_runbook_mentor',
          'app_audit_lens',
        ]);
        expect(
          developerBody.data.apps.find(workspaceApp => workspaceApp.id === 'app_audit_lens')
            ?.grantedGroupIds
        ).toEqual(['grp_product', 'grp_research']);
      } finally {
        if (!appClosed) {
          await app.close();
          appClosed = true;
        }
      }
    },
    PERSISTENCE_TEST_TIMEOUT_MS
  );

  it(
    'ignores expired user grants when calculating visible apps',
    async () => {
      await resetPersistentTestDatabase();

      const app = await createPersistentApp();
      let appClosed = false;

      try {
        const register = await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: 'developer@iflabx.com',
            password: 'Secure123',
            displayName: 'Developer',
          },
        });

        expect(register.statusCode).toBe(201);

        const login = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'developer@iflabx.com',
            password: 'Secure123',
          },
        });

        expect(login.statusCode).toBe(200);

        const sessionToken = login.json().data.sessionToken as string;
        const userId = login.json().data.user.id as string;

        const initialWorkspace = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${sessionToken}`,
          },
        });

        expect(initialWorkspace.statusCode).toBe(200);
        expect(
          (initialWorkspace.json() as WorkspaceCatalogResponse).data.apps.map(
            workspaceApp => workspaceApp.id
          )
        ).not.toContain('app_tenant_control');

        const runtimeDatabase = createPersistentTestDatabase();

        try {
          await runtimeDatabase`
            insert into workspace_app_access_grants (
              id,
              tenant_id,
              app_id,
              subject_type,
              subject_id,
              effect,
              reason,
              created_at,
              expires_at
            )
            values (
              ${randomUUID()},
              ${PERSISTENT_TEST_ENV.defaultTenantId},
              'app_tenant_control',
              'user',
              ${userId},
              'allow',
              'expired exception',
              now() - interval '3 days',
              now() - interval '1 day'
            )
          `;
        } finally {
          await runtimeDatabase.end({ timeout: 5 });
        }

        const workspaceAfterExpiredGrant = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${sessionToken}`,
          },
        });

        expect(workspaceAfterExpiredGrant.statusCode).toBe(200);
        expect(
          (workspaceAfterExpiredGrant.json() as WorkspaceCatalogResponse).data.apps.map(
            workspaceApp => workspaceApp.id
          )
        ).not.toContain('app_tenant_control');
      } finally {
        if (!appClosed) {
          await app.close();
          appClosed = true;
        }
      }
    },
    PERSISTENCE_TEST_TIMEOUT_MS
  );
});
