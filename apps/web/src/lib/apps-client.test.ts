import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWorkspaceComment,
  downloadWorkspaceArtifact,
  fetchWorkspaceConversation,
  fetchWorkspaceConversationPresence,
  fetchWorkspaceConversationList,
  fetchWorkspaceNotifications,
  fetchWorkspacePendingActions,
  fetchWorkspaceSharedConversationPresence,
  respondToWorkspacePendingAction,
  fetchWorkspaceConversationRuns,
  fetchWorkspaceArtifact,
  fetchWorkspaceCatalog,
  fetchWorkspaceRun,
  launchWorkspaceApp,
  markWorkspaceNotificationRead,
  updateWorkspaceConversationPresence,
  updateWorkspaceSharedConversationPresence,
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

  it('creates workspace comments through the gateway proxy and preserves mentions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            conversationId: 'conv-123',
            targetType: 'message',
            targetId: 'msg-123',
            comment: {
              id: 'comment-123',
              conversationId: 'conv-123',
              targetType: 'message',
              targetId: 'msg-123',
              content: 'Please review this. @reviewer@example.net',
              mentions: [
                {
                  userId: 'usr-reviewer',
                  email: 'reviewer@example.net',
                  displayName: 'Review Partner',
                },
              ],
              authorUserId: 'usr-author',
              authorDisplayName: 'Author',
              createdAt: '2026-03-16T16:00:00.000Z',
              updatedAt: '2026-03-16T16:00:00.000Z',
            },
            thread: [],
          },
        }),
      })
    );

    const result = await createWorkspaceComment('session-123', 'conv-123', {
      targetType: 'message',
      targetId: 'msg-123',
      content: 'Please review this. @reviewer@example.net',
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/conversations/conv-123/comments', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetType: 'message',
        targetId: 'msg-123',
        content: 'Please review this. @reviewer@example.net',
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        comment: {
          mentions: [
            {
              email: 'reviewer@example.net',
            },
          ],
        },
      },
    });
  });

  it('loads workspace notifications through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            unreadCount: 1,
            items: [
              {
                id: 'notification-123',
                type: 'comment_mention',
                status: 'unread',
                actorUserId: 'usr-author',
                actorDisplayName: 'Author',
                conversationId: 'conv-123',
                conversationTitle: 'Policy Watch',
                commentId: 'comment-123',
                targetType: 'message',
                targetId: 'msg-123',
                preview: 'Please review this.',
                createdAt: '2026-03-16T16:00:00.000Z',
                readAt: null,
              },
            ],
          },
        }),
      })
    );

    const result = await fetchWorkspaceNotifications('session-123');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/notifications', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        unreadCount: 1,
        items: [
          {
            id: 'notification-123',
            status: 'unread',
          },
        ],
      },
    });
  });

  it('marks workspace notifications as read through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            id: 'notification-123',
            type: 'comment_mention',
            status: 'read',
            actorUserId: 'usr-author',
            actorDisplayName: 'Author',
            conversationId: 'conv-123',
            conversationTitle: 'Policy Watch',
            commentId: 'comment-123',
            targetType: 'message',
            targetId: 'msg-123',
            preview: 'Please review this.',
            createdAt: '2026-03-16T16:00:00.000Z',
            readAt: '2026-03-16T16:05:00.000Z',
          },
        }),
      })
    );

    const result = await markWorkspaceNotificationRead('session-123', 'notification-123');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/notifications/notification-123/read', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer session-123',
      },
      body: undefined,
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        id: 'notification-123',
        status: 'read',
      },
    });
  });

  it('loads conversation presence through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            conversationId: 'conv-123',
            ttlSeconds: 60,
            viewers: [
              {
                sessionId: 'presence-1',
                userId: 'usr_1',
                displayName: 'Reviewer',
                joinedAt: '2026-03-16T15:00:00.000Z',
                lastSeenAt: '2026-03-16T15:00:30.000Z',
                expiresAt: '2026-03-16T15:01:30.000Z',
                surface: 'conversation',
                state: 'active',
                activeRunId: 'run-123',
                isCurrentUser: true,
              },
            ],
          },
        }),
      })
    );

    const result = await fetchWorkspaceConversationPresence('session-123', 'conv-123');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/conversations/conv-123/presence', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        conversationId: 'conv-123',
        viewers: [
          {
            sessionId: 'presence-1',
            state: 'active',
            isCurrentUser: true,
          },
        ],
      },
    });
  });

  it('updates conversation presence through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            conversationId: 'conv-123',
            ttlSeconds: 60,
            viewers: [
              {
                sessionId: 'presence-1',
                userId: 'usr_1',
                displayName: 'Reviewer',
                joinedAt: '2026-03-16T15:00:00.000Z',
                lastSeenAt: '2026-03-16T15:00:45.000Z',
                expiresAt: '2026-03-16T15:01:45.000Z',
                surface: 'conversation',
                state: 'idle',
                activeRunId: 'run-123',
                isCurrentUser: true,
              },
            ],
          },
        }),
      })
    );

    const result = await updateWorkspaceConversationPresence('session-123', 'conv-123', {
      sessionId: 'presence-1',
      state: 'idle',
      activeRunId: 'run-123',
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/conversations/conv-123/presence', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'presence-1',
        state: 'idle',
        activeRunId: 'run-123',
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        conversationId: 'conv-123',
        viewers: [
          {
            sessionId: 'presence-1',
            state: 'idle',
          },
        ],
      },
    });
  });

  it('loads shared conversation presence through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            conversationId: 'conv-123',
            ttlSeconds: 60,
            viewers: [
              {
                sessionId: 'presence-shared-1',
                userId: 'usr_2',
                displayName: 'Shared Reviewer',
                joinedAt: '2026-03-16T15:00:00.000Z',
                lastSeenAt: '2026-03-16T15:00:30.000Z',
                expiresAt: '2026-03-16T15:01:30.000Z',
                surface: 'shared_conversation',
                state: 'active',
                activeRunId: null,
                isCurrentUser: true,
              },
            ],
          },
        }),
      })
    );

    const result = await fetchWorkspaceSharedConversationPresence('session-123', 'share-123');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/shares/share-123/presence', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        conversationId: 'conv-123',
        viewers: [
          {
            sessionId: 'presence-shared-1',
            surface: 'shared_conversation',
            state: 'active',
          },
        ],
      },
    });
  });

  it('updates shared conversation presence through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            conversationId: 'conv-123',
            ttlSeconds: 60,
            viewers: [
              {
                sessionId: 'presence-shared-1',
                userId: 'usr_2',
                displayName: 'Shared Reviewer',
                joinedAt: '2026-03-16T15:00:00.000Z',
                lastSeenAt: '2026-03-16T15:00:45.000Z',
                expiresAt: '2026-03-16T15:01:45.000Z',
                surface: 'shared_conversation',
                state: 'idle',
                activeRunId: null,
                isCurrentUser: true,
              },
            ],
          },
        }),
      })
    );

    const result = await updateWorkspaceSharedConversationPresence('session-123', 'share-123', {
      sessionId: 'presence-shared-1',
      state: 'idle',
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/shares/share-123/presence', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'presence-shared-1',
        state: 'idle',
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        conversationId: 'conv-123',
        viewers: [
          {
            sessionId: 'presence-shared-1',
            surface: 'shared_conversation',
            state: 'idle',
          },
        ],
      },
    });
  });

  it('loads pending actions for a conversation through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            conversationId: 'conv-123',
            runId: 'run-456',
            items: [
              {
                id: 'hitl-1',
                kind: 'approval',
                status: 'pending',
                title: 'Approve tenant access change',
                description: 'A tenant-level access change is waiting for approval.',
                conversationId: 'conv-123',
                runId: 'run-456',
                createdAt: '2026-03-14T10:15:00.000Z',
                updatedAt: '2026-03-14T10:15:00.000Z',
                expiresAt: '2026-03-15T10:15:00.000Z',
                approveLabel: 'Approve change',
                rejectLabel: 'Reject change',
              },
            ],
          },
        }),
      })
    );

    const result = await fetchWorkspacePendingActions('session-123', 'conv-123');

    expect(fetch).toHaveBeenCalledWith(
      '/api/gateway/workspace/conversations/conv-123/pending-actions',
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
        runId: 'run-456',
        items: [
          {
            kind: 'approval',
            status: 'pending',
          },
        ],
      },
    });
  });

  it('submits a pending action response through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            conversationId: 'conv-123',
            runId: 'run-456',
            item: {
              id: 'hitl-1',
              kind: 'input_request',
              status: 'submitted',
              title: 'Collect change request details',
              description: 'Need rollout details.',
              conversationId: 'conv-123',
              runId: 'run-456',
              createdAt: '2026-03-14T10:15:00.000Z',
              updatedAt: '2026-03-14T10:16:00.000Z',
              expiresAt: '2026-03-15T10:15:00.000Z',
              submitLabel: 'Submit details',
              fields: [
                {
                  id: 'justification',
                  label: 'Business justification',
                  type: 'textarea',
                  required: true,
                },
              ],
              response: {
                action: 'submit',
                respondedAt: '2026-03-14T10:16:00.000Z',
                actorUserId: 'user-123',
                actorDisplayName: 'Reviewer',
                values: {
                  justification: 'Need emergency access.',
                },
              },
            },
            items: [
              {
                id: 'hitl-1',
                kind: 'input_request',
                status: 'submitted',
              },
            ],
          },
        }),
      })
    );

    const result = await respondToWorkspacePendingAction(
      'session-123',
      'conv-123',
      'hitl-1',
      {
        action: 'submit',
        values: {
          justification: 'Need emergency access.',
        },
      }
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/gateway/workspace/conversations/conv-123/pending-actions/hitl-1/respond',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer session-123',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'submit',
          values: {
            justification: 'Need emergency access.',
          },
        }),
        cache: 'no-store',
      }
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        item: {
          status: 'submitted',
          response: {
            action: 'submit',
          },
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
                attachmentCount: 1,
                feedbackSummary: {
                  positiveCount: 1,
                  negativeCount: 0,
                },
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
              attachment: 'with_attachments',
              appId: 'app_policy_watch',
              feedback: 'positive',
              groupId: 'grp_research',
              query: 'policy',
              status: 'archived',
              tag: 'policy',
              limit: 20,
            },
          },
        }),
      })
    );

    const result = await fetchWorkspaceConversationList('session-123', {
      attachment: 'with_attachments',
      appId: 'app_policy_watch',
      feedback: 'positive',
      groupId: 'grp_research',
      limit: 20,
      query: 'policy',
      status: 'archived',
      tag: 'policy',
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/gateway/workspace/conversations?attachment=with_attachments&appId=app_policy_watch&feedback=positive&groupId=grp_research&q=policy&status=archived&tag=policy&limit=20',
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

  it('loads a single workspace artifact from the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            id: 'artifact-456',
            title: 'Dorm policy draft',
            kind: 'markdown',
            source: 'assistant_response',
            status: 'draft',
            createdAt: '2026-03-14T10:10:00.000Z',
            updatedAt: '2026-03-14T10:10:00.000Z',
            summary: 'Dorm policy draft summary',
            mimeType: 'text/markdown',
            sizeBytes: 120,
            content: '# Dorm policy',
          },
        }),
      })
    );

    const result = await fetchWorkspaceArtifact('session-123', 'artifact-456');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/artifacts/artifact-456', {
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
        id: 'artifact-456',
        kind: 'markdown',
        content: '# Dorm policy',
      },
    });
  });

  it('loads a shared workspace artifact through the share-scoped gateway route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            id: 'artifact-456',
            title: 'Dorm policy draft',
            kind: 'markdown',
            source: 'assistant_response',
            status: 'draft',
            createdAt: '2026-03-14T10:10:00.000Z',
            updatedAt: '2026-03-14T10:10:00.000Z',
            summary: 'Dorm policy draft summary',
            mimeType: 'text/markdown',
            sizeBytes: 120,
            content: '# Dorm policy',
          },
        }),
      })
    );

    const result = await fetchWorkspaceArtifact('session-123', 'artifact-456', {
      shareId: 'share-123',
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/gateway/workspace/shares/share-123/artifacts/artifact-456',
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
        id: 'artifact-456',
      },
    });
  });

  it('downloads workspace artifacts through the same-origin gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('# Dorm policy\n', {
          status: 200,
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'content-disposition': 'attachment; filename="Dorm-policy-draft.md"',
            'x-agentifui-artifact-filename': 'Dorm-policy-draft.md',
            'x-agentifui-artifact-kind': 'markdown',
            'x-agentifui-artifact-id': 'artifact-456',
          },
        })
      )
    );

    const result = await downloadWorkspaceArtifact('session-123', 'artifact-456');

    expect(fetch).toHaveBeenCalledWith(
      '/api/gateway/workspace/artifacts/artifact-456/download',
      {
        method: 'GET',
        headers: {
          authorization: 'Bearer session-123',
        },
        cache: 'no-store',
      }
    );

    if (!('blob' in result)) {
      throw new Error('expected a successful artifact download result');
    }

    expect(result.metadata).toEqual({
      artifactId: 'artifact-456',
      contentType: 'text/markdown; charset=utf-8',
      filename: 'Dorm-policy-draft.md',
      kind: 'markdown',
      shareId: null,
    });
    await expect(result.blob.text()).resolves.toBe('# Dorm policy\n');
  });
});
