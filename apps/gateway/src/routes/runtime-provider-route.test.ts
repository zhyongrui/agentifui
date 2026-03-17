import type { WorkspaceConversationResponse, WorkspaceRunResponse } from "@agentifui/shared/apps";
import type { ChatCompletionResponse } from "@agentifui/shared/chat";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { createAuthService } from "../services/auth-service.js";

const testEnv = {
  nodeEnv: "test" as const,
  host: "127.0.0.1",
  port: 4020,
  corsOrigin: true,
  ssoDomainMap: {
    "iflabx.com": "iflabx-sso",
  },
  defaultTenantId: "tenant-dev",
  defaultSsoUserStatus: "pending" as const,
  authLockoutThreshold: 5,
  authLockoutDurationMs: 1_800_000,
};

function createTestAuthService() {
  return createAuthService({
    defaultTenantId: testEnv.defaultTenantId,
    defaultSsoUserStatus: testEnv.defaultSsoUserStatus,
    lockoutThreshold: testEnv.authLockoutThreshold,
    lockoutDurationMs: testEnv.authLockoutDurationMs,
  });
}

async function createTestApp() {
  const authService = createTestAuthService();
  const app = await buildApp(testEnv, {
    logger: false,
    authService,
  });

  return {
    app,
    authService,
  };
}

describe("runtime provider routing", () => {
  it("persists mixed-provider runs in the same conversation", async () => {
    const { app, authService } = await createTestApp();

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
      const conversationId = (launch.json() as { data: { conversationId: string } }).data.conversationId;

      const firstCompletion = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
          "x-active-group-id": "grp_research",
        },
        payload: {
          app_id: "app_policy_watch",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Summarize the latest dorm policy updates.",
            },
          ],
        },
      });

      expect(firstCompletion.statusCode).toBe(200);
      expect((firstCompletion.json() as ChatCompletionResponse).metadata).toMatchObject({
        provider_id: "local_fast",
        provider_model_id: "local-fast-v1",
      });

      const firstConversation = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(firstConversation.statusCode).toBe(200);
      const firstMessages = (firstConversation.json() as WorkspaceConversationResponse).data.messages;

      const secondCompletion = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
          "x-active-group-id": "grp_research",
        },
        payload: {
          app_id: "app_policy_watch",
          conversation_id: conversationId,
          model: "structured-routing-check",
          messages: [
            ...firstMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            {
              role: "user",
              content: "Turn the same answer into a structured checklist.",
            },
          ],
        },
      });

      expect(secondCompletion.statusCode).toBe(200);
      expect((secondCompletion.json() as ChatCompletionResponse).metadata).toMatchObject({
        provider_id: "local_structured",
        provider_model_id: "local-structured-v1",
      });

      const secondBody = secondCompletion.json() as ChatCompletionResponse;
      const firstRunId = (firstCompletion.json() as ChatCompletionResponse).metadata?.run_id;
      const secondRunId = secondBody.metadata?.run_id;

      if (!firstRunId || !secondRunId) {
        throw new Error("expected both completions to return run ids");
      }

      const firstRun = await app.inject({
        method: "GET",
        url: `/workspace/runs/${firstRunId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });
      const secondRun = await app.inject({
        method: "GET",
        url: `/workspace/runs/${secondRunId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(firstRun.statusCode).toBe(200);
      expect(secondRun.statusCode).toBe(200);
      expect((firstRun.json() as WorkspaceRunResponse).data.runtime).toMatchObject({
        providerId: "local_fast",
      });
      expect((secondRun.json() as WorkspaceRunResponse).data.runtime).toMatchObject({
        providerId: "local_structured",
      });
    } finally {
      await app.close();
    }
  });
});
