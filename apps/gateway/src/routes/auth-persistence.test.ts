import type {
  AdminAppsResponse,
  AdminAuditResponse,
  AdminGroupsResponse,
  AdminTenantCreateResponse,
  AdminTenantStatusUpdateResponse,
  AdminUsersResponse,
} from '@agentifui/shared/admin';
import type {
  WorkspaceAppLaunchResponse,
  WorkspaceCatalogResponse,
  WorkspaceConversationListResponse,
  WorkspaceConversationResponse,
  WorkspacePreferencesResponse,
  WorkspaceRunResponse,
} from '@agentifui/shared/apps';
import type { ChatCompletionResponse } from '@agentifui/shared/chat';
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

function normalizeStringArray(value: string[] | string) {
  if (Array.isArray(value)) {
    return value;
  }

  return JSON.parse(value) as string[];
}

const PERSISTENCE_TEST_TIMEOUT_MS = 120000;

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
        const developerWorkspaceBody = developerWorkspace.json() as WorkspaceCatalogResponse;

        expect(developerWorkspaceBody.data.memberGroupIds).toEqual([
          'grp_product',
          'grp_research',
        ]);
        expect(
          developerWorkspaceBody.data.apps.map((workspaceApp: { id: string }) => workspaceApp.id)
        ).toEqual([
          'app_market_brief',
          'app_service_copilot',
          'app_release_radar',
          'app_policy_watch',
          'app_runbook_mentor',
        ]);
        expect(developerWorkspaceBody.data.apps[0]?.tags).toEqual(['research', 'daily']);

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

  it(
    'persists workspace preferences across app restarts',
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

        const loginPayload = login.json().data as {
          sessionToken: string;
          user: {
            id: string;
          };
        };

        const update = await app.inject({
          method: 'PUT',
          url: '/workspace/preferences',
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
          payload: {
            favoriteAppIds: ['app_policy_watch'],
            recentAppIds: ['app_market_brief'],
            defaultActiveGroupId: 'grp_research',
          },
        });

        expect(update.statusCode).toBe(200);
        expect(update.json()).toEqual({
          ok: true,
          data: {
            favoriteAppIds: ['app_policy_watch'],
            recentAppIds: ['app_market_brief'],
            defaultActiveGroupId: 'grp_research',
            updatedAt: expect.any(String),
          },
        } satisfies WorkspacePreferencesResponse);

        const runtimeDatabase = createPersistentTestDatabase();

        try {
          const [row] = await runtimeDatabase<{
            default_active_group_id: string | null;
            favorite_app_ids: string[] | string;
            recent_app_ids: string[] | string;
          }[]>`
            select
              favorite_app_ids,
              recent_app_ids,
              default_active_group_id
            from workspace_user_preferences
            where user_id = ${loginPayload.user.id}
            limit 1
          `;

          expect(row).toBeDefined();

          if (!row) {
            throw new Error('expected workspace preferences row to exist');
          }

          expect(normalizeStringArray(row.favorite_app_ids)).toEqual(['app_policy_watch']);
          expect(normalizeStringArray(row.recent_app_ids)).toEqual(['app_market_brief']);
          expect(row.default_active_group_id).toBe('grp_research');
        } finally {
          await runtimeDatabase.end({ timeout: 5 });
        }

        await app.close();
        appClosed = true;

        const restartedApp = await createPersistentApp();
        let restartedAppClosed = false;

        try {
          const catalog = await restartedApp.inject({
            method: 'GET',
            url: '/workspace/apps',
            headers: {
              authorization: `Bearer ${loginPayload.sessionToken}`,
            },
          });

          expect(catalog.statusCode).toBe(200);
          expect((catalog.json() as WorkspaceCatalogResponse).data).toMatchObject({
            defaultActiveGroupId: 'grp_research',
            favoriteAppIds: ['app_policy_watch'],
            recentAppIds: ['app_market_brief'],
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
          appClosed = true;
        }
      }
    },
    PERSISTENCE_TEST_TIMEOUT_MS
  );

  it(
    'stores launch handoffs and updates recents in persistent workspace state',
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

        const loginPayload = login.json().data as {
          sessionToken: string;
          user: {
            id: string;
          };
        };

        const launch = await app.inject({
          method: 'POST',
          url: '/workspace/apps/launch',
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
          payload: {
            appId: 'app_policy_watch',
            activeGroupId: 'grp_research',
          },
        });

        expect(launch.statusCode).toBe(200);

        const launchBody = launch.json() as WorkspaceAppLaunchResponse;

        expect(launchBody).toMatchObject({
          ok: true,
          data: {
            status: 'conversation_ready',
            conversationId: expect.any(String),
            runId: expect.any(String),
            traceId: expect.any(String),
            app: {
              id: 'app_policy_watch',
            },
            attributedGroup: {
              id: 'grp_research',
            },
          },
        });

        const conversationId = launchBody.data.conversationId;
        const runId = launchBody.data.runId;
        const traceId = launchBody.data.traceId;

        expect(conversationId).toBeTruthy();
        expect(runId).toBeTruthy();
        expect(traceId).toBeTruthy();

        if (!conversationId || !runId || !traceId) {
          throw new Error('expected launch payload to include conversation, run and trace ids');
        }

        const runtimeDatabase = createPersistentTestDatabase();

        try {
          const [launchRow] = await runtimeDatabase<{
            app_id: string;
            attributed_group_id: string;
            conversation_id: string | null;
            launch_url: string;
            run_id: string | null;
            status: string;
            trace_id: string | null;
          }[]>`
            select app_id, attributed_group_id, status, launch_url, conversation_id, run_id, trace_id
            from workspace_app_launches
            where id = ${launchBody.data.id}
            limit 1
          `;
          const [preferencesRow] = await runtimeDatabase<{
            recent_app_ids: string[] | string;
          }[]>`
            select recent_app_ids
            from workspace_user_preferences
            where user_id = ${loginPayload.user.id}
            limit 1
          `;

          expect(launchRow).toEqual({
            app_id: 'app_policy_watch',
            attributed_group_id: 'grp_research',
            conversation_id: conversationId,
            run_id: runId,
            trace_id: traceId,
            status: 'conversation_ready',
            launch_url: launchBody.data.launchUrl,
          });

          expect(preferencesRow).toBeDefined();

          if (!preferencesRow) {
            throw new Error('expected workspace preferences row to exist');
          }

          expect(normalizeStringArray(preferencesRow.recent_app_ids)).toEqual([
            'app_policy_watch',
          ]);
        } finally {
          await runtimeDatabase.end({ timeout: 5 });
        }

        const conversation = await app.inject({
          method: 'GET',
          url: `/workspace/conversations/${conversationId}`,
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
        });

        expect(conversation.statusCode).toBe(200);
        expect(conversation.json()).toEqual({
          ok: true,
          data: {
            id: conversationId,
            title: 'Policy Watch',
            status: 'active',
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            launchId: launchBody.data.id,
            app: {
              id: 'app_policy_watch',
              slug: 'policy-watch',
              name: 'Policy Watch',
              summary: '跟踪政策变化、合规要求和影响说明。',
              kind: 'governance',
              status: 'ready',
              shortCode: 'PW',
            },
            activeGroup: {
              id: 'grp_research',
              name: 'Research Lab',
              description: '负责分析洞察、策略研究和知识整理。',
            },
            messages: [],
            run: {
              id: runId,
              type: 'agent',
              status: 'pending',
              triggeredFrom: 'app_launch',
              traceId,
              createdAt: expect.any(String),
              finishedAt: null,
              elapsedTime: 0,
              totalTokens: 0,
              totalSteps: 0,
            },
          },
        } satisfies WorkspaceConversationResponse);
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
    'persists chat completion run updates and keeps the trace id stable',
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

        const loginPayload = login.json().data as {
          sessionToken: string;
          user: {
            id: string;
          };
        };

        const launch = await app.inject({
          method: 'POST',
          url: '/workspace/apps/launch',
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
          payload: {
            appId: 'app_policy_watch',
            activeGroupId: 'grp_research',
          },
        });

        expect(launch.statusCode).toBe(200);

        const launchBody = launch.json() as WorkspaceAppLaunchResponse;

        const catalogAfterLaunch = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
        });

        expect(catalogAfterLaunch.statusCode).toBe(200);
        expect((catalogAfterLaunch.json() as WorkspaceCatalogResponse).data.quotaUsagesByGroupId).toMatchObject({
          grp_research: [
            expect.objectContaining({
              scope: 'tenant',
              used: 845,
            }),
            expect.objectContaining({
              scope: 'group',
              scopeId: 'grp_research',
              used: 785,
            }),
            expect.objectContaining({
              scope: 'user',
              used: 635,
            }),
          ],
        });

        const completion = await app.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
          payload: {
            app_id: 'app_policy_watch',
            conversation_id: launchBody.data.conversationId,
            messages: [
              {
                role: 'user',
                content: 'Summarize the new policy updates.',
              },
            ],
          },
        });

        expect(completion.statusCode).toBe(200);
        expect(completion.headers['x-trace-id']).toBe(launchBody.data.traceId);

        const completionBody = completion.json() as ChatCompletionResponse;

        expect(completionBody).toMatchObject({
          id: launchBody.data.runId,
          conversation_id: launchBody.data.conversationId,
          trace_id: launchBody.data.traceId,
          metadata: {
            app_id: 'app_policy_watch',
            run_id: launchBody.data.runId,
            active_group_id: 'grp_research',
          },
        });

        const runtimeDatabase = createPersistentTestDatabase();

        try {
          const [runRow] = await runtimeDatabase<{
            elapsed_time: number;
            outputs: Record<string, unknown> | string;
            status: string;
            total_tokens: number;
            trace_id: string;
          }[]>`
            select status, trace_id, total_tokens, elapsed_time, outputs
            from runs
            where id = ${launchBody.data.runId}
            limit 1
          `;

          expect(runRow).toBeDefined();

          if (!runRow) {
            throw new Error('expected run row to exist');
          }

          const outputs =
            typeof runRow.outputs === 'string'
              ? (JSON.parse(runRow.outputs) as Record<string, unknown>)
              : runRow.outputs;

          expect(runRow.status).toBe('succeeded');
          expect(runRow.trace_id).toBe(launchBody.data.traceId);
          expect(runRow.total_tokens).toBeGreaterThan(0);
          expect(runRow.elapsed_time).toBeGreaterThanOrEqual(0);
          expect(outputs).toMatchObject({
            assistant: {
              content: expect.stringContaining('Policy Watch is now reachable through the AgentifUI gateway.'),
              finishReason: 'stop',
            },
          });
        } finally {
          await runtimeDatabase.end({ timeout: 5 });
        }

        const conversation = await app.inject({
          method: 'GET',
          url: `/workspace/conversations/${launchBody.data.conversationId}`,
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
        });

        expect(conversation.statusCode).toBe(200);
        expect((conversation.json() as WorkspaceConversationResponse).data).toMatchObject({
          run: {
            status: 'succeeded',
          },
          messages: [
            {
              role: 'user',
              content: 'Summarize the new policy updates.',
              status: 'completed',
            },
            {
              role: 'assistant',
              content: expect.stringContaining(
                'Policy Watch is now reachable through the AgentifUI gateway.'
              ),
              status: 'completed',
            },
          ],
        });

        const history = await app.inject({
          method: 'GET',
          url: '/workspace/conversations?appId=app_policy_watch&groupId=grp_research&q=policy updates',
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
        });

        expect(history.statusCode).toBe(200);
        expect((history.json() as WorkspaceConversationListResponse).data.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: launchBody.data.conversationId,
              messageCount: 2,
              activeGroup: expect.objectContaining({
                id: 'grp_research',
              }),
              app: expect.objectContaining({
                id: 'app_policy_watch',
              }),
            }),
          ])
        );

        const run = await app.inject({
          method: 'GET',
          url: `/workspace/runs/${launchBody.data.runId}`,
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
        });

        expect(run.statusCode).toBe(200);
        expect((run.json() as WorkspaceRunResponse).data.timeline).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: 'run_created' }),
            expect.objectContaining({ type: 'input_recorded' }),
            expect.objectContaining({ type: 'run_started' }),
            expect.objectContaining({ type: 'output_recorded' }),
            expect.objectContaining({ type: 'run_succeeded' }),
          ])
        );

        const catalogAfterCompletion = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
        });
        const catalogAfterCompletionBody = catalogAfterCompletion.json() as WorkspaceCatalogResponse;
        const researchQuotaUsages = catalogAfterCompletionBody.data.quotaUsagesByGroupId.grp_research;

        expect(researchQuotaUsages).toBeDefined();

        if (!researchQuotaUsages) {
          throw new Error('expected research quota usage to be present');
        }

        const researchQuotaAfterCompletion = researchQuotaUsages.find(
          usage => usage.scope === 'group'
        );

        expect(catalogAfterCompletion.statusCode).toBe(200);
        expect(researchQuotaUsages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              scope: 'group',
              used: expect.any(Number),
            }),
            expect.objectContaining({
              scope: 'tenant',
              used: expect.any(Number),
            }),
            expect.objectContaining({
              scope: 'user',
              used: expect.any(Number),
            }),
          ])
        );
        expect(researchQuotaAfterCompletion?.used ?? 0).toBeGreaterThan(785);

        const auditEvents = await app.inject({
          method: 'GET',
          url: '/auth/audit-events',
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
        });

        expect(auditEvents.statusCode).toBe(200);
        expect(auditEvents.json().data.events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'workspace.quota.usage_recorded',
              entityId: launchBody.data.runId,
            }),
          ])
        );
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
    'creates and exposes a new persisted run for the next completion on the same conversation',
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

        const loginPayload = login.json().data as {
          sessionToken: string;
        };

        const launch = await app.inject({
          method: 'POST',
          url: '/workspace/apps/launch',
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
          payload: {
            appId: 'app_policy_watch',
            activeGroupId: 'grp_research',
          },
        });

        expect(launch.statusCode).toBe(200);

        const launchBody = launch.json() as WorkspaceAppLaunchResponse;

        const firstCompletion = await app.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
          payload: {
            app_id: 'app_policy_watch',
            conversation_id: launchBody.data.conversationId,
            messages: [
              {
                role: 'user',
                content: 'Summarize the new policy updates.',
              },
            ],
          },
        });

        expect(firstCompletion.statusCode).toBe(200);

        const firstBody = firstCompletion.json() as ChatCompletionResponse;

        const secondCompletion = await app.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
          payload: {
            app_id: 'app_policy_watch',
            conversation_id: launchBody.data.conversationId,
            messages: [
              {
                role: 'user',
                content: 'Summarize the new policy updates.',
              },
              {
                role: 'assistant',
                content: firstBody.choices[0]?.message.content ?? '',
              },
              {
                role: 'user',
                content: 'Tell me what changed from the previous answer.',
              },
            ],
          },
        });

        expect(secondCompletion.statusCode).toBe(200);

        const secondBody = secondCompletion.json() as ChatCompletionResponse;

        expect(secondBody.id).not.toBe(launchBody.data.runId);
        expect(secondBody.trace_id).not.toBe(launchBody.data.traceId);
        expect(secondBody.metadata?.run_id).toBe(secondBody.id);

        const runsResponse = await app.inject({
          method: 'GET',
          url: `/workspace/conversations/${launchBody.data.conversationId}/runs`,
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
        });

        expect(runsResponse.statusCode).toBe(200);
        expect(
          (runsResponse.json() as { data: { runs: Array<{ id: string; triggeredFrom: string }> } }).data
            .runs
        ).toEqual([
          expect.objectContaining({
            id: secondBody.id,
            triggeredFrom: 'chat_completion',
          }),
          expect.objectContaining({
            id: launchBody.data.runId,
            triggeredFrom: 'app_launch',
          }),
        ]);

        const runResponse = await app.inject({
          method: 'GET',
          url: `/workspace/runs/${secondBody.id}`,
          headers: {
            authorization: `Bearer ${loginPayload.sessionToken}`,
          },
        });

        expect(runResponse.statusCode).toBe(200);
        expect((runResponse.json() as { data: Record<string, unknown> }).data).toMatchObject({
          id: secondBody.id,
          conversationId: launchBody.data.conversationId,
          status: 'succeeded',
          triggeredFrom: 'chat_completion',
          usage: {
            totalTokens: expect.any(Number),
          },
        });

        const runtimeDatabase = createPersistentTestDatabase();

        try {
          const rows = await runtimeDatabase<{
            id: string;
            trace_id: string;
            triggered_from: string;
          }[]>`
            select id, trace_id, triggered_from
            from runs
            where conversation_id = ${launchBody.data.conversationId}
            order by created_at desc
            limit 2
          `;

          expect(rows).toEqual([
            {
              id: secondBody.id,
              trace_id: secondBody.trace_id,
              triggered_from: 'chat_completion',
            },
            {
              id: launchBody.data.runId!,
              trace_id: launchBody.data.traceId!,
              triggered_from: 'app_launch',
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
    'returns persisted admin governance data for tenant admins',
    async () => {
      await resetPersistentTestDatabase();

      const app = await createPersistentApp();
      let appClosed = false;

      try {
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: 'admin@iflabx.com',
            password: 'Secure123',
            displayName: 'Admin User',
          },
        });
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: 'developer@iflabx.com',
            password: 'Secure123',
            displayName: 'Developer User',
          },
        });

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
        const developerSessionToken = developerLogin.json().data.sessionToken as string;

        const [adminWorkspace, developerWorkspace] = await Promise.all([
          app.inject({
            method: 'GET',
            url: '/workspace/apps',
            headers: {
              authorization: `Bearer ${adminSessionToken}`,
            },
          }),
          app.inject({
            method: 'GET',
            url: '/workspace/apps',
            headers: {
              authorization: `Bearer ${developerSessionToken}`,
            },
          }),
        ]);

        expect(adminWorkspace.statusCode).toBe(200);
        expect(developerWorkspace.statusCode).toBe(200);

        const adminWorkspaceBody = adminWorkspace.json() as WorkspaceCatalogResponse;

        expect(adminWorkspaceBody.data.apps.map(workspaceApp => workspaceApp.id)).toContain(
          'app_tenant_control'
        );

        const launch = await app.inject({
          method: 'POST',
          url: '/workspace/apps/launch',
          headers: {
            authorization: `Bearer ${adminSessionToken}`,
          },
          payload: {
            appId: 'app_tenant_control',
            activeGroupId: adminWorkspaceBody.data.defaultActiveGroupId,
          },
        });

        expect(launch.statusCode).toBe(200);
        const launchBody = launch.json() as WorkspaceAppLaunchResponse;
        expect(launchBody.data.app.id).toBe('app_tenant_control');
        expect(launchBody.data.runId).toBeTruthy();
        expect(launchBody.data.traceId).toBeTruthy();
        expect(launchBody.data.conversationId).toBeTruthy();

        const [usersResponse, groupsResponse, appsResponse, auditResponse, filteredAuditResponse, exportResponse] =
          await Promise.all([
            app.inject({
              method: 'GET',
              url: '/admin/users',
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
            app.inject({
              method: 'GET',
              url: '/admin/groups',
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
            app.inject({
              method: 'GET',
              url: '/admin/apps',
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
            app.inject({
              method: 'GET',
              url: '/admin/audit',
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
            app.inject({
              method: 'GET',
              url: `/admin/audit?action=workspace.app.launched&traceId=${launchBody.data.traceId}`,
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
            app.inject({
              method: 'GET',
              url: `/admin/audit/export?format=json&action=workspace.app.launched&traceId=${launchBody.data.traceId}`,
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
          ]);

        expect(usersResponse.statusCode).toBe(200);
        expect(groupsResponse.statusCode).toBe(200);
        expect(appsResponse.statusCode).toBe(200);
        expect(auditResponse.statusCode).toBe(200);
        expect(filteredAuditResponse.statusCode).toBe(200);
        expect(exportResponse.statusCode).toBe(200);

        const usersBody = usersResponse.json() as AdminUsersResponse;
        const groupsBody = groupsResponse.json() as AdminGroupsResponse;
        const appsBody = appsResponse.json() as AdminAppsResponse;
        const auditBody = auditResponse.json() as AdminAuditResponse;
        const filteredAuditBody = filteredAuditResponse.json() as AdminAuditResponse;

        expect(usersBody.data.users.map(user => user.email)).toEqual(
          expect.arrayContaining(['admin@iflabx.com', 'developer@iflabx.com'])
        );
        expect(
          usersBody.data.users.find(user => user.email === 'admin@iflabx.com')?.roleIds
        ).toEqual(expect.arrayContaining(['tenant_admin', 'user']));
        expect(groupsBody.data.groups.find(group => group.id === 'grp_product')?.memberCount).toBe(
          2
        );
        expect(
          appsBody.data.apps.find(app => app.id === 'app_tenant_control')
        ).toMatchObject({
          grantedRoleIds: ['tenant_admin'],
          launchCount: 1,
        });
        expect(auditBody.data.countsByAction).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'auth.login.succeeded',
            }),
            expect.objectContaining({
              action: 'workspace.app.launched',
            }),
          ])
        );
        expect(auditBody.data.events[0]?.occurredAt).toBeTruthy();
        expect(filteredAuditBody.data.appliedFilters).toMatchObject({
          action: 'workspace.app.launched',
          traceId: launchBody.data.traceId,
          payloadMode: 'masked',
        });
        expect(filteredAuditBody.data.events).toEqual([
          expect.objectContaining({
            action: 'workspace.app.launched',
            entityType: 'run',
            entityId: launchBody.data.runId,
            context: expect.objectContaining({
              traceId: launchBody.data.traceId,
              runId: launchBody.data.runId,
              conversationId: launchBody.data.conversationId,
              appId: 'app_tenant_control',
              appName: 'Tenant Control',
            }),
            payload: expect.objectContaining({
              activeGroupId: adminWorkspaceBody.data.defaultActiveGroupId,
            }),
            payloadInspection: expect.objectContaining({
              mode: 'masked',
              containsSensitiveData: false,
            }),
          }),
        ]);
        expect(exportResponse.headers['content-type']).toContain('application/json');
        expect(exportResponse.headers['x-agentifui-export-format']).toBe('json');
        expect(JSON.parse(exportResponse.body)).toMatchObject({
          metadata: {
            format: 'json',
            eventCount: 1,
            appliedFilters: {
              action: 'workspace.app.launched',
              traceId: launchBody.data.traceId,
              payloadMode: 'masked',
              limit: 1000,
            },
          },
          events: [
            expect.objectContaining({
              action: 'workspace.app.launched',
              context: expect.objectContaining({
                traceId: launchBody.data.traceId,
                runId: launchBody.data.runId,
              }),
            }),
          ],
        });

        const forbiddenResponse = await app.inject({
          method: 'GET',
          url: '/admin/users',
          headers: {
            authorization: `Bearer ${developerSessionToken}`,
          },
        });

        expect(forbiddenResponse.statusCode).toBe(403);
        expect(forbiddenResponse.json()).toMatchObject({
          ok: false,
          error: {
            code: 'ADMIN_FORBIDDEN',
          },
        });
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
    'persists direct admin app grants into workspace visibility and audit history',
    async () => {
      await resetPersistentTestDatabase();

      const app = await createPersistentApp();
      let appClosed = false;

      try {
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: 'admin@iflabx.com',
            password: 'Secure123',
            displayName: 'Tenant Admin',
          },
        });
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: 'developer@iflabx.com',
            password: 'Secure123',
            displayName: 'Developer User',
          },
        });

        const [adminLogin, developerLogin] = await Promise.all([
          app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: {
              email: 'admin@iflabx.com',
              password: 'Secure123',
            },
          }),
          app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: {
              email: 'developer@iflabx.com',
              password: 'Secure123',
            },
          }),
        ]);

        expect(adminLogin.statusCode).toBe(200);
        expect(developerLogin.statusCode).toBe(200);

        const adminSessionToken = adminLogin.json().data.sessionToken as string;
        const developerSessionToken = developerLogin.json().data.sessionToken as string;

        const developerWorkspaceBeforeGrant = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${developerSessionToken}`,
          },
        });

        expect(developerWorkspaceBeforeGrant.statusCode).toBe(200);
        expect(
          (developerWorkspaceBeforeGrant.json() as WorkspaceCatalogResponse).data.apps.map(
            workspaceApp => workspaceApp.id
          )
        ).not.toContain('app_tenant_control');

        const createGrantResponse = await app.inject({
          method: 'POST',
          url: '/admin/apps/app_tenant_control/grants',
          headers: {
            authorization: `Bearer ${adminSessionToken}`,
          },
          payload: {
            subjectUserEmail: 'developer@iflabx.com',
            effect: 'allow',
            reason: 'Break glass access',
          },
        });

        expect(createGrantResponse.statusCode).toBe(200);
        const createdGrantId = createGrantResponse.json().data.grant.id as string;

        const [
          developerWorkspaceAfterGrant,
          adminAppsAfterGrant,
          adminAuditAfterGrant,
          adminAuditAfterGrantRaw,
          adminAuditExportAfterGrant,
        ] =
          await Promise.all([
            app.inject({
              method: 'GET',
              url: '/workspace/apps',
              headers: {
                authorization: `Bearer ${developerSessionToken}`,
              },
            }),
            app.inject({
              method: 'GET',
              url: '/admin/apps',
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
            app.inject({
              method: 'GET',
              url: '/admin/audit',
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
            app.inject({
              method: 'GET',
              url: '/admin/audit?action=admin.workspace_grant.created&payloadMode=raw',
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
            app.inject({
              method: 'GET',
              url: '/admin/audit/export?format=json&action=admin.workspace_grant.created&payloadMode=raw',
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
          ]);

        expect(developerWorkspaceAfterGrant.statusCode).toBe(200);
        expect(
          (developerWorkspaceAfterGrant.json() as WorkspaceCatalogResponse).data.apps.map(
            workspaceApp => workspaceApp.id
          )
        ).toContain('app_tenant_control');

        const appsAfterGrantBody = adminAppsAfterGrant.json() as AdminAppsResponse;
        expect(
          appsAfterGrantBody.data.apps.find(appSummary => appSummary.id === 'app_tenant_control')
        ).toMatchObject({
          directUserGrantCount: 1,
          userGrants: [
            expect.objectContaining({
              id: createdGrantId,
              effect: 'allow',
              user: expect.objectContaining({
                email: 'developer@iflabx.com',
              }),
            }),
          ],
        });

        const auditAfterGrantBody = adminAuditAfterGrant.json() as AdminAuditResponse;
        const auditAfterGrantRawBody = adminAuditAfterGrantRaw.json() as AdminAuditResponse;
        expect(adminAuditAfterGrant.statusCode).toBe(200);
        expect(adminAuditAfterGrantRaw.statusCode).toBe(200);
        expect(adminAuditExportAfterGrant.statusCode).toBe(200);
        expect(auditAfterGrantBody.data.countsByAction).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'admin.workspace_grant.created',
            }),
          ])
        );
        expect(auditAfterGrantBody.data.events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'admin.workspace_grant.created',
              payload: expect.objectContaining({
                appId: 'app_tenant_control',
                subjectUserEmail: 'd********@iflabx.com',
              }),
              payloadInspection: expect.objectContaining({
                mode: 'masked',
                containsSensitiveData: true,
                moderateMatchCount: 1,
              }),
            }),
          ])
        );
        expect(auditAfterGrantRawBody.data.appliedFilters).toMatchObject({
          action: 'admin.workspace_grant.created',
          payloadMode: 'raw',
        });
        expect(auditAfterGrantRawBody.data.events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'admin.workspace_grant.created',
              payload: expect.objectContaining({
                subjectUserEmail: 'developer@iflabx.com',
              }),
              payloadInspection: expect.objectContaining({
                mode: 'raw',
                containsSensitiveData: true,
                moderateMatchCount: 1,
              }),
            }),
          ])
        );
        expect(JSON.parse(adminAuditExportAfterGrant.body)).toMatchObject({
          metadata: {
            appliedFilters: {
              action: 'admin.workspace_grant.created',
              payloadMode: 'raw',
              limit: 1000,
            },
          },
          events: [
            expect.objectContaining({
              action: 'admin.workspace_grant.created',
              payload: expect.objectContaining({
                subjectUserEmail: 'developer@iflabx.com',
              }),
            }),
          ],
        });

        const revokeGrantResponse = await app.inject({
          method: 'DELETE',
          url: `/admin/apps/app_tenant_control/grants/${createdGrantId}`,
          headers: {
            authorization: `Bearer ${adminSessionToken}`,
          },
        });

        expect(revokeGrantResponse.statusCode).toBe(200);

        const [developerWorkspaceAfterRevoke, adminAppsAfterRevoke, adminAuditAfterRevoke] =
          await Promise.all([
            app.inject({
              method: 'GET',
              url: '/workspace/apps',
              headers: {
                authorization: `Bearer ${developerSessionToken}`,
              },
            }),
            app.inject({
              method: 'GET',
              url: '/admin/apps',
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
            app.inject({
              method: 'GET',
              url: '/admin/audit',
              headers: {
                authorization: `Bearer ${adminSessionToken}`,
              },
            }),
          ]);

        expect(developerWorkspaceAfterRevoke.statusCode).toBe(200);
        expect(
          (developerWorkspaceAfterRevoke.json() as WorkspaceCatalogResponse).data.apps.map(
            workspaceApp => workspaceApp.id
          )
        ).not.toContain('app_tenant_control');

        const appsAfterRevokeBody = adminAppsAfterRevoke.json() as AdminAppsResponse;
        expect(
          appsAfterRevokeBody.data.apps.find(appSummary => appSummary.id === 'app_tenant_control')
        ).toMatchObject({
          directUserGrantCount: 0,
          userGrants: [],
        });

        const auditAfterRevokeBody = adminAuditAfterRevoke.json() as AdminAuditResponse;
        expect(auditAfterRevokeBody.data.countsByAction).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'admin.workspace_grant.revoked',
            }),
          ])
        );
        expect(auditAfterRevokeBody.data.events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'admin.workspace_grant.revoked',
              payload: expect.objectContaining({
                appId: 'app_tenant_control',
                subjectUserEmail: 'd********@iflabx.com',
                grantId: createdGrantId,
              }),
              payloadInspection: expect.objectContaining({
                mode: 'masked',
                containsSensitiveData: true,
                moderateMatchCount: 1,
              }),
            }),
          ])
        );
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
    'persists platform tenant lifecycle and enforces suspended tenant access boundaries',
    async () => {
      await resetPersistentTestDatabase();

      const app = await createPersistentApp();
      let appClosed = false;

      try {
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: {
            email: 'root-admin@iflabx.com',
            password: 'Secure123',
            displayName: 'Root Admin',
          },
        });

        const rootAdminLogin = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'root-admin@iflabx.com',
            password: 'Secure123',
          },
        });

        expect(rootAdminLogin.statusCode).toBe(200);
        const rootAdminSessionToken = rootAdminLogin.json().data.sessionToken as string;

        const createTenantResponse = await app.inject({
          method: 'POST',
          url: '/admin/tenants',
          headers: {
            authorization: `Bearer ${rootAdminSessionToken}`,
          },
          payload: {
            name: 'Acme Platform',
            slug: 'acme-platform',
            adminEmail: 'owner@acme.example',
            adminDisplayName: 'Acme Owner',
          },
        });

        expect(createTenantResponse.statusCode).toBe(200);
        const createdTenantBody = createTenantResponse.json() as AdminTenantCreateResponse;
        expect(createdTenantBody.data.tenant).toMatchObject({
          id: 'tenant-acme-platform',
          slug: 'acme-platform',
          status: 'active',
          groupCount: 3,
          appCount: 7,
          adminCount: 1,
          primaryAdmin: {
            email: 'owner@acme.example',
          },
        });

        const runtimeDatabase = createPersistentTestDatabase();

        try {
          const [groupCounts, appCounts, quotaCounts, roleRows, auditRows] = await Promise.all([
            runtimeDatabase<{ count: number }[]>`
              select count(*)::int as count
              from groups
              where tenant_id = 'tenant-acme-platform'
            `,
            runtimeDatabase<{ count: number }[]>`
              select count(*)::int as count
              from workspace_apps
              where tenant_id = 'tenant-acme-platform'
            `,
            runtimeDatabase<{ count: number }[]>`
              select count(*)::int as count
              from workspace_quota_limits
              where tenant_id = 'tenant-acme-platform'
            `,
            runtimeDatabase<{ role_id: string }[]>`
              select role_id
              from rbac_user_roles
              where tenant_id = 'tenant-acme-platform'
              order by role_id asc
            `,
            runtimeDatabase<{ action: string }[]>`
              select action
              from audit_events
              where tenant_id = 'tenant-acme-platform'
                and entity_id = 'tenant-acme-platform'
              order by occurred_at asc
            `,
          ]);

          expect(groupCounts[0]?.count).toBe(3);
          expect(appCounts[0]?.count).toBe(7);
          expect(quotaCounts[0]?.count).toBe(4);
          expect(roleRows.map(row => row.role_id)).toEqual(['tenant_admin', 'user']);
          expect(auditRows).toEqual([
            {
              action: 'admin.tenant.created',
            },
          ]);
        } finally {
          await runtimeDatabase.end({ timeout: 5 });
        }

        const acceptInvitationResponse = await app.inject({
          method: 'POST',
          url: '/auth/invitations/accept',
          payload: {
            token: createdTenantBody.data.bootstrapInvitation.inviteToken,
            password: 'Secure123',
            displayName: 'Acme Owner Activated',
          },
        });

        expect(acceptInvitationResponse.statusCode).toBe(200);
        expect(acceptInvitationResponse.json().data.user).toMatchObject({
          tenantId: 'tenant-acme-platform',
          email: 'owner@acme.example',
          status: 'active',
        });

        const tenantAdminLogin = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'owner@acme.example',
            password: 'Secure123',
          },
        });

        expect(tenantAdminLogin.statusCode).toBe(200);
        const tenantAdminSessionToken = tenantAdminLogin.json().data.sessionToken as string;

        const tenantWorkspaceBeforeSuspend = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${tenantAdminSessionToken}`,
          },
        });

        expect(tenantWorkspaceBeforeSuspend.statusCode).toBe(200);
        expect(
          (tenantWorkspaceBeforeSuspend.json() as WorkspaceCatalogResponse).data.apps.map(
            workspaceApp => workspaceApp.name
          )
        ).toContain('Tenant Control');

        const suspendTenantResponse = await app.inject({
          method: 'PUT',
          url: '/admin/tenants/tenant-acme-platform/status',
          headers: {
            authorization: `Bearer ${rootAdminSessionToken}`,
          },
          payload: {
            status: 'suspended',
            reason: 'maintenance window',
          },
        });

        expect(suspendTenantResponse.statusCode).toBe(200);
        expect((suspendTenantResponse.json() as AdminTenantStatusUpdateResponse).data).toMatchObject({
          previousStatus: 'active',
          tenant: {
            status: 'suspended',
          },
        });

        const tenantWorkspaceAfterSuspend = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${tenantAdminSessionToken}`,
          },
        });

        expect(tenantWorkspaceAfterSuspend.statusCode).toBe(403);
        expect(tenantWorkspaceAfterSuspend.json()).toMatchObject({
          ok: false,
          error: {
            code: 'WORKSPACE_FORBIDDEN',
            details: {
              status: 'suspended',
            },
          },
        });

        const tenantLoginWhileSuspended = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: 'owner@acme.example',
            password: 'Secure123',
          },
        });

        expect(tenantLoginWhileSuspended.statusCode).toBe(403);
        expect(tenantLoginWhileSuspended.json()).toMatchObject({
          ok: false,
          error: {
            code: 'AUTH_FORBIDDEN',
            details: {
              tenantStatus: 'suspended',
            },
          },
        });

        const reactivateTenantResponse = await app.inject({
          method: 'PUT',
          url: '/admin/tenants/tenant-acme-platform/status',
          headers: {
            authorization: `Bearer ${rootAdminSessionToken}`,
          },
          payload: {
            status: 'active',
            reason: 'maintenance complete',
          },
        });

        expect(reactivateTenantResponse.statusCode).toBe(200);
        expect((reactivateTenantResponse.json() as AdminTenantStatusUpdateResponse).data).toMatchObject({
          previousStatus: 'suspended',
          tenant: {
            status: 'active',
          },
        });

        const tenantWorkspaceAfterReactivate = await app.inject({
          method: 'GET',
          url: '/workspace/apps',
          headers: {
            authorization: `Bearer ${tenantAdminSessionToken}`,
          },
        });

        expect(tenantWorkspaceAfterReactivate.statusCode).toBe(200);

        const verificationDatabase = createPersistentTestDatabase();

        try {
          const lifecycleAuditRows = await verificationDatabase<{ action: string }[]>`
            select action
            from audit_events
            where tenant_id = 'tenant-acme-platform'
              and entity_id = 'tenant-acme-platform'
            order by occurred_at asc
          `;

          expect(lifecycleAuditRows).toEqual([
            {
              action: 'admin.tenant.created',
            },
            {
              action: 'admin.tenant.suspended',
            },
            {
              action: 'admin.tenant.reactivated',
            },
          ]);
        } finally {
          await verificationDatabase.end({ timeout: 5 });
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
});
