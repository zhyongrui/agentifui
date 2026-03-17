import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWorkspaceComment,
  createWorkspaceRunBranch,
  createWorkspaceConversationShare,
  createWorkspaceSharedComment,
  controlWorkspacePlanStep,
  downloadWorkspaceArtifact,
  fetchWorkspaceConversation,
  fetchWorkspaceConversationPresence,
  fetchWorkspaceConversationList,
  fetchWorkspaceNotifications,
  fetchWorkspacePendingActions,
  fetchWorkspaceSourceStatus,
  fetchWorkspaceSharedConversationPresence,
  respondToWorkspacePendingAction,
  fetchWorkspaceConversationRuns,
  fetchWorkspaceArtifact,
  fetchWorkspaceCatalog,
  fetchWorkspaceBilling,
  fetchWorkspaceRun,
  launchWorkspaceApp,
  markWorkspaceNotificationRead,
  updateWorkspaceConversationPresence,
  updateWorkspaceSharedConversation,
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

  it('loads workspace billing warnings through the same-origin gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-17T00:00:00.000Z',
            tenantId: 'tenant-dev',
            planName: 'Growth',
            status: 'grace',
            actualCreditsUsed: 980,
            effectiveCreditLimit: 1100,
            remainingCredits: 120,
            storageBytesUsed: 2048,
            storageLimitBytes: 4096,
            exportCount: 4,
            monthlyExportLimit: 20,
            warnings: [
              {
                code: 'soft_limit_reached',
                severity: 'warning',
                summary: 'near limit',
                detail: null,
              },
            ],
            actions: [],
          },
        }),
      })
    );

    const result = await fetchWorkspaceBilling('session-123');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/billing', {
      method: 'GET',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        status: 'grace',
        remainingCredits: 120,
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

  it('creates conversation shares with an explicit access mode through the gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            id: 'share-123',
            conversationId: 'conv-456',
            status: 'active',
            access: 'editor',
            shareUrl: '/chat/shared/share-123',
            createdAt: '2026-03-17T10:00:00.000Z',
            revokedAt: null,
            group: {
              id: 'grp_research',
              name: 'Research Lab',
              description: 'Research',
            },
          },
        }),
      })
    );

    const result = await createWorkspaceConversationShare('session-123', 'conv-456', {
      groupId: 'grp_research',
      access: 'editor',
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/conversations/conv-456/shares', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        groupId: 'grp_research',
        access: 'editor',
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        access: 'editor',
      },
    });
  });

  it('creates shared comments through the share-scoped gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            conversationId: 'conv-456',
            targetType: 'message',
            targetId: 'msg-789',
            comment: {
              id: 'comment-1',
              content: 'Shared review note',
              mentions: [],
              authorDisplayName: 'Reviewer',
              createdAt: '2026-03-17T10:05:00.000Z',
              updatedAt: '2026-03-17T10:05:00.000Z',
            },
            thread: [
              {
                id: 'comment-1',
                content: 'Shared review note',
                mentions: [],
                authorDisplayName: 'Reviewer',
                createdAt: '2026-03-17T10:05:00.000Z',
                updatedAt: '2026-03-17T10:05:00.000Z',
              },
            ],
          },
        }),
      })
    );

    const result = await createWorkspaceSharedComment('session-123', 'share-123', {
      targetType: 'message',
      targetId: 'msg-789',
      content: 'Shared review note',
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/shares/share-123/comments', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetType: 'message',
        targetId: 'msg-789',
        content: 'Shared review note',
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        targetId: 'msg-789',
      },
    });
  });

  it('updates shared conversation metadata through the share-scoped gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            id: 'conv-456',
            title: 'Reviewer updated title',
            status: 'archived',
            pinned: true,
            createdAt: '2026-03-17T10:00:00.000Z',
            updatedAt: '2026-03-17T10:10:00.000Z',
            app: {
              id: 'app_policy_watch',
              slug: 'policy-watch',
              name: 'Policy Watch',
              summary: 'summary',
              kind: 'agent',
              status: 'ready',
              shortCode: 'PW',
            },
            activeGroup: {
              id: 'grp_research',
              name: 'Research Lab',
              description: 'Research',
            },
            run: {
              id: 'run-1',
              type: 'agent',
              status: 'succeeded',
              triggeredFrom: 'app_launch',
              traceId: 'trace-1',
              startedAt: '2026-03-17T10:00:00.000Z',
              finishedAt: '2026-03-17T10:00:01.000Z',
              elapsedMs: 1000,
              usage: {
                promptTokens: 1,
                completionTokens: 1,
                totalTokens: 2,
              },
              timeline: [],
              comments: [],
              artifacts: [],
              citations: [],
              toolExecutions: [],
            },
            messages: [],
          },
        }),
      })
    );

    const result = await updateWorkspaceSharedConversation('session-123', 'share-123', {
      expectedUpdatedAt: '2026-03-17T10:00:00.000Z',
      title: 'Reviewer updated title',
      status: 'archived',
      pinned: true,
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/shares/share-123/conversation', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        expectedUpdatedAt: '2026-03-17T10:00:00.000Z',
        title: 'Reviewer updated title',
        status: 'archived',
        pinned: true,
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        title: 'Reviewer updated title',
        status: 'archived',
        pinned: true,
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

  it('fetches workspace source status through the same-origin gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            generatedAt: '2026-03-17T10:00:00.000Z',
            items: [
              {
                id: 'connector-1:source-1:stale_sync:0',
                title: 'Dorm policy handbook',
                sourceId: 'source-1',
                connectorId: 'connector-1',
                connectorTitle: 'Research Drive',
                connectorKind: 'google_drive',
                connectorStatus: 'paused',
                syncStatus: 'partial_failure',
                scope: 'group',
                groupId: 'grp_research',
                severity: 'warning',
                reason: 'stale',
                summary: 'No sync has completed in the expected window.',
                updatedAt: '2026-03-16T10:00:00.000Z',
                staleSince: '2026-03-16T10:00:00.000Z',
              },
            ],
          },
        }),
      })
    );

    const result = await fetchWorkspaceSourceStatus('session-123');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/source-status', {
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
        items: [
          expect.objectContaining({
            connectorId: 'connector-1',
            reason: 'stale',
          }),
        ],
      },
    });
  });

  it('creates a workspace run branch through the same-origin gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            conversation: {
              id: 'conv_branch',
              title: 'Runbook branch',
              status: 'active',
              pinned: false,
              app: {
                id: 'app_runbook_mentor',
                slug: 'runbook-mentor',
                name: 'Runbook Mentor',
                summary: 'summary',
                kind: 'automation',
                status: 'ready',
                shortCode: 'RM',
                launchCost: 22,
              },
              activeGroup: {
                id: 'grp_research',
                name: 'Research Lab',
                summary: 'summary',
                role: 'member',
              },
              traceId: 'trace-branch',
              runId: 'run_branch',
              runStatus: 'running',
              runStartedAt: '2026-03-17T10:10:00.000Z',
              latestRunId: 'run_branch',
              latestRunStatus: 'running',
              latestRunStartedAt: '2026-03-17T10:10:00.000Z',
              latestRunTraceId: 'trace-branch',
              messages: [],
              createdAt: '2026-03-17T10:10:00.000Z',
              updatedAt: '2026-03-17T10:10:00.000Z',
              presence: [],
              share: null,
            },
            branch: {
              parentConversationId: 'conv_parent',
              parentRunId: 'run_parent',
              rootConversationId: 'conv_parent',
              depth: 1,
              label: 'Runbook branch',
              createdByAction: 'branch',
            },
          },
        }),
      })
    );

    const result = await createWorkspaceRunBranch('session-123', 'run_parent', {
      title: 'Runbook branch',
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/runs/run_parent/branch', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Runbook branch',
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        branch: {
          createdByAction: 'branch',
          depth: 1,
        },
      },
    });
  });

  it('controls workspace plan steps through the same-origin gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          data: {
            run: {
              id: 'run_parent',
              status: 'running',
              traceId: 'trace-plan',
              type: 'workflow',
              startedAt: '2026-03-17T10:20:00.000Z',
              completedAt: null,
              latestAssistantMessage: null,
              usage: {
                promptTokens: 10,
                completionTokens: 5,
                totalTokens: 15,
              },
              durationMs: 1000,
              runtime: null,
              pendingActions: [],
              toolExecutions: [],
              plan: {
                status: 'paused',
                activeStepId: 'step_scope',
                steps: [
                  {
                    id: 'step_scope',
                    title: 'Confirm scope',
                    description: null,
                    nodeType: 'prompt',
                    status: 'paused',
                    owner: 'operator',
                    dependsOnStepIds: [],
                    startedAt: '2026-03-17T10:20:00.000Z',
                    finishedAt: null,
                    internalSummary: 'Paused for review',
                    artifacts: [],
                    citations: [],
                  },
                ],
              },
              branch: null,
              workflow: {
                definitionId: 'workflow_app_runbook_mentor',
                versionId: 'wfver_app_runbook_mentor_1',
                name: 'Runbook Mentor workflow',
                versionNumber: 1,
                status: 'paused',
                resumable: true,
                currentStepId: 'step_scope',
                lastResumedAt: '2026-03-17T10:20:00.000Z',
                pausedAt: '2026-03-17T10:21:00.000Z',
                resumedFromRunId: null,
                runnerRoles: ['runner'],
              },
              internalNotes: [],
              artifacts: [],
              citations: [],
              timeline: [],
            },
            step: {
              id: 'step_scope',
              title: 'Confirm scope',
              description: null,
              nodeType: 'prompt',
              status: 'paused',
              owner: 'operator',
              dependsOnStepIds: [],
              startedAt: '2026-03-17T10:20:00.000Z',
              finishedAt: null,
              internalSummary: 'Paused for review',
              artifacts: [],
              citations: [],
            },
          },
        }),
      })
    );

    const result = await controlWorkspacePlanStep('session-123', 'run_parent', 'step_scope', {
      action: 'pause',
      reason: 'Need operator review',
    });

    expect(fetch).toHaveBeenCalledWith('/api/gateway/workspace/runs/run_parent/plan/step_scope', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'pause',
        reason: 'Need operator review',
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        run: {
          plan: {
            status: 'paused',
          },
          workflow: {
            status: 'paused',
          },
        },
        step: {
          status: 'paused',
        },
      },
    });
  });
});
