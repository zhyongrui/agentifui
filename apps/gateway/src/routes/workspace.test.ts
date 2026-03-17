import type {
  WorkspaceArtifactResponse,
  WorkspaceAppLaunchResponse,
  WorkspaceCatalogResponse,
  WorkspaceCommentCreateResponse,
  WorkspaceConversationListResponse,
  WorkspaceConversationMessageFeedbackResponse,
  WorkspaceConversationPresenceResponse,
  WorkspaceConversationResponse,
  WorkspaceNotificationReadResponse,
  WorkspaceNotificationsResponse,
  WorkspacePendingActionRespondResponse,
  WorkspacePendingActionsResponse,
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
import type { ChatCompletionResponse } from "@agentifui/shared/chat";

import { buildApp } from "../app.js";
import { createAuditService } from "../services/audit-service.js";
import { createAdminService } from "../services/admin-service.js";
import { createAuthService } from "../services/auth-service.js";
import {
  createWorkspaceRuntimeService,
  type WorkspaceRuntimeService,
} from "../services/workspace-runtime.js";
import { createWorkspaceService } from "../services/workspace-service.js";

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

function createSwitchableRuntimeService(): {
  runtimeService: WorkspaceRuntimeService;
  setDegraded(value: boolean): void;
} {
  const availableService = createWorkspaceRuntimeService();
  let degraded = false;

  const readSnapshot = () => {
    const snapshot = availableService.getHealthSnapshot();

    if (!degraded) {
      return snapshot;
    }

    return {
      overallStatus: "degraded" as const,
      runtimes: snapshot.runtimes.map((runtime) => ({
        ...runtime,
        status: "degraded" as const,
      })),
    };
  };

  return {
    runtimeService: {
      getHealthSnapshot() {
        return readSnapshot();
      },
      async invoke(input) {
        if (!degraded) {
          return availableService.invoke(input);
        }

        const snapshot = readSnapshot();
        const runtime =
          snapshot.runtimes.find((entry) => entry.id === "placeholder") ??
          snapshot.runtimes[0] ??
          null;

        return {
          ok: false as const,
          error: {
            code: "runtime_unavailable" as const,
            message: `${runtime?.label ?? "Workspace runtime"} is currently degraded.`,
            detail:
              "Wait for the adapter health probe to recover before retrying.",
            retryable: true,
            runtime: runtime
              ? {
                  ...runtime,
                  invokedAt: new Date().toISOString(),
                }
              : null,
          },
        };
      },
    },
    setDegraded(value) {
      degraded = value;
    },
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

  it("tracks conversation presence sessions for multiple viewers", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: "reviewer@iflabx.com",
      password: "Secure123",
      displayName: "Reviewer",
    });

    const login = authService.login({
      email: "reviewer@iflabx.com",
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
      const runId = launchBody.data.runId;

      if (!conversationId || !runId) {
        throw new Error("expected launch payload to include conversation and run ids");
      }

      const firstPresence = await app.inject({
        method: "PUT",
        url: `/workspace/conversations/${conversationId}/presence`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          sessionId: "presence-a",
          state: "active",
          activeRunId: runId,
        },
      });

      expect(firstPresence.statusCode).toBe(200);
      expect((firstPresence.json() as WorkspaceConversationPresenceResponse).data).toMatchObject({
        conversationId,
        ttlSeconds: 60,
        viewers: [
          expect.objectContaining({
            sessionId: "presence-a",
            displayName: "Reviewer",
            state: "active",
            activeRunId: runId,
            isCurrentUser: true,
          }),
        ],
      });

      const secondPresence = await app.inject({
        method: "PUT",
        url: `/workspace/conversations/${conversationId}/presence`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          sessionId: "presence-b",
          state: "idle",
        },
      });

      expect(secondPresence.statusCode).toBe(200);
      expect((secondPresence.json() as WorkspaceConversationPresenceResponse).data.viewers).toEqual([
        expect.objectContaining({
          sessionId: "presence-b",
          state: "idle",
          isCurrentUser: true,
        }),
        expect.objectContaining({
          sessionId: "presence-a",
          state: "active",
          activeRunId: runId,
          isCurrentUser: true,
        }),
      ]);

      const listPresence = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/presence`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(listPresence.statusCode).toBe(200);
      expect((listPresence.json() as WorkspaceConversationPresenceResponse).data).toMatchObject({
        conversationId,
        viewers: [
          expect.objectContaining({
            sessionId: "presence-b",
            state: "idle",
          }),
          expect.objectContaining({
            sessionId: "presence-a",
            state: "active",
            activeRunId: runId,
          }),
        ],
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

  it("creates workspace comment threads for messages, runs and artifacts", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const { app } = await createTestApp(authService, {}, { auditService });

    authService.register({
      email: "comments@iflabx.com",
      password: "Secure123",
      displayName: "Comments Reviewer",
    });
    authService.register({
      email: "reviewer@example.net",
      password: "Secure123",
      displayName: "Review Partner",
    });

    const login = authService.login({
      email: "comments@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected active login to succeed");
    }

    const reviewerLogin = authService.login({
      email: "reviewer@example.net",
      password: "Secure123",
    });

    expect(reviewerLogin.ok).toBe(true);

    if (!reviewerLogin.ok) {
      throw new Error("expected reviewer login to succeed");
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

      const conversationBody = conversation.json() as WorkspaceConversationResponse;
      const assistantMessage = [...conversationBody.data.messages]
        .reverse()
        .find((message) => message.role === "assistant");

      if (!assistantMessage) {
        throw new Error("expected assistant message to exist");
      }

      const runs = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/runs`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runs.statusCode).toBe(200);

      const latestRunId = (runs.json() as WorkspaceConversationRunsResponse).data.runs[0]?.id;

      if (!latestRunId) {
        throw new Error("expected latest run to exist");
      }

      const run = await app.inject({
        method: "GET",
        url: `/workspace/runs/${latestRunId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(run.statusCode).toBe(200);

      const artifactId = (run.json() as WorkspaceRunResponse).data.artifacts[0]?.id;

      if (!artifactId) {
        throw new Error("expected generated artifact to exist");
      }

      const share = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/shares`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          groupId: "grp_research",
        },
      });

      expect(share.statusCode).toBe(200);

      const messageComment = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/comments`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          targetType: "message",
          targetId: assistantMessage.id,
          content:
            "Please tighten the summary before sharing. @reviewer@example.net can review the draft.",
        },
      });

      expect(messageComment.statusCode).toBe(200);
      expect(messageComment.json()).toMatchObject({
        ok: true,
        data: {
          conversationId,
          targetType: "message",
          targetId: assistantMessage.id,
          comment: expect.objectContaining({
            content:
              "Please tighten the summary before sharing. @reviewer@example.net can review the draft.",
            mentions: [
              expect.objectContaining({
                email: "reviewer@example.net",
                displayName: "Review Partner",
              }),
            ],
          }),
          thread: [
            expect.objectContaining({
              content:
                "Please tighten the summary before sharing. @reviewer@example.net can review the draft.",
            }),
          ],
        },
      } satisfies WorkspaceCommentCreateResponse);

      const runComment = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/comments`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          targetType: "run",
          targetId: latestRunId,
          content: "This run is ready for operator review.",
        },
      });

      expect(runComment.statusCode).toBe(200);

      const artifactComment = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/comments`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          targetType: "artifact",
          targetId: artifactId,
          content: "Use this artifact in the weekly digest.",
        },
      });

      expect(artifactComment.statusCode).toBe(200);

      const refreshedConversation = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(refreshedConversation.statusCode).toBe(200);
      expect(
        (refreshedConversation.json() as WorkspaceConversationResponse).data.messages,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: assistantMessage.id,
            comments: [
              expect.objectContaining({
                content:
                  "Please tighten the summary before sharing. @reviewer@example.net can review the draft.",
                mentions: [
                  expect.objectContaining({
                    email: "reviewer@example.net",
                  }),
                ],
              }),
            ],
          }),
        ]),
      );

      const refreshedRun = await app.inject({
        method: "GET",
        url: `/workspace/runs/${latestRunId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(refreshedRun.statusCode).toBe(200);
      expect((refreshedRun.json() as WorkspaceRunResponse).data.comments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: "This run is ready for operator review.",
          }),
        ]),
      );

      const refreshedArtifact = await app.inject({
        method: "GET",
        url: `/workspace/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(refreshedArtifact.statusCode).toBe(200);
      expect(
        (refreshedArtifact.json() as WorkspaceArtifactResponse).data.comments,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: "Use this artifact in the weekly digest.",
          }),
        ]),
      );

      expect(
        await auditService.listEvents({ actorUserId: login.data.user.id }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.comment.created",
            entityType: "conversation_comment",
            payload: expect.objectContaining({
              conversationId,
              targetType: "message",
              targetId: assistantMessage.id,
              mentionCount: 1,
              mentionedUserIds: [reviewerLogin.data.user.id],
            }),
          }),
          expect.objectContaining({
            action: "workspace.comment.created",
            entityType: "conversation_comment",
            payload: expect.objectContaining({
              conversationId,
              targetType: "run",
              targetId: latestRunId,
            }),
          }),
          expect.objectContaining({
            action: "workspace.comment.created",
            entityType: "conversation_comment",
            payload: expect.objectContaining({
              conversationId,
              targetType: "artifact",
              targetId: artifactId,
            }),
          }),
        ]),
      );

      const notifications = await app.inject({
        method: "GET",
        url: "/workspace/notifications",
        headers: {
          authorization: `Bearer ${reviewerLogin.data.sessionToken}`,
        },
      });

      expect(notifications.statusCode).toBe(200);
      expect(notifications.json()).toMatchObject({
        ok: true,
        data: {
          unreadCount: 1,
          items: [
            expect.objectContaining({
              type: "comment_mention",
              status: "unread",
              conversationId,
              conversationTitle: expect.any(String),
              targetType: "message",
              targetId: assistantMessage.id,
              actorDisplayName: "Comments Reviewer",
            }),
          ],
        },
      } satisfies WorkspaceNotificationsResponse);

      const notificationId = (
        notifications.json() as WorkspaceNotificationsResponse
      ).data.items[0]?.id;

      if (!notificationId) {
        throw new Error("expected a notification id");
      }

      const markRead = await app.inject({
        method: "PUT",
        url: `/workspace/notifications/${notificationId}/read`,
        headers: {
          authorization: `Bearer ${reviewerLogin.data.sessionToken}`,
        },
      });

      expect(markRead.statusCode).toBe(200);
      expect(markRead.json()).toMatchObject({
        ok: true,
        data: expect.objectContaining({
          id: notificationId,
          status: "read",
        }),
      } satisfies WorkspaceNotificationReadResponse);
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

      const completion = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
        payload: {
          app_id: "app_policy_watch",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Create a shared artifact for my research group.",
            },
          ],
        },
      });

      expect(completion.statusCode).toBe(200);

      const artifactId = (completion.json() as ChatCompletionResponse).choices[0]
        ?.message.artifacts?.[0]?.id;

      expect(artifactId).toEqual(expect.stringMatching(/^artifact_/));

      if (!artifactId) {
        throw new Error("expected completion payload to include an artifact id");
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

      const sharedArtifact = await app.inject({
        method: "GET",
        url: `/workspace/shares/${share.id}/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${readerLogin.data.sessionToken}`,
        },
      });

      expect(sharedArtifact.statusCode).toBe(200);
      expect((sharedArtifact.json() as WorkspaceArtifactResponse).data).toMatchObject({
        id: artifactId,
        kind: "markdown",
      });

      const sharedArtifactDownload = await app.inject({
        method: "GET",
        url: `/workspace/shares/${share.id}/artifacts/${artifactId}/download`,
        headers: {
          authorization: `Bearer ${readerLogin.data.sessionToken}`,
        },
      });

      expect(sharedArtifactDownload.statusCode).toBe(200);
      expect(sharedArtifactDownload.headers["content-type"]).toContain("text/markdown");
      expect(sharedArtifactDownload.headers["content-disposition"]).toContain(".md");
      expect(sharedArtifactDownload.headers["x-agentifui-artifact-id"]).toBe(artifactId);
      expect(sharedArtifactDownload.body).toContain(
        "Policy Watch is now reachable through the AgentifUI gateway."
      );

      const ownerArtifactFromReaderBoundary = await app.inject({
        method: "GET",
        url: `/workspace/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${readerLogin.data.sessionToken}`,
        },
      });

      expect(ownerArtifactFromReaderBoundary.statusCode).toBe(404);

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
            action: "workspace.artifact.viewed",
            entityType: "artifact",
            entityId: artifactId,
            payload: expect.objectContaining({
              accessScope: "shared_read_only",
              shareId: share.id,
            }),
          }),
          expect.objectContaining({
            action: "workspace.artifact.downloaded",
            entityType: "artifact",
            entityId: artifactId,
            payload: expect.objectContaining({
              accessScope: "shared_read_only",
              shareId: share.id,
            }),
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

  it("blocks share creation that exceeds the tenant sharing policy", async () => {
    const authService = createTestAuthService();
    const adminService = createAdminService();
    const originalGetIdentityOverviewForUser = adminService.getIdentityOverviewForUser;
    adminService.getIdentityOverviewForUser = async (user, input) => {
      const overview = await originalGetIdentityOverviewForUser(user, input);

      return {
        ...overview,
        governance: overview.governance
          ? {
              ...overview.governance,
              policyPack: {
                ...overview.governance.policyPack,
                sharingMode: "commenter",
              },
            }
          : overview.governance,
      };
    };
    const { app } = await createTestApp(authService, {}, { adminService });

    authService.register({
      email: "owner@iflabx.com",
      password: "Secure123",
      displayName: "Owner",
    });

    const ownerLogin = authService.login({
      email: "owner@iflabx.com",
      password: "Secure123",
    });

    expect(ownerLogin.ok).toBe(true);

    if (!ownerLogin.ok) {
      throw new Error("expected owner login to succeed");
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
      const conversationId = (launch.json() as WorkspaceAppLaunchResponse).data.conversationId;

      const createShare = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/shares`,
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
        payload: {
          groupId: "grp_research",
          access: "editor",
        },
      });

      expect(createShare.statusCode).toBe(403);
      expect(createShare.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_FORBIDDEN",
          details: {
            requestedAccess: "editor",
            allowedAccess: "commenter",
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it("blocks shared artifact downloads when the tenant artifact policy is owner only", async () => {
    const authService = createTestAuthService();
    const adminService = createAdminService();
    const originalGetIdentityOverviewForUser = adminService.getIdentityOverviewForUser;
    adminService.getIdentityOverviewForUser = async (user, input) => {
      const overview = await originalGetIdentityOverviewForUser(user, input);

      return {
        ...overview,
        governance: overview.governance
          ? {
              ...overview.governance,
              policyPack: {
                ...overview.governance.policyPack,
                artifactDownloadMode: "owner_only",
              },
            }
          : overview.governance,
      };
    };
    const { app } = await createTestApp(authService, {}, { adminService });

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
      const conversationId = (launch.json() as WorkspaceAppLaunchResponse).data.conversationId;

      const completion = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
        payload: {
          app_id: "app_policy_watch",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Create a shared artifact for my research group.",
            },
          ],
        },
      });
      const artifactId = (completion.json() as ChatCompletionResponse).choices[0]?.message.artifacts?.[0]?.id;

      if (!artifactId) {
        throw new Error("expected completion payload to include an artifact id");
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
      const shareId = (createShare.json() as WorkspaceConversationShareResponse).data.id;

      const sharedArtifactDownload = await app.inject({
        method: "GET",
        url: `/workspace/shares/${shareId}/artifacts/${artifactId}/download`,
        headers: {
          authorization: `Bearer ${readerLogin.data.sessionToken}`,
        },
      });

      expect(sharedArtifactDownload.statusCode).toBe(403);
      expect(sharedArtifactDownload.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_FORBIDDEN",
          details: {
            artifactDownloadMode: "owner_only",
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it("enforces shared commenter and editor access modes", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const { app } = await createTestApp(authService, {}, { auditService });

    authService.register({
      email: "owner@iflabx.com",
      password: "Secure123",
      displayName: "Owner",
    });
    authService.register({
      email: "reviewer@example.com",
      password: "Secure123",
      displayName: "Reviewer",
    });

    const ownerLogin = authService.login({
      email: "owner@iflabx.com",
      password: "Secure123",
    });
    const reviewerLogin = authService.login({
      email: "reviewer@example.com",
      password: "Secure123",
    });

    expect(ownerLogin.ok).toBe(true);
    expect(reviewerLogin.ok).toBe(true);

    if (!ownerLogin.ok || !reviewerLogin.ok) {
      throw new Error("expected shared-access logins to succeed");
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

      expect(launch.statusCode).toBe(200);

      const conversationId = (launch.json() as WorkspaceAppLaunchResponse).data.conversationId;

      if (!conversationId) {
        throw new Error("expected launch payload to include a conversation id");
      }

      const completion = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
        payload: {
          app_id: "app_policy_watch",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Prepare a reviewer handoff for the shared transcript.",
            },
          ],
        },
      });

      expect(completion.statusCode).toBe(200);

      const conversation = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
      });

      expect(conversation.statusCode).toBe(200);

      const assistantMessage = (conversation.json() as WorkspaceConversationResponse).data.messages.find(
        (message) => message.role === "assistant",
      );

      if (!assistantMessage) {
        throw new Error("expected seeded assistant message");
      }

      const readOnlyShareResponse = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/shares`,
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
        payload: {
          groupId: "grp_research",
          access: "read_only",
        },
      });

      expect(readOnlyShareResponse.statusCode).toBe(200);

      const readOnlyShare = (readOnlyShareResponse.json() as WorkspaceConversationShareResponse).data;

      expect(readOnlyShare.access).toBe("read_only");

      const blockedComment = await app.inject({
        method: "POST",
        url: `/workspace/shares/${readOnlyShare.id}/comments`,
        headers: {
          authorization: `Bearer ${reviewerLogin.data.sessionToken}`,
        },
        payload: {
          targetType: "message",
          targetId: assistantMessage.id,
          content: "I should not be able to comment yet.",
        },
      });

      expect(blockedComment.statusCode).toBe(403);
      expect(blockedComment.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_FORBIDDEN",
        },
      });

      const commenterShareResponse = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/shares`,
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
        payload: {
          groupId: "grp_research",
          access: "commenter",
        },
      });

      expect(commenterShareResponse.statusCode).toBe(200);

      const commenterShare = (commenterShareResponse.json() as WorkspaceConversationShareResponse).data;

      expect(commenterShare.id).toBe(readOnlyShare.id);
      expect(commenterShare.access).toBe("commenter");

      const commenterView = await app.inject({
        method: "GET",
        url: `/workspace/shares/${commenterShare.id}`,
        headers: {
          authorization: `Bearer ${reviewerLogin.data.sessionToken}`,
        },
      });

      expect(commenterView.statusCode).toBe(200);
      expect((commenterView.json() as WorkspaceSharedConversationResponse).data.share.access).toBe(
        "commenter",
      );

      const sharedComment = await app.inject({
        method: "POST",
        url: `/workspace/shares/${commenterShare.id}/comments`,
        headers: {
          authorization: `Bearer ${reviewerLogin.data.sessionToken}`,
        },
        payload: {
          targetType: "message",
          targetId: assistantMessage.id,
          content: "Shared comment from the reviewer. @owner@iflabx.com please confirm.",
        },
      });

      expect(sharedComment.statusCode).toBe(200);
      expect(sharedComment.json()).toMatchObject({
        ok: true,
        data: {
          conversationId,
          targetType: "message",
          targetId: assistantMessage.id,
          comment: expect.objectContaining({
            mentions: [
              expect.objectContaining({
                email: "owner@iflabx.com",
              }),
            ],
          }),
        },
      });

      const blockedMetadataUpdate = await app.inject({
        method: "PUT",
        url: `/workspace/shares/${commenterShare.id}/conversation`,
        headers: {
          authorization: `Bearer ${reviewerLogin.data.sessionToken}`,
        },
        payload: {
          title: "Reviewer should not edit this yet",
        },
      });

      expect(blockedMetadataUpdate.statusCode).toBe(403);

      const editorShareResponse = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/shares`,
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
        payload: {
          groupId: "grp_research",
          access: "editor",
        },
      });

      expect(editorShareResponse.statusCode).toBe(200);

      const editorShare = (editorShareResponse.json() as WorkspaceConversationShareResponse).data;

      expect(editorShare.id).toBe(readOnlyShare.id);
      expect(editorShare.access).toBe("editor");

      const sharedMetadataUpdate = await app.inject({
        method: "PUT",
        url: `/workspace/shares/${editorShare.id}/conversation`,
        headers: {
          authorization: `Bearer ${reviewerLogin.data.sessionToken}`,
        },
        payload: {
          title: "Reviewer updated title",
          status: "archived",
          pinned: true,
        },
      });

      expect(sharedMetadataUpdate.statusCode).toBe(200);
      expect(sharedMetadataUpdate.json()).toMatchObject({
        ok: true,
        data: {
          id: conversationId,
          title: "Reviewer updated title",
          status: "archived",
          pinned: true,
        },
      });

      const refreshedConversation = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
      });

      expect(refreshedConversation.statusCode).toBe(200);
      expect((refreshedConversation.json() as WorkspaceConversationResponse).data).toMatchObject({
        title: "Reviewer updated title",
        status: "archived",
        pinned: true,
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: assistantMessage.id,
            comments: expect.arrayContaining([
              expect.objectContaining({
                content: "Shared comment from the reviewer. @owner@iflabx.com please confirm.",
              }),
            ]),
          }),
        ]),
      });

      const auditEvents = await auditService.listEvents({
        tenantId: testEnv.defaultTenantId,
      });

      expect(auditEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.comment.created",
            entityType: "conversation_comment",
            payload: expect.objectContaining({
              accessScope: "shared_commenter",
              shareId: readOnlyShare.id,
            }),
          }),
          expect.objectContaining({
            action: "workspace.conversation.updated",
            entityType: "conversation",
            payload: expect.objectContaining({
              accessScope: "shared_editor",
              shareId: readOnlyShare.id,
              title: "Reviewer updated title",
            }),
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it("returns a conflict when shared editors submit stale conversation metadata", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: "owner@iflabx.com",
      password: "Secure123",
      displayName: "Owner",
    });
    authService.register({
      email: "reviewer@example.com",
      password: "Secure123",
      displayName: "Reviewer",
    });

    const ownerLogin = authService.login({
      email: "owner@iflabx.com",
      password: "Secure123",
    });
    const reviewerLogin = authService.login({
      email: "reviewer@example.com",
      password: "Secure123",
    });

    expect(ownerLogin.ok).toBe(true);
    expect(reviewerLogin.ok).toBe(true);

    if (!ownerLogin.ok || !reviewerLogin.ok) {
      throw new Error("expected conflict test logins to succeed");
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

      expect(launch.statusCode).toBe(200);

      const conversationId = (launch.json() as WorkspaceAppLaunchResponse).data.conversationId;

      if (!conversationId) {
        throw new Error("expected launch payload to include a conversation id");
      }

      const shareCreate = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/shares`,
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
        payload: {
          groupId: "grp_research",
          access: "editor",
        },
      });

      expect(shareCreate.statusCode).toBe(200);
      const share = (shareCreate.json() as WorkspaceConversationShareResponse).data;

      const sharedConversation = await app.inject({
        method: "GET",
        url: `/workspace/shares/${share.id}`,
        headers: {
          authorization: `Bearer ${reviewerLogin.data.sessionToken}`,
        },
      });

      expect(sharedConversation.statusCode).toBe(200);

      const staleUpdatedAt = "2026-01-01T00:00:00.000Z";

      const ownerUpdate = await app.inject({
        method: "PUT",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${ownerLogin.data.sessionToken}`,
        },
        payload: {
          title: "Owner changed title first",
        },
      });

      expect(ownerUpdate.statusCode).toBe(200);

      const staleUpdate = await app.inject({
        method: "PUT",
        url: `/workspace/shares/${share.id}/conversation`,
        headers: {
          authorization: `Bearer ${reviewerLogin.data.sessionToken}`,
        },
        payload: {
          expectedUpdatedAt: staleUpdatedAt,
          title: "Reviewer stale title",
        },
      });

      expect(staleUpdate.statusCode).toBe(409);
      expect(staleUpdate.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_ACTION_CONFLICT",
          details: expect.objectContaining({
            conversationId,
            expectedUpdatedAt: staleUpdatedAt,
            currentTitle: "Owner changed title first",
          }),
        },
      });
    } finally {
      await app.close();
    }
  });

  it("tracks shared conversation presence sessions for shared viewers", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: "owner@iflabx.com",
      password: "Secure123",
      displayName: "Owner",
    });
    authService.register({
      email: "reader-a@example.com",
      password: "Secure123",
      displayName: "Reader A",
    });
    authService.register({
      email: "reader-b@example.com",
      password: "Secure123",
      displayName: "Reader B",
    });

    const ownerLogin = authService.login({
      email: "owner@iflabx.com",
      password: "Secure123",
    });
    const readerALogin = authService.login({
      email: "reader-a@example.com",
      password: "Secure123",
    });
    const readerBLogin = authService.login({
      email: "reader-b@example.com",
      password: "Secure123",
    });

    expect(ownerLogin.ok).toBe(true);
    expect(readerALogin.ok).toBe(true);
    expect(readerBLogin.ok).toBe(true);

    if (!ownerLogin.ok || !readerALogin.ok || !readerBLogin.ok) {
      throw new Error("expected all shared presence logins to succeed");
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

      expect(launch.statusCode).toBe(200);

      const conversationId = (launch.json() as WorkspaceAppLaunchResponse).data
        .conversationId;

      if (!conversationId) {
        throw new Error("expected shared presence launch to include a conversation id");
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

      const share = (createShare.json() as WorkspaceConversationShareResponse).data;

      const firstPresence = await app.inject({
        method: "PUT",
        url: `/workspace/shares/${share.id}/presence`,
        headers: {
          authorization: `Bearer ${readerALogin.data.sessionToken}`,
        },
        payload: {
          sessionId: "shared-presence-a",
          state: "active",
        },
      });

      expect(firstPresence.statusCode).toBe(200);
      expect((firstPresence.json() as WorkspaceConversationPresenceResponse).data).toMatchObject({
        conversationId,
        ttlSeconds: 60,
        viewers: [
          expect.objectContaining({
            sessionId: "shared-presence-a",
            displayName: "Reader A",
            surface: "shared_conversation",
            state: "active",
            isCurrentUser: true,
          }),
        ],
      });

      const secondPresence = await app.inject({
        method: "PUT",
        url: `/workspace/shares/${share.id}/presence`,
        headers: {
          authorization: `Bearer ${readerBLogin.data.sessionToken}`,
        },
        payload: {
          sessionId: "shared-presence-b",
          state: "idle",
        },
      });

      expect(secondPresence.statusCode).toBe(200);

      const listPresence = await app.inject({
        method: "GET",
        url: `/workspace/shares/${share.id}/presence`,
        headers: {
          authorization: `Bearer ${readerALogin.data.sessionToken}`,
        },
      });

      expect(listPresence.statusCode).toBe(200);
      expect((listPresence.json() as WorkspaceConversationPresenceResponse).data).toMatchObject({
        conversationId,
        viewers: [
          expect.objectContaining({
            sessionId: "shared-presence-b",
            displayName: "Reader B",
            surface: "shared_conversation",
            state: "idle",
            isCurrentUser: false,
          }),
          expect.objectContaining({
            sessionId: "shared-presence-a",
            displayName: "Reader A",
            surface: "shared_conversation",
            state: "active",
            isCurrentUser: true,
          }),
        ],
      });
    } finally {
      await app.close();
    }
  });

  it("keeps conversations readable but blocks uploads while the runtime is degraded", async () => {
    const authService = createTestAuthService();
    const { runtimeService, setDegraded } = createSwitchableRuntimeService();
    const { app } = await createTestApp(authService, {}, { runtimeService });

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

      setDegraded(true);

      const conversation = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(conversation.statusCode).toBe(200);
      expect((conversation.json() as WorkspaceConversationResponse).data.id).toBe(
        conversationId,
      );

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

      expect(uploadResponse.statusCode).toBe(403);
      expect(uploadResponse.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_FORBIDDEN",
          details: {
            reason: "runtime_degraded",
            runtime: {
              overallStatus: "degraded",
            },
          },
        },
      });
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

  it("filters recent conversations by tag, attachment, feedback, and status", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: "history-filters@iflabx.com",
      password: "Secure123",
      displayName: "History Filters",
    });

    const login = authService.login({
      email: "history-filters@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected history filter login to succeed");
    }

    try {
      const policyLaunch = await app.inject({
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
      const policyConversationId = (
        policyLaunch.json() as WorkspaceAppLaunchResponse
      ).data.conversationId;

      if (!policyConversationId) {
        throw new Error("expected policy launch payload to include a conversation id");
      }

      const uploadResponse = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${policyConversationId}/uploads`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          fileName: "policy-brief.txt",
          contentType: "text/plain",
          base64Data: Buffer.from("Policy archive evidence").toString("base64"),
        },
      });

      expect(uploadResponse.statusCode).toBe(200);

      const uploadBody =
        uploadResponse.json() as WorkspaceConversationUploadResponse;

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
          conversation_id: policyConversationId,
          messages: [
            {
              role: "user",
              content: "Create a filterable archived policy thread.",
            },
          ],
          files: [
            {
              type: "local",
              file_id: uploadBody.data.id,
              transfer_method: "local_file",
            },
          ],
        },
      });

      expect(completion.statusCode).toBe(200);

      const policyConversation = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${policyConversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      const assistantMessage = (
        policyConversation.json() as WorkspaceConversationResponse
      ).data.messages.find((message) => message.role === "assistant");

      if (!assistantMessage) {
        throw new Error("expected assistant message to exist");
      }

      const feedback = await app.inject({
        method: "PUT",
        url: `/workspace/conversations/${policyConversationId}/messages/${assistantMessage.id}/feedback`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          rating: "positive",
        },
      });

      expect(feedback.statusCode).toBe(200);

      const archive = await app.inject({
        method: "PUT",
        url: `/workspace/conversations/${policyConversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          status: "archived",
        },
      });

      expect(archive.statusCode).toBe(200);

      const marketLaunch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_market_brief",
          activeGroupId: "grp_product",
        },
      });

      expect(marketLaunch.statusCode).toBe(200);

      const filteredHistory = await app.inject({
        method: "GET",
        url: "/workspace/conversations?tag=policy&attachment=with_attachments&feedback=positive&status=archived",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(filteredHistory.statusCode).toBe(200);
      expect(
        (filteredHistory.json() as WorkspaceConversationListResponse).data,
      ).toMatchObject({
        filters: {
          appId: null,
          attachment: "with_attachments",
          feedback: "positive",
          groupId: null,
          query: null,
          status: "archived",
          tag: "policy",
          limit: 12,
        },
        items: [
          expect.objectContaining({
            id: policyConversationId,
            status: "archived",
            attachmentCount: 1,
            feedbackSummary: {
              positiveCount: 1,
              negativeCount: 0,
            },
            app: expect.objectContaining({
              id: "app_policy_watch",
            }),
          }),
        ],
      });
      expect(
        (filteredHistory.json() as WorkspaceConversationListResponse).data.items,
      ).toHaveLength(1);
    } finally {
      await app.close();
    }
  }, 10_000);

  it("returns persisted artifacts through the workspace artifact route", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const { app } = await createTestApp(authService, {}, { auditService });

    authService.register({
      email: "artifact-route@iflabx.com",
      password: "Secure123",
      displayName: "Artifact Route",
    });

    const login = authService.login({
      email: "artifact-route@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected artifact route login to succeed");
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

      const completion = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          app_id: "app_policy_watch",
          conversation_id: launchBody.data.conversationId,
          messages: [
            {
              role: "user",
              content: "Create an artifact I can reload.",
            },
          ],
        },
      });

      expect(completion.statusCode).toBe(200);

      const completionBody = completion.json() as ChatCompletionResponse;
      const artifactId = completionBody.choices[0]?.message.artifacts?.[0]?.id;

      expect(artifactId).toEqual(expect.stringMatching(/^artifact_/));

      if (!artifactId) {
        throw new Error("expected completion to include an artifact id");
      }

      const artifactResponse = await app.inject({
        method: "GET",
        url: `/workspace/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(artifactResponse.statusCode).toBe(200);
      expect(artifactResponse.json()).toEqual({
        ok: true,
        data: expect.objectContaining({
          id: artifactId,
          kind: "markdown",
          source: "assistant_response",
          status: "draft",
          content: expect.stringContaining(
            "Policy Watch is now reachable through the AgentifUI gateway.",
          ),
        }),
      } satisfies WorkspaceArtifactResponse);

      const artifactDownload = await app.inject({
        method: "GET",
        url: `/workspace/artifacts/${artifactId}/download`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(artifactDownload.statusCode).toBe(200);
      expect(artifactDownload.headers["content-type"]).toContain("text/markdown");
      expect(artifactDownload.headers["content-disposition"]).toContain(".md");
      expect(artifactDownload.headers["x-agentifui-artifact-id"]).toBe(artifactId);
      expect(artifactDownload.body).toContain(
        "Policy Watch is now reachable through the AgentifUI gateway."
      );

      const auditEvents = await auditService.listEvents({
        tenantId: testEnv.defaultTenantId,
      });

      expect(auditEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.artifact.generated",
            entityType: "artifact",
            entityId: artifactId,
            payload: expect.objectContaining({
              conversationId: launchBody.data.conversationId,
              runId: expect.stringMatching(/^run_/),
            }),
          }),
          expect.objectContaining({
            action: "workspace.artifact.viewed",
            entityType: "artifact",
            entityId: artifactId,
            payload: expect.objectContaining({
              accessScope: "owner",
            }),
          }),
          expect.objectContaining({
            action: "workspace.artifact.downloaded",
            entityType: "artifact",
            entityId: artifactId,
            payload: expect.objectContaining({
              accessScope: "owner",
            }),
          }),
        ])
      );
    } finally {
      await app.close();
    }
  });

  it("lists pending actions for the latest conversation run", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: "owner@iflabx.com",
      password: "Secure123",
      displayName: "Owner",
    });

    const login = authService.login({
      email: "owner@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected owner login to succeed");
    }

    try {
      const launch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_tenant_control",
          activeGroupId: "grp_product",
        },
      });

      expect(launch.statusCode).toBe(200);

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
          app_id: "app_tenant_control",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Approve this tenant access change.",
            },
          ],
        },
      });

      expect(completion.statusCode).toBe(200);
      expect((completion.json() as ChatCompletionResponse).choices[0]?.message).toMatchObject({
        pending_actions: [
          expect.objectContaining({
            kind: "approval",
            status: "pending",
          }),
        ],
      });

      const pendingActions = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/pending-actions`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(pendingActions.statusCode).toBe(200);
      expect((pendingActions.json() as WorkspacePendingActionsResponse).data).toMatchObject({
        conversationId,
        runId: launchBody.data.runId,
        items: [
          expect.objectContaining({
            kind: "approval",
            status: "pending",
            title: "Approve tenant access change",
          }),
        ],
      });
    } finally {
      await app.close();
    }
  });

  it("responds to approval pending actions and rejects duplicate updates", async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: "owner@iflabx.com",
      password: "Secure123",
      displayName: "Owner",
    });

    const login = authService.login({
      email: "owner@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected owner login to succeed");
    }

    try {
      const launch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_tenant_control",
          activeGroupId: "grp_product",
        },
      });

      expect(launch.statusCode).toBe(200);

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
          app_id: "app_tenant_control",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Approve this tenant access change.",
            },
          ],
        },
      });

      expect(completion.statusCode).toBe(200);
      const completionRunId = (completion.json() as ChatCompletionResponse).metadata?.run_id;

      if (!completionRunId) {
        throw new Error("expected completion payload to include run id");
      }

      const pendingActions = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/pending-actions`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(pendingActions.statusCode).toBe(200);

      const pendingActionId = (
        pendingActions.json() as WorkspacePendingActionsResponse
      ).data.items[0]?.id;

      if (!pendingActionId) {
        throw new Error("expected a pending action id");
      }

      const respond = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/pending-actions/${pendingActionId}/respond`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          action: "approve",
          note: "Reviewed by owner.",
        },
      });

      expect(respond.statusCode).toBe(200);
      expect((respond.json() as WorkspacePendingActionRespondResponse).data).toMatchObject({
        conversationId,
        runId: launchBody.data.runId,
        item: {
          id: pendingActionId,
          kind: "approval",
          status: "approved",
          response: {
            action: "approve",
            actorDisplayName: "Owner",
            note: "Reviewed by owner.",
          },
        },
      });

      const refreshedPendingActions = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/pending-actions`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(refreshedPendingActions.statusCode).toBe(200);
      expect(
        (refreshedPendingActions.json() as WorkspacePendingActionsResponse).data
          .items,
      ).toEqual([
        expect.objectContaining({
          id: pendingActionId,
          status: "approved",
        }),
      ]);

      const duplicateRespond = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/pending-actions/${pendingActionId}/respond`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          action: "approve",
        },
      });

      expect(duplicateRespond.statusCode).toBe(409);
      expect(duplicateRespond.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_ACTION_CONFLICT",
        },
      });
    } finally {
      await app.close();
    }
  });

  it("keeps pending actions readable but blocks responses while the runtime is degraded", async () => {
    const authService = createTestAuthService();
    const { runtimeService, setDegraded } = createSwitchableRuntimeService();
    const { app } = await createTestApp(authService, {}, { runtimeService });

    authService.register({
      email: "owner@iflabx.com",
      password: "Secure123",
      displayName: "Owner",
    });

    const login = authService.login({
      email: "owner@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected owner login to succeed");
    }

    try {
      const launch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_tenant_control",
          activeGroupId: "grp_product",
        },
      });

      expect(launch.statusCode).toBe(200);

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
          app_id: "app_tenant_control",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Approve this tenant access change.",
            },
          ],
          tool_choice: {
            type: "function",
            function: {
              name: "tenant.access.review",
            },
          },
        },
      });

      expect(completion.statusCode).toBe(200);
      const completionBody = completion.json() as ChatCompletionResponse;
      const completionRunId = completionBody.metadata?.run_id;

      if (!completionRunId) {
        throw new Error("expected completion payload to include run id");
      }

      const pendingActions = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/pending-actions`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(pendingActions.statusCode).toBe(200);

      const pendingActionId = (
        pendingActions.json() as WorkspacePendingActionsResponse
      ).data.items[0]?.id;

      if (!pendingActionId) {
        throw new Error("expected a pending action id");
      }

      setDegraded(true);

      const refreshedPendingActions = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/pending-actions`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(refreshedPendingActions.statusCode).toBe(200);
      expect(
        (refreshedPendingActions.json() as WorkspacePendingActionsResponse).data
          .items[0],
      ).toMatchObject({
        id: pendingActionId,
        status: "pending",
      });

      const respond = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/pending-actions/${pendingActionId}/respond`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          action: "approve",
        },
      });

      expect(respond.statusCode).toBe(403);
      expect(respond.json()).toMatchObject({
        ok: false,
        error: {
          code: "WORKSPACE_FORBIDDEN",
          details: {
            reason: "runtime_degraded",
            runtime: {
              overallStatus: "degraded",
            },
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it("records transcript and tool execution details when approval-required tools are approved", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const { app } = await createTestApp(authService, {}, { auditService });

    authService.register({
      email: "admin@iflabx.com",
      password: "Secure123",
      displayName: "Tenant Admin",
    });

    const login = authService.login({
      email: "admin@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected tenant admin login to succeed");
    }

    try {
      const launch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_tenant_control",
          activeGroupId: "grp_product",
        },
      });

      expect(launch.statusCode).toBe(200);

      const launchBody = launch.json() as WorkspaceAppLaunchResponse;
      const conversationId = launchBody.data.conversationId;

      if (!conversationId) {
        throw new Error("expected launch payload to include conversation id");
      }

      const completion = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          app_id: "app_tenant_control",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Review the pending tenant access changes.",
            },
          ],
          tool_choice: {
            type: "function",
            function: {
              name: "tenant.access.review",
            },
          },
        },
      });

      expect(completion.statusCode).toBe(200);
      const completionBody = completion.json() as ChatCompletionResponse;
      const completionRunId = completionBody.metadata?.run_id;

      if (!completionRunId) {
        throw new Error("expected completion payload to include run id");
      }

      const pendingActions = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/pending-actions`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(pendingActions.statusCode).toBe(200);

      const pendingActionId = (
        pendingActions.json() as WorkspacePendingActionsResponse
      ).data.items[0]?.id;

      if (!pendingActionId) {
        throw new Error("expected a pending action id");
      }

      const respond = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/pending-actions/${pendingActionId}/respond`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          action: "approve",
          note: "Approved for the maintenance window.",
        },
      });

      expect(respond.statusCode).toBe(200);

      const conversationResponse = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(conversationResponse.statusCode).toBe(200);
      expect(
        (conversationResponse.json() as WorkspaceConversationResponse).data.messages,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "tool",
            toolName: "tenant.access.review",
            content: expect.stringContaining("executed after approval"),
            status: "completed",
          }),
          expect.objectContaining({
            role: "assistant",
            content: expect.stringContaining(
              "Tenant Control completed tenant.access.review after approval.",
            ),
            status: "completed",
          }),
        ]),
      );

      const runResponse = await app.inject({
        method: "GET",
        url: `/workspace/runs/${completionRunId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runResponse.statusCode).toBe(200);
      expect((runResponse.json() as WorkspaceRunResponse).data).toMatchObject({
        toolExecutions: [
          expect.objectContaining({
            status: "succeeded",
            request: expect.objectContaining({
              function: expect.objectContaining({
                name: "tenant.access.review",
              }),
            }),
            result: expect.objectContaining({
              isError: false,
              content: expect.stringContaining("executed after approval"),
            }),
          }),
        ],
        outputs: expect.objectContaining({
          pendingActions: [
            expect.objectContaining({
              id: pendingActionId,
              status: "approved",
            }),
          ],
          assistant: expect.objectContaining({
            content: expect.stringContaining(
              "Tenant Control completed tenant.access.review after approval.",
            ),
          }),
        }),
      });

      expect(await auditService.listEvents()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.tool_execution.approval_requested",
            entityType: "pending_action",
            entityId: pendingActionId,
            payload: expect.objectContaining({
              conversationId,
              runId: completionRunId,
              toolName: "tenant.access.review",
            }),
          }),
          expect.objectContaining({
            action: "workspace.tool_execution.approval_decided",
            entityType: "pending_action",
            entityId: pendingActionId,
            payload: expect.objectContaining({
              conversationId,
              runId: completionRunId,
              decisionAction: "approve",
              decisionStatus: "approved",
              toolName: "tenant.access.review",
            }),
          }),
          expect.objectContaining({
            action: "workspace.tool_execution.completed",
            entityType: "run",
            entityId: completionRunId,
            payload: expect.objectContaining({
              conversationId,
              runId: completionRunId,
              decisionAction: "approve",
              toolName: "tenant.access.review",
            }),
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it("records audit events when a pending action is cancelled", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const { app } = await createTestApp(authService, {}, { auditService });

    authService.register({
      email: "owner@iflabx.com",
      password: "Secure123",
      displayName: "Owner",
    });

    const login = authService.login({
      email: "owner@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected owner login to succeed");
    }

    try {
      const launch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: "app_tenant_control",
          activeGroupId: "grp_product",
        },
      });

      expect(launch.statusCode).toBe(200);
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
          app_id: "app_tenant_control",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Approve this tenant access change.",
            },
          ],
          tool_choice: {
            type: "function",
            function: {
              name: "tenant.access.review",
            },
          },
        },
      });

      expect(completion.statusCode).toBe(200);
      const completionBody = completion.json() as ChatCompletionResponse;
      const completionRunId = completionBody.metadata?.run_id;

      if (!completionRunId) {
        throw new Error("expected completion payload to include run id");
      }

      const pendingActions = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/pending-actions`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      const pendingActionId = (
        pendingActions.json() as WorkspacePendingActionsResponse
      ).data.items[0]?.id;

      if (!pendingActionId) {
        throw new Error("expected a pending action id");
      }

      const cancel = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/pending-actions/${pendingActionId}/respond`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          action: "cancel",
          note: "No longer needed.",
        },
      });

      expect(cancel.statusCode).toBe(200);
      expect((cancel.json() as WorkspacePendingActionRespondResponse).data.item).toMatchObject({
        id: pendingActionId,
        status: "cancelled",
        response: {
          action: "cancel",
          note: "No longer needed.",
        },
      });

      const conversationResponse = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(conversationResponse.statusCode).toBe(200);
      expect(
        (conversationResponse.json() as WorkspaceConversationResponse).data.messages,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "tool",
            toolName: "tenant.access.review",
            content: expect.stringContaining(
              "was not executed because the approval request was cancelled",
            ),
            status: "failed",
          }),
          expect.objectContaining({
            role: "assistant",
            content: expect.stringContaining(
              "recorded that tenant.access.review was cancelled and will not execute it.",
            ),
            status: "completed",
          }),
        ]),
      );

      const runResponse = await app.inject({
        method: "GET",
        url: `/workspace/runs/${completionRunId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runResponse.statusCode).toBe(200);
      expect((runResponse.json() as WorkspaceRunResponse).data).toMatchObject({
        toolExecutions: [
          expect.objectContaining({
            status: "failed",
            request: expect.objectContaining({
              function: expect.objectContaining({
                name: "tenant.access.review",
              }),
            }),
            failure: expect.objectContaining({
              code: "tool_approval_cancelled",
              stage: "tool_approval",
              retryable: false,
            }),
            result: expect.objectContaining({
              isError: true,
              content: expect.stringContaining(
                "was not executed because the approval request was cancelled",
              ),
            }),
          }),
        ],
        outputs: expect.objectContaining({
          pendingActions: [
            expect.objectContaining({
              id: pendingActionId,
              status: "cancelled",
            }),
          ],
          assistant: expect.objectContaining({
            content: expect.stringContaining(
              "recorded that tenant.access.review was cancelled and will not execute it.",
            ),
          }),
        }),
      });

      expect(await auditService.listEvents({ actorUserId: login.data.user.id })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.pending_action.cancelled",
            entityType: "pending_action",
            entityId: pendingActionId,
            payload: expect.objectContaining({
              conversationId,
              action: "cancel",
              status: "cancelled",
            }),
          }),
          expect.objectContaining({
            action: "workspace.tool_execution.approval_decided",
            entityType: "pending_action",
            entityId: pendingActionId,
            payload: expect.objectContaining({
              conversationId,
              runId: completionRunId,
              decisionAction: "cancel",
              decisionStatus: "cancelled",
              toolName: "tenant.access.review",
              failure: expect.objectContaining({
                code: "tool_approval_cancelled",
                stage: "tool_approval",
              }),
            }),
          }),
          expect.objectContaining({
            action: "workspace.tool_execution.blocked",
            entityType: "run",
            entityId: completionRunId,
            payload: expect.objectContaining({
              conversationId,
              runId: completionRunId,
              decisionAction: "cancel",
              decisionStatus: "cancelled",
              toolName: "tenant.access.review",
              failure: expect.objectContaining({
                code: "tool_approval_cancelled",
                stage: "tool_approval",
              }),
            }),
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it("records audit events when expired pending actions are observed", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const workspaceService = createWorkspaceService();
    const expiredStep = {
      id: "hitl_expired",
      kind: "approval" as const,
      status: "expired" as const,
      title: "Approve tenant access change",
      description: "The deadline has passed.",
      conversationId: "conv_expired",
      runId: "run_expired",
      createdAt: "2026-03-14T10:00:00.000Z",
      updatedAt: "2026-03-14T12:00:00.000Z",
      expiresAt: "2026-03-14T11:00:00.000Z",
      approveLabel: "Approve",
      rejectLabel: "Reject",
    };

    workspaceService.listPendingActionsForUser = async () => ({
      ok: true,
      data: {
        conversationId: "conv_expired",
        runId: "run_expired",
        items: [expiredStep],
        expiredItems: [expiredStep],
      },
    });

    const { app } = await createTestApp(authService, {}, {
      auditService,
      workspaceService,
    });

    authService.register({
      email: "owner@iflabx.com",
      password: "Secure123",
      displayName: "Owner",
    });

    const login = authService.login({
      email: "owner@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected owner login to succeed");
    }

    try {
      const response = await app.inject({
        method: "GET",
        url: "/workspace/conversations/conv_expired/pending-actions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as WorkspacePendingActionsResponse).data.items).toEqual([
        expect.objectContaining({
          id: "hitl_expired",
          status: "expired",
        }),
      ]);

      expect(await auditService.listEvents()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.pending_action.expired",
            entityType: "pending_action",
            entityId: "hitl_expired",
            payload: expect.objectContaining({
              conversationId: "conv_expired",
              runId: "run_expired",
              observedByUserId: login.data.user.id,
            }),
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });
});
