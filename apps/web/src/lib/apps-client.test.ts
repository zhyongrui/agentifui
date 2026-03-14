import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchWorkspaceConversation,
  fetchWorkspaceConversationList,
  fetchWorkspaceConversationRuns,
  fetchWorkspaceCatalog,
  fetchWorkspaceRun,
  launchWorkspaceApp,
  updateWorkspaceConversation,
  updateWorkspaceConversationMessageFeedback,
  updateWorkspacePreferences,
} from './apps-client.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('apps client', () => {
  it('requests the workspace catalog with a bearer token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            groups: [],
            memberGroupIds: [],
            defaultActiveGroupId: 'grp_product',
            apps: [],
            favoriteAppIds: [],
            recentAppIds: [],
            quotaServiceState: 'available',
            quotaUsagesByGroupId: {},
            generatedAt: '2026-03-11T00:00:00.000Z',
          },
        }),
      })
    );

    const result = await fetchWorkspaceCatalog('session-123');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/apps', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        defaultActiveGroupId: 'grp_product',
      },
    });
  });

  it('returns workspace errors without reshaping them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: false,
          error: {
            code: 'WORKSPACE_UNAUTHORIZED',
            message: 'expired',
          },
        }),
      })
    );

    const result = await fetchWorkspaceCatalog('expired-session');

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'WORKSPACE_UNAUTHORIZED',
        message: 'expired',
      },
    });
  });

  it('normalizes stringified app tags returned by the gateway', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            groups: [],
            memberGroupIds: [],
            defaultActiveGroupId: 'grp_product',
            apps: [
              {
                id: 'app_market_brief',
                slug: 'market-brief',
                name: 'Market Brief',
                summary: 'summary',
                kind: 'analysis',
                status: 'ready',
                shortCode: 'MB',
                tags: '["research","daily"]',
                grantedGroupIds: ['grp_product'],
                launchCost: 40,
              },
            ],
            favoriteAppIds: ['app_market_brief'],
            recentAppIds: ['app_market_brief'],
            quotaServiceState: 'available',
            quotaUsagesByGroupId: {},
            generatedAt: '2026-03-11T00:00:00.000Z',
          },
        }),
      })
    );

    const result = await fetchWorkspaceCatalog('session-123');

    expect(result).toMatchObject({
      ok: true,
      data: {
        apps: [
          {
            id: 'app_market_brief',
            tags: ['research', 'daily'],
          },
        ],
        favoriteAppIds: ['app_market_brief'],
        recentAppIds: ['app_market_brief'],
      },
    });
  });

  it('updates workspace preferences through the same-origin gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            favoriteAppIds: ['app_audit_lens'],
            recentAppIds: ['app_market_brief'],
            defaultActiveGroupId: 'grp_security',
            updatedAt: '2026-03-12T10:00:00.000Z',
          },
        }),
      })
    );

    const result = await updateWorkspacePreferences('session-123', {
      favoriteAppIds: ['app_audit_lens'],
      recentAppIds: ['app_market_brief'],
      defaultActiveGroupId: 'grp_security',
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/preferences', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        favoriteAppIds: ['app_audit_lens'],
        recentAppIds: ['app_market_brief'],
        defaultActiveGroupId: 'grp_security',
      }),
      cache: 'no-store',
    });
    expect(result).toEqual({
      ok: true,
      data: {
        favoriteAppIds: ['app_audit_lens'],
        recentAppIds: ['app_market_brief'],
        defaultActiveGroupId: 'grp_security',
        updatedAt: '2026-03-12T10:00:00.000Z',
      },
    });
  });

  it('launches a workspace app through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            id: 'launch-123',
            status: 'conversation_ready',
            launchUrl: '/chat/conv-123',
            launchedAt: '2026-03-12T10:05:00.000Z',
            conversationId: 'conv-123',
            runId: 'run-123',
            traceId: 'trace-123',
            app: {
              id: 'app_market_brief',
              slug: 'market-brief',
              name: 'Market Brief',
              summary: 'summary',
              kind: 'analysis',
              status: 'ready',
              shortCode: 'MB',
              launchCost: 40,
            },
            attributedGroup: {
              id: 'grp_product',
              name: 'Product Studio',
              description: 'desc',
            },
          },
        }),
      })
    );

    const result = await launchWorkspaceApp('session-123', {
      appId: 'app_market_brief',
      activeGroupId: 'grp_product',
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/apps/launch', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        appId: 'app_market_brief',
        activeGroupId: 'grp_product',
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        id: 'launch-123',
        status: 'conversation_ready',
        conversationId: 'conv-123',
        runId: 'run-123',
        traceId: 'trace-123',
        attributedGroup: {
          id: 'grp_product',
        },
      },
    });
  });

  it('loads a workspace conversation from the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            id: 'conv-123',
            title: 'Market Brief',
            status: 'active',
            pinned: false,
            createdAt: '2026-03-12T10:05:00.000Z',
            updatedAt: '2026-03-12T10:05:00.000Z',
            launchId: 'launch-123',
            app: {
              id: 'app_market_brief',
              slug: 'market-brief',
              name: 'Market Brief',
              summary: 'summary',
              kind: 'analysis',
              status: 'ready',
              shortCode: 'MB',
            },
            activeGroup: {
              id: 'grp_product',
              name: 'Product Studio',
              description: 'desc',
            },
            messages: [],
            run: {
              id: 'run-123',
              type: 'agent',
              status: 'pending',
              triggeredFrom: 'app_launch',
              traceId: 'trace-123',
              createdAt: '2026-03-12T10:05:00.000Z',
              finishedAt: null,
              elapsedTime: 0,
              totalTokens: 0,
              totalSteps: 0,
            },
          },
        }),
      })
    );

    const result = await fetchWorkspaceConversation('session-123', 'conv-123');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/conversations/conv-123', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      body: undefined,
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        id: 'conv-123',
        pinned: false,
        run: {
          traceId: 'trace-123',
        },
      },
    });
  });

  it('updates assistant message feedback through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            conversationId: 'conv-123',
            message: {
              id: 'msg-456',
              role: 'assistant',
              content: 'Policy summary',
              status: 'completed',
              createdAt: '2026-03-13T12:00:00.000Z',
              feedback: {
                rating: 'positive',
                updatedAt: '2026-03-13T12:01:00.000Z',
              },
            },
          },
        }),
      })
    );

    const result = await updateWorkspaceConversationMessageFeedback(
      'session-123',
      'conv-123',
      'msg-456',
      {
        rating: 'positive',
      }
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/gateway/workspace/conversations/conv-123/messages/msg-456/feedback',
      {
        method: 'PUT',
        headers: {
          authorization: 'Bearer session-123',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          rating: 'positive',
        }),
        cache: 'no-store',
      }
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        conversationId: 'conv-123',
        message: {
          id: 'msg-456',
          feedback: {
            rating: 'positive',
          },
        },
      },
    });
  });

  it('updates conversation metadata through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            id: 'conv-123',
            title: 'Policy follow-up',
            status: 'archived',
            pinned: true,
            createdAt: '2026-03-12T10:05:00.000Z',
            updatedAt: '2026-03-13T10:05:00.000Z',
            launchId: 'launch-123',
            app: {
              id: 'app_policy_watch',
              slug: 'policy-watch',
              name: 'Policy Watch',
              summary: 'summary',
              kind: 'governance',
              status: 'ready',
              shortCode: 'PW',
            },
            activeGroup: {
              id: 'grp_research',
              name: 'Research Lab',
              description: 'desc',
            },
            messages: [],
            run: {
              id: 'run-123',
              type: 'agent',
              status: 'succeeded',
              triggeredFrom: 'chat_completion',
              traceId: 'trace-123',
              createdAt: '2026-03-12T10:05:00.000Z',
              finishedAt: '2026-03-12T10:10:00.000Z',
              elapsedTime: 5000,
              totalTokens: 42,
              totalSteps: 1,
            },
          },
        }),
      })
    );

    const result = await updateWorkspaceConversation('session-123', 'conv-123', {
      title: 'Policy follow-up',
      status: 'archived',
      pinned: true,
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/conversations/conv-123', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Policy follow-up',
        status: 'archived',
        pinned: true,
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        id: 'conv-123',
        title: 'Policy follow-up',
        status: 'archived',
        pinned: true,
      },
    });
  });

  it('loads filtered conversation history from the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            items: [
              {
                id: 'conv-123',
                title: 'Policy Watch',
                status: 'active',
                pinned: false,
                createdAt: '2026-03-12T10:05:00.000Z',
                updatedAt: '2026-03-12T10:10:00.000Z',
                messageCount: 2,
                lastMessagePreview: 'Policy Watch is now reachable...',
                app: {
                  id: 'app_policy_watch',
                  slug: 'policy-watch',
                  name: 'Policy Watch',
                  summary: 'summary',
                  kind: 'governance',
                  status: 'ready',
                  shortCode: 'PW',
                },
                activeGroup: {
                  id: 'grp_research',
                  name: 'Research Lab',
                  description: 'desc',
                },
                run: {
                  id: 'run-123',
                  type: 'agent',
                  status: 'succeeded',
                  triggeredFrom: 'chat_completion',
                  traceId: 'trace-123',
                  createdAt: '2026-03-12T10:05:00.000Z',
                  finishedAt: '2026-03-12T10:10:00.000Z',
                  elapsedTime: 5000,
                  totalTokens: 42,
                  totalSteps: 1,
                },
              },
            ],
            filters: {
              appId: 'app_policy_watch',
              groupId: 'grp_research',
              query: 'policy',
              limit: 20,
            },
          },
        }),
      })
    );

    const result = await fetchWorkspaceConversationList('session-123', {
      appId: 'app_policy_watch',
      groupId: 'grp_research',
      limit: 20,
      query: 'policy',
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/gateway/workspace/conversations?appId=app_policy_watch&groupId=grp_research&q=policy&limit=20',
      {
        method: 'GET',
        headers: {
          authorization: 'Bearer session-123',
        },
        body: undefined,
        cache: 'no-store',
      }
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        items: [
          {
            id: 'conv-123',
            app: {
              id: 'app_policy_watch',
            },
          },
        ],
      },
    });
  });

  it('loads conversation run history from the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            conversationId: 'conv-123',
            runs: [
              {
                id: 'run-456',
                type: 'agent',
                status: 'succeeded',
                triggeredFrom: 'chat_completion',
                traceId: 'trace-456',
                createdAt: '2026-03-12T10:10:00.000Z',
                finishedAt: '2026-03-12T10:10:02.000Z',
                elapsedTime: 2000,
                totalTokens: 24,
                totalSteps: 1,
              },
            ],
          },
        }),
      })
    );

    const result = await fetchWorkspaceConversationRuns('session-123', 'conv-123');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/conversations/conv-123/runs', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      body: undefined,
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        conversationId: 'conv-123',
        runs: [
          {
            id: 'run-456',
            traceId: 'trace-456',
          },
        ],
      },
    });
  });

  it('loads a single workspace run from the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            id: 'run-456',
            conversationId: 'conv-123',
            type: 'agent',
            status: 'succeeded',
            triggeredFrom: 'chat_completion',
            traceId: 'trace-456',
            createdAt: '2026-03-12T10:10:00.000Z',
            finishedAt: '2026-03-12T10:10:02.000Z',
            elapsedTime: 2000,
            totalTokens: 24,
            totalSteps: 1,
            app: {
              id: 'app_market_brief',
              slug: 'market-brief',
              name: 'Market Brief',
              summary: 'summary',
              kind: 'analysis',
              status: 'ready',
              shortCode: 'MB',
            },
            activeGroup: {
              id: 'grp_product',
              name: 'Product Studio',
              description: 'desc',
            },
            error: null,
            inputs: {
              messages: [
                {
                  role: 'user',
                  content: 'hello',
                },
              ],
            },
            outputs: {
              assistant: {
                content: 'world',
              },
            },
            usage: {
              promptTokens: 8,
              completionTokens: 16,
              totalTokens: 24,
            },
            timeline: [
              {
                id: 'timeline-1',
                type: 'run_created',
                createdAt: '2026-03-12T10:10:00.000Z',
                metadata: {
                  triggeredFrom: 'chat_completion',
                },
              },
            ],
          },
        }),
      })
    );

    const result = await fetchWorkspaceRun('session-123', 'run-456');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/runs/run-456', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      body: undefined,
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        id: 'run-456',
        usage: {
          totalTokens: 24,
        },
        timeline: [
          {
            type: 'run_created',
          },
        ],
      },
    });
  });
});
