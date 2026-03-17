import type { WorkspaceRunResponse } from "@agentifui/shared/apps";
import type { ChatCompletionResponse } from "@agentifui/shared/chat";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { createWorkspaceRuntimeService } from "../services/workspace-runtime.js";
import {
  PERSISTENT_TEST_ENV,
  resetPersistentTestDatabase,
} from "../test/persistent-db.js";

async function createPersistentApp(runtimeMode: "default" | "fallback" = "default") {
  return buildApp(PERSISTENT_TEST_ENV, {
    logger: false,
    ...(runtimeMode === "fallback"
      ? {
          runtimeService: createWorkspaceRuntimeService({
            openCircuitProviderIds: ["local_structured"],
            resolveTenantRuntimeMode() {
              return "strict";
            },
          }),
        }
      : {}),
  });
}

describe.sequential("persistent runtime provider routing", () => {
  it("persists fallback provider metadata across app restarts", async () => {
    await resetPersistentTestDatabase();

    const app = await createPersistentApp("fallback");
    let appClosed = false;

    try {
      const register = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "admin@iflabx.com",
          password: "Secure123",
          displayName: "Admin User",
        },
      });

      expect(register.statusCode).toBe(201);

      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "admin@iflabx.com",
          password: "Secure123",
        },
      });

      expect(login.statusCode).toBe(200);
      const sessionToken = (login.json() as { data: { sessionToken: string } }).data.sessionToken;

      const launch = await app.inject({
        method: "POST",
        url: "/workspace/apps/launch",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          appId: "app_runbook_mentor",
          activeGroupId: "grp_research",
        },
      });

      expect(launch.statusCode).toBe(200);
      const conversationId = (launch.json() as { data: { conversationId: string } }).data.conversationId;

      const completion = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${sessionToken}`,
          "x-active-group-id": "grp_research",
        },
        payload: {
          app_id: "app_runbook_mentor",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Turn this SOP into ordered steps.",
            },
          ],
        },
      });

      expect(completion.statusCode).toBe(200);
      const completionBody = completion.json() as ChatCompletionResponse;
      const runId = completionBody.metadata?.run_id;

      expect(completionBody.metadata).toMatchObject({
        provider_id: "local_fast",
        provider_model_id: "local-fast-v1",
      });

      if (!runId) {
        throw new Error("expected completion metadata to include run_id");
      }

      await app.close();
      appClosed = true;

      const restartedApp = await createPersistentApp();

      try {
        const run = await restartedApp.inject({
          method: "GET",
          url: `/workspace/runs/${runId}`,
          headers: {
            authorization: `Bearer ${sessionToken}`,
          },
        });

        expect(run.statusCode).toBe(200);
        expect((run.json() as WorkspaceRunResponse).data.runtime).toMatchObject({
          id: "placeholder",
          providerId: "local_fast",
          modelId: "local-fast-v1",
          requestType: "chat_completion",
          selection: {
            source: "fallback",
            fallbackFromProviderId: "local_structured",
            attemptedProviderIds: ["local_structured", "local_fast"],
          },
        });
      } finally {
        await restartedApp.close();
      }
    } finally {
      if (!appClosed) {
        await app.close();
      }
    }
  }, 120_000);
});
