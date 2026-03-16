import type { WorkspaceAppLaunchResponse, WorkspaceRunResponse } from '@agentifui/shared/apps';
import type { ChatCompletionResponse } from '@agentifui/shared/chat';
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

const PERSISTENCE_TEST_TIMEOUT_MS = 120000;

describe.sequential('persistent knowledge ingestion', () => {
  it(
    'persists knowledge ingestion transitions and retrieval context across app restarts',
    async () => {
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

        const researchCreate = await app.inject({
          method: 'POST',
          url: '/admin/sources',
          headers,
          payload: {
            title: 'Dorm policy digest',
            sourceKind: 'markdown',
            sourceUri: null,
            content: '# Dorm policy\n\nQuiet hours begin at 23:00.',
            scope: 'group',
            groupId: 'grp_research',
            labels: ['policy', 'dormitory'],
            updatedSourceAt: null,
          },
        });

        expect(researchCreate.statusCode).toBe(200);
        const researchSourceId = (researchCreate.json() as { data: { id: string } }).data.id;

        const processingUpdate = await app.inject({
          method: 'PUT',
          url: `/admin/sources/${researchSourceId}/status`,
          headers,
          payload: {
            status: 'processing',
            chunkCount: null,
            lastError: null,
          },
        });

        expect(processingUpdate.statusCode).toBe(200);

        const failedUpdate = await app.inject({
          method: 'PUT',
          url: `/admin/sources/${researchSourceId}/status`,
          headers,
          payload: {
            status: 'failed',
            chunkCount: null,
            lastError: 'indexer timeout',
          },
        });

        expect(failedUpdate.statusCode).toBe(200);

        const succeededUpdate = await app.inject({
          method: 'PUT',
          url: `/admin/sources/${researchSourceId}/status`,
          headers,
          payload: {
            status: 'succeeded',
            content: [
              '# Dorm policy',
              '',
              'Quiet hours begin at 23:00 on weekdays.',
              '',
              '## Updates',
              '',
              'Residents may request approved late access for labs.',
            ].join('\n'),
            chunkCount: null,
            lastError: null,
          },
        });

        expect(succeededUpdate.statusCode).toBe(200);

        const securityCreate = await app.inject({
          method: 'POST',
          url: '/admin/sources',
          headers,
          payload: {
            title: 'Security dorm policy escalation',
            sourceKind: 'markdown',
            sourceUri: null,
            content: '# Dorm policy\n\nSecurity office dorm policy escalation steps.',
            scope: 'group',
            groupId: 'grp_security',
            labels: ['policy', 'security'],
            updatedSourceAt: null,
          },
        });

        expect(securityCreate.statusCode).toBe(200);
        const securitySourceId = (securityCreate.json() as { data: { id: string } }).data.id;

        const securitySucceeded = await app.inject({
          method: 'PUT',
          url: `/admin/sources/${securitySourceId}/status`,
          headers,
          payload: {
            status: 'succeeded',
            chunkCount: null,
            lastError: null,
          },
        });

        expect(securitySucceeded.statusCode).toBe(200);

        const runtimeDatabase = createPersistentTestDatabase();

        try {
          const chunkRows = await runtimeDatabase<{ source_id: string; chunk_count: number }[]>`
            select source_id, count(*)::int as chunk_count
            from knowledge_source_chunks
            where source_id in (${researchSourceId}, ${securitySourceId})
            group by source_id
          `;

          expect(chunkRows).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                source_id: researchSourceId,
                chunk_count: expect.any(Number),
              }),
              expect.objectContaining({
                source_id: securitySourceId,
                chunk_count: expect.any(Number),
              }),
            ]),
          );
        } finally {
          await runtimeDatabase.end({ timeout: 5 });
        }

        await app.close();
        appClosed = true;

        const restartedApp = await createPersistentApp();
        let restartedAppClosed = false;

        try {
          const sourcesResponse = await restartedApp.inject({
            method: 'GET',
            url: '/admin/sources',
            headers,
          });

          expect(sourcesResponse.statusCode).toBe(200);
          expect((sourcesResponse.json() as { data: { sources: unknown[] } }).data.sources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: researchSourceId,
                status: 'succeeded',
                chunkCount: expect.any(Number),
              }),
              expect.objectContaining({
                id: securitySourceId,
                status: 'succeeded',
              }),
            ]),
          );

          const launch = await restartedApp.inject({
            method: 'POST',
            url: '/workspace/apps/launch',
            headers,
            payload: {
              appId: 'app_policy_watch',
              activeGroupId: 'grp_research',
            },
          });

          expect(launch.statusCode).toBe(200);
          const launchBody = launch.json() as WorkspaceAppLaunchResponse;
          const conversationId = launchBody.data.conversationId;

          if (!conversationId) {
            throw new Error('expected persisted launch to include a conversation id');
          }

          const completion = await restartedApp.inject({
            method: 'POST',
            url: '/v1/chat/completions',
            headers,
            payload: {
              app_id: 'app_policy_watch',
              conversation_id: conversationId,
              messages: [
                {
                  role: 'user',
                  content: 'summarize dorm policy updates',
                },
              ],
            },
          });

          expect(completion.statusCode).toBe(200);
          const completionBody = completion.json() as ChatCompletionResponse;
          const runId = completionBody.id;

          const runResponse = await restartedApp.inject({
            method: 'GET',
            url: `/workspace/runs/${runId}`,
            headers,
          });

          expect(runResponse.statusCode).toBe(200);
          expect((runResponse.json() as WorkspaceRunResponse).data.inputs).toMatchObject({
            retrieval: {
              matches: expect.arrayContaining([
                expect.objectContaining({
                  sourceId: researchSourceId,
                  title: 'Dorm policy digest',
                }),
              ]),
            },
          });
          expect((runResponse.json() as WorkspaceRunResponse).data.inputs).not.toMatchObject({
            retrieval: {
              matches: expect.arrayContaining([
                expect.objectContaining({
                  sourceId: securitySourceId,
                }),
              ]),
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
    PERSISTENCE_TEST_TIMEOUT_MS,
  );
});
