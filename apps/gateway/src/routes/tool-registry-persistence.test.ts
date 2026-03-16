import type { AdminAppsResponse, AdminAppToolUpdateResponse } from '@agentifui/shared/admin';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import {
  createPersistentTestDatabase,
  PERSISTENT_TEST_ENV,
  resetPersistentTestDatabase,
} from '../test/persistent-db.js';

async function createPersistentApp(overrides: Record<string, unknown> = {}) {
  return buildApp(PERSISTENT_TEST_ENV, {
    logger: false,
    ...overrides,
  });
}

describe.sequential('persistent tool registry', () => {
  it('persists tenant app tool overrides across app restarts', async () => {
    await resetPersistentTestDatabase();

    const app = await createPersistentApp();
    let appClosed = false;

    try {
      const register = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'admin@iflabx.com',
          password: 'Secure123',
          displayName: 'Admin User',
        },
      });

      expect(register.statusCode).toBe(201);

      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'admin@iflabx.com',
          password: 'Secure123',
        },
      });

      expect(login.statusCode).toBe(200);
      const sessionToken = (login.json() as { data: { sessionToken: string } }).data.sessionToken;
      const headers = {
        authorization: `Bearer ${sessionToken}`,
      };

      const beforeUpdate = await app.inject({
        method: 'GET',
        url: '/admin/apps',
        headers,
      });

      expect(beforeUpdate.statusCode).toBe(200);
      const beforeUpdateBody = beforeUpdate.json() as AdminAppsResponse;
      const policyWatchBefore = beforeUpdateBody.data.apps.find(appRecord => appRecord.id === 'app_policy_watch');
      expect(policyWatchBefore?.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'workspace.search',
            enabled: true,
            isOverridden: false,
            execution: expect.objectContaining({
              timeoutMs: 150,
              maxAttempts: 2,
              idempotencyScope: 'conversation',
            }),
          }),
        ])
      );

      const updateResponse = await app.inject({
        method: 'PUT',
        url: '/admin/apps/app_policy_watch/tools',
        headers,
        payload: {
          tools: [
            {
              name: 'workspace.search',
              enabled: true,
              execution: {
                timeoutMs: 210,
                maxAttempts: 2,
                idempotencyScope: 'conversation',
              },
            },
          ],
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      expect((updateResponse.json() as AdminAppToolUpdateResponse).data).toMatchObject({
        enabledToolNames: ['workspace.search'],
        app: {
          id: 'app_policy_watch',
          enabledToolCount: 1,
          toolOverrideCount: 1,
        },
      });

      const database = createPersistentTestDatabase();

      try {
        const rows = await database<
          {
            app_id: string;
            tool_name: string;
            enabled: boolean;
            timeout_ms: number | null;
            max_attempts: number | null;
            idempotency_scope: string | null;
            updated_by_user_id: string | null;
          }[]
        >`
          select app_id, tool_name, enabled, timeout_ms, max_attempts, idempotency_scope, updated_by_user_id
          from workspace_app_tool_overrides
          where tenant_id = ${PERSISTENT_TEST_ENV.defaultTenantId}
            and app_id = 'app_policy_watch'
        `;

        expect(rows).toEqual([
          expect.objectContaining({
            app_id: 'app_policy_watch',
            tool_name: 'workspace.search',
            enabled: true,
            timeout_ms: 210,
            max_attempts: 2,
            idempotency_scope: 'conversation',
            updated_by_user_id: expect.any(String),
          }),
        ]);
      } finally {
        await database.end({ timeout: 5 });
      }

      await app.close();
      appClosed = true;

      const restartedApp = await createPersistentApp();
      let restartedAppClosed = false;

      try {
        const afterRestart = await restartedApp.inject({
          method: 'GET',
          url: '/admin/apps',
          headers,
        });

        expect(afterRestart.statusCode).toBe(200);
        const afterRestartBody = afterRestart.json() as AdminAppsResponse;
        const policyWatchAfter = afterRestartBody.data.apps.find(appRecord => appRecord.id === 'app_policy_watch');

        expect(policyWatchAfter?.tools).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'workspace.search',
              enabled: true,
              isOverridden: true,
              executionIsOverridden: true,
              execution: expect.objectContaining({
                timeoutMs: 210,
                maxAttempts: 2,
                idempotencyScope: 'conversation',
              }),
            }),
          ])
        );

        const completion = await restartedApp.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          headers: {
            ...headers,
            'x-active-group-id': 'grp_research',
          },
          payload: {
            app_id: 'app_policy_watch',
            inputs: {
              toolSimulation: {
                'workspace.search': {
                  failAttemptsBeforeSuccess: 1,
                },
              },
            },
            messages: [
              {
                role: 'user',
                content: 'summarize dorm policy updates',
              },
            ],
            tool_choice: {
              type: 'function',
              function: {
                name: 'workspace.search',
              },
            },
          },
        });

        expect(completion.statusCode).toBe(200);
        const completionBody = completion.json() as {
          metadata?: {
            run_id?: string;
          };
        };
        const runId = completionBody.metadata?.run_id;

        if (!runId) {
          throw new Error('expected completion to include a run id');
        }

        const run = await restartedApp.inject({
          method: 'GET',
          url: `/workspace/runs/${runId}`,
          headers,
        });

        expect(run.statusCode).toBe(200);
        expect(run.json()).toMatchObject({
          data: {
            toolExecutions: [
              expect.objectContaining({
                attempt: 1,
                status: 'failed',
                metadata: expect.objectContaining({
                  failureReason: 'provider_error',
                  timeoutMs: '210',
                  maxAttempts: '2',
                }),
              }),
              expect.objectContaining({
                attempt: 2,
                status: 'succeeded',
                metadata: expect.objectContaining({
                  timeoutMs: '210',
                  maxAttempts: '2',
                }),
              }),
            ],
          },
        });
      } finally {
        await restartedApp.close();
        restartedAppClosed = true;
      }

      expect(restartedAppClosed).toBe(true);
    } finally {
      if (!appClosed) {
        await app.close();
      }
    }
  }, 120000);
});
