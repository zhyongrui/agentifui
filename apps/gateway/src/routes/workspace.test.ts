import type {
  WorkspaceAppLaunchResponse,
  WorkspaceCatalogResponse,
  WorkspaceConversationListResponse,
  WorkspaceConversationMessageFeedbackResponse,
  WorkspaceConversationResponse,
  WorkspaceConversationShareResponse,
  WorkspaceConversationSharesResponse,
  WorkspaceConversationUploadResponse,
  WorkspaceConversationUpdateResponse,
  WorkspaceConversationRunsResponse,
  WorkspacePreferencesResponse,
  WorkspaceSharedConversationResponse,
  WorkspaceRunResponse,
} from "@agentifui/shared/apps";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { createAuditService } from "../services/audit-service.js";
import { createAuthService } from "../services/auth-service.js";

const testEnv: {
  nodeEnv: "test";
  host: string;
  port: number;
  corsOrigin: boolean;
  ssoDomainMap: Record<string, string>;
  defaultTenantId: string;
  defaultSsoUserStatus: "pending" | "active";
  authLockoutThreshold: number;
  authLockoutDurationMs: number;
} = {
  nodeEnv: "test" as const,
  host: "127.0.0.1",
  port: 4000,
  corsOrigin: true,
  ssoDomainMap: {
    "iflabx.com": "iflabx-sso",
  },
  defaultTenantId: "tenant-dev",
  defaultSsoUserStatus: "pending",
  authLockoutThreshold: 5,
  authLockoutDurationMs: 1800000,
};

function createTestAuthService(
  overrides: Partial<Parameters<typeof createAuthService>[0]> = {},
) {
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
  envOverrides: Partial<typeof testEnv> = {},
  appOverrides: Record<string, unknown> = {},
) {
  const app = await buildApp(
    {
      ...testEnv,
      ...envOverrides,
    },
    {
      logger: false,
      authService,
      ...appOverrides,
    },
  );

  return {
    app,
    authService,
  };
}

describe("workspace routes", () => {
  it("rejects requests without a bearer token", async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/workspace/apps",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_UNAUTHORIZED",
        },
      });
    } finally {
      await app.close();
    }
  });

  it("rejects pending users even when they hold a session token", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);
    const login = authService.loginWithSso({
      email: "pending@iflabx.com",
      providerId: "iflabx-sso",
      displayName: "Pending User",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected pending sso login to succeed");
    }

    try {
      const response = await app.inject({
        method: "GET",
        url: "/workspace/apps",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_FORBIDDEN",
          details: {
            status: "pending",
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it("returns only the authorized app union for a normal active member", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: "developer@iflabx.com",
      password: "Secure123",
      displayName: "Developer",
    });

    const login = authService.login({
      email: "developer@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected active login to succeed");
    }

    try {
      const response = await app.inject({
        method: "GET",
        url: "/workspace/apps",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json() as WorkspaceCatalogResponse;

      expect(body.ok).toBe(true);
      expect(body.data.memberGroupIds).toEqual(["grp_product", "grp_research"]);
      expect(body.data.defaultActiveGroupId).toBe("grp_product");
      expect(body.data.favoriteAppIds).toEqual([]);
      expect(body.data.recentAppIds).toEqual([]);
      expect(body.data.groups.map((group) => group.id)).toEqual([
        "grp_product",
        "grp_research",
      ]);
      expect(body.data.apps.map((workspaceApp) => workspaceApp.id)).toEqual([
        "app_market_brief",
        "app_service_copilot",
        "app_release_radar",
        "app_policy_watch",
        "app_runbook_mentor",
      ]);
    } finally {
      await app.close();
    }
  });

  it("returns the security-only catalog for audit users", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: "security@iflabx.com",
      password: "Secure123",
      displayName: "Security User",
    });

    const login = authService.login({
      email: "security@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected security login to succeed");
    }

    try {
      const response = await app.inject({
        method: "GET",
        url: "/workspace/apps",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json() as WorkspaceCatalogResponse;

      expect(body.data.memberGroupIds).toEqual(["grp_security"]);
      expect(body.data.groups.map((group) => group.id)).toEqual([
        "grp_security",
      ]);
      expect(body.data.apps.map((workspaceApp) => workspaceApp.id)).toEqual([
        "app_audit_lens",
      ]);
    } finally {
      await app.close();
    }
  });

  it("persists workspace preferences for the active user", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const { app } = await createTestApp(authService, {}, { auditService });

    authService.register({
      email: "developer@iflabx.com",
      password: "Secure123",
      displayName: "Developer",
    });

    const login = authService.login({
      email: "developer@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected active login to succeed");
    }

    try {
      const updateResponse = await app.inject({
        method: "PUT",
        url: "/workspace/preferences",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          favoriteAppIds: [
            "app_policy_watch",
            "app_unknown",
            "app_policy_watch",
          ],
          recentAppIds: ["app_market_brief", "app_unknown"],
          defaultActiveGroupId: "grp_research",
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toEqual({
        ok: true,
        data: {
          favoriteAppIds: ["app_policy_watch"],
          recentAppIds: ["app_market_brief"],
          defaultActiveGroupId: "grp_research",
          updatedAt: expect.any(String),
        },
      });

      const preferencesResponse = await app.inject({
        method: "GET",
        url: "/workspace/preferences",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(preferencesResponse.statusCode).toBe(200);
      expect(preferencesResponse.json()).toEqual({
        ok: true,
        data: {
          favoriteAppIds: ["app_policy_watch"],
          recentAppIds: ["app_market_brief"],
          defaultActiveGroupId: "grp_research",
          updatedAt: expect.any(String),
        },
      } satisfies WorkspacePreferencesResponse);

      const catalogResponse = await app.inject({
        method: "GET",
        url: "/workspace/apps",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(catalogResponse.statusCode).toBe(200);

      const catalogBody = catalogResponse.json() as WorkspaceCatalogResponse;

      expect(catalogBody.data.defaultActiveGroupId).toBe("grp_research");
      expect(catalogBody.data.favoriteAppIds).toEqual(["app_policy_watch"]);
      expect(catalogBody.data.recentAppIds).toEqual(["app_market_brief"]);

      const auditEvents = await auditService.listEvents({
        tenantId: testEnv.defaultTenantId,
      });

      expect(auditEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.preferences.updated",
            entityType: "user",
            payload: {
              favoriteAppIds: ["app_policy_watch"],
              recentAppIds: ["app_market_brief"],
              defaultActiveGroupId: "grp_research",
              updatedAt: expect.any(String),
            },
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it("creates a conversation-backed launch for an authorized app and records it as recent", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: "developer@iflabx.com",
      password: "Secure123",
      displayName: "Developer",
    });

    const login = authService.login({
      email: "developer@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected active login to succeed");
    }

    try {
      const response = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_policy_watch",
          activeGroupId: "grp_research",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json() as WorkspaceAppLaunchResponse;

      expect(body).toMatchObject({
        ok: true,
        data: {
          status: "conversation_ready",
          conversationId: expect.any(String),
          runId: expect.any(String),
          traceId: expect.any(String),
          app: {
            id: "app_policy_watch",
          },
          attributedGroup: {
            id: "grp_research",
          },
        },
      });
      expect(body.data.launchUrl).toContain("/chat/");

      const conversationId = body.data.conversationId;
      const runId = body.data.runId;
      const traceId = body.data.traceId;

      expect(conversationId).toBeTruthy();
      expect(runId).toBeTruthy();
      expect(traceId).toBeTruthy();

      if (!conversationId || !runId || !traceId) {
        throw new Error(
          "expected launch payload to include conversation, run and trace ids",
        );
      }

      const catalogResponse = await app.inject({
        method: "GET",
        url: "/workspace/apps",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(catalogResponse.statusCode).toBe(200);
      const catalogBody = catalogResponse.json() as WorkspaceCatalogResponse;

      expect(catalogBody.data.recentAppIds).toEqual(["app_policy_watch"]);
      expect(catalogBody.data.quotaUsagesByGroupId.grp_research).toEqual([
        expect.objectContaining({
          scope: "tenant",
          used: 845,
        }),
        expect.objectContaining({
          scope: "group",
          scopeId: "grp_research",
          used: 785,
        }),
        expect.objectContaining({
          scope: "user",
          used: 635,
        }),
      ]);

      const conversationResponse = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(conversationResponse.statusCode).toBe(200);
      expect(conversationResponse.json()).toEqual({
        ok: true,
        data: {
          id: conversationId,
          title: "Policy Watch",
          status: "active",
          pinned: false,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          launchId: body.data.id,
          app: {
            id: "app_policy_watch",
            slug: "policy-watch",
            name: "Policy Watch",
            summary: "跟踪政策变化、合规要求和影响说明。",
            kind: "governance",
            status: "ready",
            shortCode: "PW",
          },
          activeGroup: {
            id: "grp_research",
            name: "Research Lab",
            description: "负责分析洞察、策略研究和知识整理。",
          },
          messages: [],
          run: {
            id: runId,
            type: "agent",
            status: "pending",
            triggeredFrom: "app_launch",
            traceId,
            createdAt: expect.any(String),
            finishedAt: null,
            elapsedTime: 0,
            totalTokens: 0,
            totalSteps: 0,
          },
        },
      } satisfies WorkspaceConversationResponse);

      const runsResponse = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/runs`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runsResponse.statusCode).toBe(200);
      expect(
        (runsResponse.json() as WorkspaceConversationRunsResponse).data,
      ).toEqual({
        conversationId,
        runs: [
          {
            id: runId,
            type: "agent",
            status: "pending",
            triggeredFrom: "app_launch",
            traceId,
            createdAt: expect.any(String),
            finishedAt: null,
            elapsedTime: 0,
            totalTokens: 0,
            totalSteps: 0,
          },
        ],
      });

      const runResponse = await app.inject({
        method: "GET",
        url: `/workspace/runs/${runId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runResponse.statusCode).toBe(200);
      expect((runResponse.json() as WorkspaceRunResponse).data).toMatchObject({
        id: runId,
        conversationId,
        status: "pending",
        triggeredFrom: "app_launch",
        usage: {
          totalTokens: 0,
        },
      });
    } finally {
      await app.close();
    }
  });

  it("renames, pins, archives, and deletes conversations through the workspace route", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const { app } = await createTestApp(authService, {}, { auditService });

    authService.register({
      email: "developer@iflabx.com",
      password: "Secure123",
      displayName: "Developer",
    });

    const login = authService.login({
      email: "developer@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected active login to succeed");
    }

    try {
      const launch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_policy_watch",
          activeGroupId: "grp_research",
        },
      });

      expect(launch.statusCode).toBe(200);

      const launchBody = launch.json() as WorkspaceAppLaunchResponse;
      const conversationId = launchBody.data.conversationId;

      if (!conversationId) {
        throw new Error("expected launch payload to include a conversation id");
      }

      const update = await app.inject({
        method: "PUT",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          title: "Policy follow-up",
          pinned: true,
          status: "archived",
        },
      });

      expect(update.statusCode).toBe(200);
      expect(update.json()).toEqual({
        ok: true,
        data: {
          id: conversationId,
          title: "Policy follow-up",
          status: "archived",
          pinned: true,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          launchId: launchBody.data.id,
          app: expect.objectContaining({
            id: "app_policy_watch",
          }),
          activeGroup: expect.objectContaining({
            id: "grp_research",
          }),
          messages: [],
          run: expect.objectContaining({
            id: launchBody.data.runId,
          }),
        },
      } satisfies WorkspaceConversationUpdateResponse);

      const refreshedConversation = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(refreshedConversation.statusCode).toBe(200);
      expect(
        (refreshedConversation.json() as WorkspaceConversationResponse).data,
      ).toMatchObject({
        id: conversationId,
        title: "Policy follow-up",
        status: "archived",
        pinned: true,
      });

      const history = await app.inject({
        method: "GET",
        url: "/workspace/conversations?q=follow-up",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(history.statusCode).toBe(200);
      expect(
        (history.json() as WorkspaceConversationListResponse).data.items,
      ).toEqual([
        expect.objectContaining({
          id: conversationId,
          title: "Policy follow-up",
          status: "archived",
          pinned: true,
        }),
      ]);

      const remove = await app.inject({
        method: "PUT",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          status: "deleted",
        },
      });

      expect(remove.statusCode).toBe(200);
      expect(remove.json()).toEqual({
        ok: true,
        data: expect.objectContaining({
          id: conversationId,
          status: "deleted",
          pinned: true,
        }),
      } satisfies WorkspaceConversationUpdateResponse);

      const deletedConversation = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(deletedConversation.statusCode).toBe(404);

      const deletedRunList = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/runs`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(deletedRunList.statusCode).toBe(404);

      const historyAfterDelete = await app.inject({
        method: "GET",
        url: "/workspace/conversations?q=follow-up",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(historyAfterDelete.statusCode).toBe(200);
      expect(
        (historyAfterDelete.json() as WorkspaceConversationListResponse).data
          .items,
      ).toEqual([]);

      expect(
        await auditService.listEvents({ actorUserId: login.data.user.id }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.conversation.updated",
            entityType: "conversation",
            entityId: conversationId,
            payload: expect.objectContaining({
              title: "Policy follow-up",
              status: "archived",
              pinned: true,
            }),
          }),
          expect.objectContaining({
            action: "workspace.conversation.deleted",
            entityType: "conversation",
            entityId: conversationId,
            payload: expect.objectContaining({
              status: "deleted",
              pinned: true,
            }),
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it("rejects invalid workspace preference payloads and blocked launches", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const { app } = await createTestApp(authService, {}, { auditService });

    authService.register({
      email: "developer@iflabx.com",
      password: "Secure123",
      displayName: "Developer",
    });

    const login = authService.login({
      email: "developer@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected active login to succeed");
    }

    try {
      const invalidPreferences = await app.inject({
        method: "PUT",
        url: "/workspace/preferences",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          favoriteAppIds: "broken",
          recentAppIds: [],
          defaultActiveGroupId: "grp_product",
        },
      });

      expect(invalidPreferences.statusCode).toBe(400);
      expect(invalidPreferences.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_INVALID_PAYLOAD",
        },
      });

      const blockedLaunch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_policy_watch",
          activeGroupId: "grp_product",
        },
      });

      expect(blockedLaunch.statusCode).toBe(409);
      expect(blockedLaunch.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_LAUNCH_BLOCKED",
          details: {
            reason: "group_switch_required",
          },
        },
      });

      const quotaBlockedLaunch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_release_radar",
          activeGroupId: "grp_product",
        },
      });

      expect(quotaBlockedLaunch.statusCode).toBe(409);
      expect(quotaBlockedLaunch.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_LAUNCH_BLOCKED",
          details: {
            reason: "quota_exceeded",
          },
        },
      });

      expect(
        await auditService.listEvents({ actorUserId: login.data.user.id }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.quota.launch_blocked",
            entityId: "app_release_radar",
            payload: expect.objectContaining({
              reason: "quota_exceeded",
            }),
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it("updates persisted assistant message feedback for a workspace conversation", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const { app } = await createTestApp(authService, {}, { auditService });

    authService.register({
      email: "developer@iflabx.com",
      password: "Secure123",
      displayName: "Developer",
    });

    const login = authService.login({
      email: "developer@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected active login to succeed");
    }

    try {
      const launch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_policy_watch",
          activeGroupId: "grp_research",
        },
      });

      expect(launch.statusCode).toBe(200);

      const launchBody = launch.json() as WorkspaceAppLaunchResponse;
      const conversationId = launchBody.data.conversationId;

      expect(conversationId).toBeTruthy();

      if (!conversationId) {
        throw new Error("expected launch to return a conversation id");
      }

      const completion = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          app_id: "app_policy_watch",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Summarize the latest policy changes.",
            },
          ],
        },
      });

      expect(completion.statusCode).toBe(200);

      const conversation = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(conversation.statusCode).toBe(200);

      const assistantMessage = (
        conversation.json() as WorkspaceConversationResponse
      ).data.messages.find((message) => message.role === "assistant");

      expect(assistantMessage?.id).toBeTruthy();

      if (!assistantMessage) {
        throw new Error("expected assistant message to exist");
      }

      const feedback = await app.inject({
        method: "PUT",
        url: `/workspace/conversations/${conversationId}/messages/${assistantMessage.id}/feedback`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          rating: "positive",
        },
      });

      expect(feedback.statusCode).toBe(200);
      expect(feedback.json()).toMatchObject({
        ok: true,
        data: {
          conversationId,
          message: expect.objectContaining({
            id: assistantMessage.id,
            feedback: {
              rating: "positive",
              updatedAt: expect.any(String),
            },
          }),
        },
      } satisfies WorkspaceConversationMessageFeedbackResponse);

      const refreshedConversation = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(refreshedConversation.statusCode).toBe(200);
      expect(
        (refreshedConversation.json() as WorkspaceConversationResponse).data
          .messages,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: assistantMessage.id,
            feedback: expect.objectContaining({
              rating: "positive",
            }),
          }),
        ]),
      );

      expect(
        await auditService.listEvents({ actorUserId: login.data.user.id }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.message.feedback.updated",
            entityType: "conversation_message",
            entityId: assistantMessage.id,
            payload: expect.objectContaining({
              conversationId,
              rating: "positive",
            }),
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it("uploads a conversation attachment and enforces type limits", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: "developer@iflabx.com",
      password: "Secure123",
      displayName: "Developer",
    });

    const login = authService.login({
      email: "developer@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected active login to succeed");
    }

    try {
      const launch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_policy_watch",
          activeGroupId: "grp_research",
        },
      });
      const launchBody = launch.json() as WorkspaceAppLaunchResponse;
      const conversationId = launchBody.data.conversationId;

      if (!conversationId) {
        throw new Error("expected launch payload to include a conversation id");
      }

      const uploadResponse = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/uploads`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          fileName: "brief.txt",
          contentType: "text/plain",
          base64Data: Buffer.from("Policy changes for research.").toString(
            "base64",
          ),
        },
      });

      expect(uploadResponse.statusCode).toBe(200);
      expect(
        (uploadResponse.json() as WorkspaceConversationUploadResponse).data,
      ).toMatchObject({
        id: expect.stringMatching(/^file_/),
        fileName: "brief.txt",
        contentType: "text/plain",
        sizeBytes: 28,
        uploadedAt: expect.any(String),
      });

      const blockedUploadResponse = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/uploads`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          fileName: "script.exe",
          contentType: "application/octet-stream",
          base64Data: Buffer.from("not allowed").toString("base64"),
        },
      });

      expect(blockedUploadResponse.statusCode).toBe(409);
      expect(blockedUploadResponse.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_UPLOAD_BLOCKED",
        },
      });
    } finally {
      await app.close();
    }
  }, 15_000);

  it("creates, lists, revokes, and reads group-scoped conversation shares", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const { app } = await createTestApp(authService, {}, { auditService });

    authService.register({
      email: "owner@iflabx.com",
      password: "Secure123",
      displayName: "Owner",
    });
    authService.register({
      email: "reader@example.com",
      password: "Secure123",
      displayName: "Reader",
    });

    const ownerLogin = authService.login({
      email: "owner@iflabx.com",
      password: "Secure123",
    });
    const readerLogin = authService.login({
      email: "reader@example.com",
      password: "Secure123",
    });

    expect(ownerLogin.ok).toBe(true);
    expect(readerLogin.ok).toBe(true);

    if (!ownerLogin.ok || !readerLogin.ok) {
      throw new Error("expected both logins to succeed");
    }

    try {
      const launch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
        payload: {
          appId: "app_policy_watch",
          activeGroupId: "grp_research",
        },
      });
      const conversationId = (launch.json() as WorkspaceAppLaunchResponse).data
        .conversationId;

      if (!conversationId) {
        throw new Error("expected launch payload to include a conversation id");
      }

      const createShare = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/shares`,
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
        payload: {
          groupId: "grp_research",
        },
      });

      expect(createShare.statusCode).toBe(200);
      const share = (createShare.json() as WorkspaceConversationShareResponse)
        .data;
      expect(share).toMatchObject({
        id: expect.stringMatching(/^share_/),
        conversationId,
        status: "active",
        access: "read_only",
        group: {
          id: "grp_research",
        },
        shareUrl: expect.stringMatching(/^\/chat\/shared\/share_/),
      });

      const listShares = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/shares`,
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
      });

      expect(listShares.statusCode).toBe(200);
      expect(
        (listShares.json() as WorkspaceConversationSharesResponse).data.shares,
      ).toEqual([
        expect.objectContaining({
          id: share.id,
          status: "active",
        }),
      ]);

      const sharedRead = await app.inject({
        method: "GET",
        url: `/workspace/shares/${share.id}`,
        headers: {
          authorization: `Bearer ${readerLogin.data.sessionToken}`,
        },
      });

      expect(sharedRead.statusCode).toBe(200);
      expect(
        (sharedRead.json() as WorkspaceSharedConversationResponse).data,
      ).toMatchObject({
        share: {
          id: share.id,
          group: {
            id: "grp_research",
          },
        },
        conversation: {
          id: conversationId,
          app: {
            id: "app_policy_watch",
          },
        },
      });

      const revokeShare = await app.inject({
        method: "DELETE",
        url: `/workspace/conversations/${conversationId}/shares/${share.id}`,
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
      });

      expect(revokeShare.statusCode).toBe(200);
      expect(
        (revokeShare.json() as WorkspaceConversationShareResponse).data,
      ).toMatchObject({
        id: share.id,
        status: "revoked",
      });

      const sharedReadAfterRevoke = await app.inject({
        method: "GET",
        url: `/workspace/shares/${share.id}`,
        headers: {
          authorization: `Bearer ${readerLogin.data.sessionToken}`,
        },
      });

      expect(sharedReadAfterRevoke.statusCode).toBe(404);

      const auditEvents = await auditService.listEvents({
        tenantId: testEnv.defaultTenantId,
      });

      expect(auditEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.conversation_share.created",
            entityType: "conversation_share",
            entityId: share.id,
          }),
          expect.objectContaining({
            action: "workspace.conversation_share.accessed",
            entityType: "conversation_share",
            entityId: share.id,
          }),
          expect.objectContaining({
            action: "workspace.conversation_share.revoked",
            entityType: "conversation_share",
            entityId: share.id,
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it("lists recent conversations and exposes persisted run timeline events", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: "timeline@iflabx.com",
      password: "Secure123",
      displayName: "Timeline User",
    });

    const login = authService.login({
      email: "timeline@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected timeline login to succeed");
    }

    try {
      const launch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_policy_watch",
          activeGroupId: "grp_research",
        },
      });
      const launchBody = launch.json() as WorkspaceAppLaunchResponse;
      const conversationId = launchBody.data.conversationId;

      if (!conversationId) {
        throw new Error("expected launch payload to include a conversation id");
      }

      const completion = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          model: "app_policy_watch",
          app_id: "app_policy_watch",
          stream: false,
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content:
                "Create a searchable history entry for timeline coverage.",
            },
          ],
        },
      });

      expect(completion.statusCode).toBe(200);
      const completionBody = completion.json() as {
        id: string;
      };

      const history = await app.inject({
        method: "GET",
        url: "/workspace/conversations?appId=app_policy_watch&groupId=grp_research&q=searchable",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(history.statusCode).toBe(200);
      expect(
        (history.json() as WorkspaceConversationListResponse).data.items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: conversationId,
            app: expect.objectContaining({
              id: "app_policy_watch",
            }),
            activeGroup: expect.objectContaining({
              id: "grp_research",
            }),
            messageCount: 2,
          }),
        ]),
      );

      const runResponse = await app.inject({
        method: "GET",
        url: `/workspace/runs/${completionBody.id}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runResponse.statusCode).toBe(200);
      expect(
        (runResponse.json() as WorkspaceRunResponse).data.timeline,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "run_created" }),
          expect.objectContaining({ type: "input_recorded" }),
          expect.objectContaining({ type: "run_started" }),
          expect.objectContaining({ type: "output_recorded" }),
          expect.objectContaining({ type: "run_succeeded" }),
        ]),
      );
    } finally {
      await app.close();
    }
  });
});
