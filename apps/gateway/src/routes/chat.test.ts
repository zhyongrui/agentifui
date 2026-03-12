import type { WorkspaceAppLaunchResponse, WorkspaceConversationResponse } from '@agentifui/shared/apps';
import type {
  ChatCompletionResponse,
  ChatCompletionStopResponse,
  ChatModelsResponse,
} from '@agentifui/shared/chat';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAuthService } from '../services/auth-service.js';

const testEnv: {
  nodeEnv: 'test';
  host: string;
  port: number;
  corsOrigin: boolean;
  ssoDomainMap: Record<string, string>;
  defaultTenantId: string;
  defaultSsoUserStatus: 'pending' | 'active';
  authLockoutThreshold: number;
  authLockoutDurationMs: number;
} = {
  nodeEnv: 'test' as const,
  host: '127.0.0.1',
  port: 4000,
  corsOrigin: true,
  ssoDomainMap: {
    'iflabx.com': 'iflabx-sso',
  },
  defaultTenantId: 'tenant-dev',
  defaultSsoUserStatus: 'pending',
  authLockoutThreshold: 5,
  authLockoutDurationMs: 1800000,
};

function createTestAuthService(overrides: Partial<Parameters<typeof createAuthService>[0]> = {}) {
  return createAuthService({
    defaultTenantId: testEnv.defaultTenantId,
    defaultSsoUserStatus: testEnv.defaultSsoUserStatus,
    lockoutThreshold: testEnv.authLockoutThreshold,
    lockoutDurationMs: testEnv.authLockoutDurationMs,
    ...overrides,
  });
}

async function createTestApp(
  authService = createTestAuthService(),
  envOverrides: Partial<typeof testEnv> = {}
) {
  const app = await buildApp(
    {
      ...testEnv,
      ...envOverrides,
    },
    {
      logger: false,
      authService,
    }
  );

  return {
    app,
    authService,
  };
}

describe('chat routes', () => {
  it('rejects chat completions without a bearer token', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          app_id: 'app_policy_watch',
          messages: [
            {
              role: 'user',
              content: 'hello',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          message: 'A valid session token is required to call the chat gateway.',
          type: 'authentication_error',
          code: 'invalid_token',
          trace_id: expect.any(String),
        },
      });
      expect(response.headers['x-trace-id']).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it('returns the authorized app catalog through /v1/models', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });

    const login = authService.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected active login to succeed');
    }

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/models',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-trace-id']).toEqual(expect.any(String));
      expect(response.json()).toEqual({
        object: 'list',
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'app_policy_watch',
            object: 'model',
            owned_by: 'tenant-dev',
            name: 'Policy Watch',
            capabilities: expect.objectContaining({
              streaming: true,
              stop: true,
            }),
          }),
        ]),
      } satisfies ChatModelsResponse);
    } finally {
      await app.close();
    }
  });

  it('binds blocking chat completions onto an existing workspace conversation', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });

    const login = authService.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected active login to succeed');
    }

    try {
      const launch = await app.inject({
        method: 'POST',
        url: '/workspace/apps/launch',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: 'app_policy_watch',
          activeGroupId: 'grp_research',
        },
      });
      const launchBody = launch.json() as WorkspaceAppLaunchResponse;
      const conversationId = launchBody.data.conversationId;
      const runId = launchBody.data.runId;
      const traceId = launchBody.data.traceId;

      if (!conversationId || !runId || !traceId) {
        throw new Error('expected launch payload to include conversation, run and trace ids');
      }

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          app_id: 'app_policy_watch',
          conversation_id: conversationId,
          messages: [
            {
              role: 'user',
              content: 'Summarize the current policy changes for my group.',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-trace-id']).toBe(traceId);
      expect(response.json()).toEqual({
        id: runId,
        object: 'chat.completion',
        created: expect.any(Number),
        model: 'policy-watch',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: expect.stringContaining('Policy Watch is now reachable through the AgentifUI gateway.'),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: expect.any(Number),
          completion_tokens: expect.any(Number),
          total_tokens: expect.any(Number),
        },
        conversation_id: conversationId,
        trace_id: traceId,
        metadata: {
          app_id: 'app_policy_watch',
          run_id: runId,
          active_group_id: 'grp_research',
        },
      } satisfies ChatCompletionResponse);

      const conversationResponse = await app.inject({
        method: 'GET',
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(conversationResponse.statusCode).toBe(200);
      expect((conversationResponse.json() as WorkspaceConversationResponse).data).toMatchObject({
        id: conversationId,
        messages: [
          {
            role: 'user',
            content: 'Summarize the current policy changes for my group.',
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
        run: {
          status: 'succeeded',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('creates a new conversation when conversation_id is omitted', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });

    const login = authService.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected active login to succeed');
    }

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
          'x-active-group-id': 'grp_research',
        },
        payload: {
          app_id: 'app_policy_watch',
          messages: [
            {
              role: 'user',
              content: 'Create a new workspace-backed conversation.',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json() as ChatCompletionResponse;

      expect(body.conversation_id).toEqual(expect.stringMatching(/^conv_/));
      expect(body.id).toEqual(expect.stringMatching(/^run_/));
      expect(body.trace_id).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it('returns SSE-compatible payloads when stream=true', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });

    const login = authService.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected active login to succeed');
    }

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
          'x-active-group-id': 'grp_research',
        },
        payload: {
          app_id: 'app_policy_watch',
          messages: [
            {
              role: 'user',
              content: 'Stream the response.',
            },
          ],
          stream: true,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.body).toContain('event: agentif.metadata');
      expect(response.body).toContain('"object":"chat.completion.chunk"');
      expect(response.body).toContain('data: [DONE]');
    } finally {
      await app.close();
    }
  });

  it('returns a soft stop result for the minimal protocol slice', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });

    const login = authService.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected active login to succeed');
    }

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions/run_test/stop',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        result: 'success',
        stop_type: 'soft',
      } satisfies ChatCompletionStopResponse);
    } finally {
      await app.close();
    }
  });

  it('hard-stops an active streaming response and persists stopped state', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });

    const login = authService.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected active login to succeed');
    }

    let baseUrl: string | null = null;

    try {
      const launch = await app.inject({
        method: 'POST',
        url: '/workspace/apps/launch',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: 'app_policy_watch',
          activeGroupId: 'grp_research',
        },
      });
      const launchBody = launch.json() as WorkspaceAppLaunchResponse;
      const conversationId = launchBody.data.conversationId;
      const runId = launchBody.data.runId;

      if (!conversationId || !runId) {
        throw new Error('expected launch payload to include conversation and run ids');
      }

      baseUrl = await app.listen({
        host: '127.0.0.1',
        port: 0,
      });

      const streamResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          app_id: 'app_policy_watch',
          conversation_id: conversationId,
          messages: [
            {
              role: 'user',
              content: 'Start a response that I will stop.',
            },
          ],
          stream: true,
        }),
      });

      expect(streamResponse.status).toBe(200);

      const reader = streamResponse.body?.getReader();

      expect(reader).toBeDefined();

      if (!reader) {
        throw new Error('expected stream reader to exist');
      }

      const firstChunk = await reader.read();

      expect(firstChunk.done).toBe(false);
      expect(new TextDecoder().decode(firstChunk.value)).toContain('chat.completion.chunk');

      const stopResponse = await fetch(`${baseUrl}/v1/chat/completions/${runId}/stop`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(stopResponse.status).toBe(200);
      expect((await stopResponse.json()) as ChatCompletionStopResponse).toEqual({
        result: 'success',
        stop_type: 'hard',
      });

      let streamBody = new TextDecoder().decode(firstChunk.value);

      while (true) {
        const nextChunk = await reader.read();

        if (nextChunk.done) {
          break;
        }

        streamBody += new TextDecoder().decode(nextChunk.value);
      }

      expect(streamBody).toContain('data: [DONE]');

      const conversationResponse = await app.inject({
        method: 'GET',
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(conversationResponse.statusCode).toBe(200);
      expect((conversationResponse.json() as WorkspaceConversationResponse).data).toMatchObject({
        id: conversationId,
        run: {
          status: 'stopped',
        },
        messages: [
          {
            role: 'user',
            content: 'Start a response that I will stop.',
            status: 'completed',
          },
          {
            role: 'assistant',
            status: 'stopped',
          },
        ],
      });
    } finally {
      if (baseUrl) {
        await app.close();
      } else {
        await app.close();
      }
    }
  });
});
