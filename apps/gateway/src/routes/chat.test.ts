import type {
  WorkspaceAppLaunchResponse,
  WorkspaceConversationResponse,
  WorkspaceRunResponse,
} from "@agentifui/shared/apps";
import type {
  ChatCompletionResponse,
  ChatCompletionStopResponse,
  ChatModelsResponse,
} from "@agentifui/shared/chat";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { createAuditService } from "../services/audit-service.js";
import { createAuthService } from "../services/auth-service.js";
import type { WorkspaceRuntimeService } from "../services/workspace-runtime.js";

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

describe("chat routes", () => {
  it("rejects chat completions without a bearer token", async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          app_id: "app_policy_watch",
          messages: [
            {
              role: "user",
              content: "hello",
            },
          ],
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          message:
            "A valid session token is required to call the chat gateway.",
          type: "authentication_error",
          code: "invalid_token",
          trace_id: expect.any(String),
        },
      });
      expect(response.headers["x-trace-id"]).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it("returns the authorized app catalog through /v1/models", async () => {
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
        url: "/v1/models",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-trace-id"]).toEqual(expect.any(String));
      expect(response.json()).toEqual({
        object: "list",
        data: expect.arrayContaining([
          expect.objectContaining({
            id: "app_policy_watch",
            object: "model",
            owned_by: "tenant-dev",
            name: "Policy Watch",
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

  it("accepts typed tool descriptors and function tool choice payloads", async () => {
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
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
          "x-active-group-id": "grp_research",
        },
        payload: {
          app_id: "app_policy_watch",
          messages: [
            {
              role: "assistant",
              content: "Calling the workspace search tool.",
              tool_calls: [
                {
                  id: "call_workspace_search",
                  type: "function",
                  function: {
                    name: "workspace.search",
                    arguments: JSON.stringify({
                      query: "宿舍熄灯",
                    }),
                  },
                },
              ],
            },
            {
              role: "tool",
              tool_call_id: "call_workspace_search",
              content: '{"matches": []}',
            },
            {
              role: "user",
              content: "Summarize the latest dormitory lights-out policy.",
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "workspace.search",
                description: "Searches indexed workspace knowledge.",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                    },
                    topK: {
                      type: "integer",
                      minimum: 1,
                      maximum: 10,
                    },
                  },
                  required: ["query"],
                  additionalProperties: false,
                },
                strict: true,
              },
              auth: {
                scope: "active_group",
                requiresApproval: false,
              },
              enabled: true,
              tags: ["search", "knowledge"],
            },
          ],
          tool_choice: {
            type: "function",
            function: {
              name: "workspace.search",
            },
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: expect.any(String),
            },
            finish_reason: "stop",
          },
        ],
        metadata: {
          app_id: "app_policy_watch",
          run_id: expect.any(String),
          active_group_id: "grp_research",
        },
      });
    } finally {
      await app.close();
    }
  });

  it("rejects invalid tool descriptors", async () => {
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
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          app_id: "app_policy_watch",
          messages: [
            {
              role: "user",
              content: "hello",
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "",
                inputSchema: {
                  type: "object",
                },
              },
              auth: {
                scope: "unsupported_scope",
              },
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          message:
            "tools must be an array of valid function descriptors when provided.",
          type: "invalid_request_error",
          code: "invalid_messages",
          param: "tools",
          trace_id: expect.any(String),
        },
      });
    } finally {
      await app.close();
    }
  });

  it("rejects invalid function tool selectors", async () => {
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
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          app_id: "app_policy_watch",
          messages: [
            {
              role: "user",
              content: "hello",
            },
          ],
          tool_choice: {
            type: "function",
            function: {
              name: "",
            },
          },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          message:
            "tool_choice must be 'auto', 'none', or a valid function selector when provided.",
          type: "invalid_request_error",
          code: "invalid_messages",
          param: "tool_choice",
          trace_id: expect.any(String),
        },
      });
    } finally {
      await app.close();
    }
  });

  it("routes runbook mentor through the structured runtime adapter", async () => {
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
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
          "x-active-group-id": "grp_research",
        },
        payload: {
          app_id: "app_runbook_mentor",
          messages: [
            {
              role: "user",
              content: "Turn this SOP into ordered steps.",
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        model: "runbook-mentor",
        metadata: {
          app_id: "app_runbook_mentor",
          run_id: expect.any(String),
          active_group_id: "grp_research",
          runtime_id: "placeholder_structured",
        },
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: expect.stringContaining("structured execution outline"),
            },
            finish_reason: "stop",
          },
        ],
      } satisfies Partial<ChatCompletionResponse>);

      const body = response.json() as ChatCompletionResponse;
      const runResponse = await app.inject({
        method: "GET",
        url: `/workspace/runs/${body.id}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runResponse.statusCode).toBe(200);
      expect(
        (runResponse.json() as WorkspaceRunResponse).data.runtime,
      ).toMatchObject({
        id: "placeholder_structured",
        label: "Structured Placeholder Runtime",
        status: "available",
      });
    } finally {
      await app.close();
    }
  });

  it("normalizes runtime adapter outages into structured run failures", async () => {
    const authService = createTestAuthService();
    const runtimeService: WorkspaceRuntimeService = {
      getHealthSnapshot() {
        return {
          overallStatus: "degraded",
          runtimes: [
            {
              id: "placeholder",
              label: "Placeholder Runtime",
              status: "degraded",
              capabilities: {
                streaming: true,
                citations: true,
                artifacts: true,
                safety: true,
                pendingActions: true,
                files: true,
              },
            },
          ],
        };
      },
      async invoke() {
        return {
          ok: false,
          error: {
            code: "runtime_unavailable",
            message: "Placeholder Runtime is currently degraded.",
            detail: "Wait for the runtime health probe to recover.",
            retryable: true,
            runtime: {
              id: "placeholder",
              label: "Placeholder Runtime",
              status: "degraded",
              invokedAt: new Date().toISOString(),
              capabilities: {
                streaming: true,
                citations: true,
                artifacts: true,
                safety: true,
                pendingActions: true,
                files: true,
              },
            },
          },
        };
      },
    };
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

      const response = await app.inject({
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
              content: "Summarize the current policy changes for my group.",
            },
          ],
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: {
          message: "Placeholder Runtime is currently degraded.",
          type: "service_unavailable",
          code: "provider_unavailable",
          trace_id: expect.any(String),
        },
      });

      const runResponse = await app.inject({
        method: "GET",
        url: `/workspace/runs/${launchBody.data.runId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runResponse.statusCode).toBe(200);
      expect((runResponse.json() as WorkspaceRunResponse).data).toMatchObject({
        status: "failed",
        failure: {
          code: "runtime_unavailable",
          stage: "execution",
          retryable: true,
        },
        runtime: {
          id: "placeholder",
          status: "degraded",
        },
      });
    } finally {
      await app.close();
    }
  });

  it("binds blocking chat completions onto an existing workspace conversation", async () => {
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
      const runId = launchBody.data.runId;
      const traceId = launchBody.data.traceId;

      if (!conversationId || !runId || !traceId) {
        throw new Error(
          "expected launch payload to include conversation, run and trace ids",
        );
      }

      const response = await app.inject({
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
              content: "Summarize the current policy changes for my group.",
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-trace-id"]).toBe(traceId);
      expect(response.json()).toMatchObject({
        id: runId,
        object: "chat.completion",
        created: expect.any(Number),
        model: "policy-watch",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: expect.stringContaining(
                "Policy Watch is now reachable through the AgentifUI gateway.",
              ),
              artifacts: [
                expect.objectContaining({
                  kind: "markdown",
                  source: "assistant_response",
                  status: "draft",
                }),
              ],
              citations: expect.arrayContaining([
                expect.objectContaining({
                  label: "S1",
                  title: "Policy Watch workspace context",
                }),
              ]),
              source_blocks: expect.arrayContaining([
                expect.objectContaining({
                  kind: "workspace_context",
                  title: "Policy Watch workspace context",
                }),
                expect.objectContaining({
                  kind: "knowledge",
                  title: "Policy Watch handbook",
                }),
              ]),
              suggested_prompts: expect.arrayContaining([
                expect.stringContaining("Summarize the key takeaways about"),
              ]),
            },
            finish_reason: "stop",
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
          app_id: "app_policy_watch",
          run_id: runId,
          active_group_id: "grp_research",
        },
      } satisfies Partial<ChatCompletionResponse>);

      const conversationResponse = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(conversationResponse.statusCode).toBe(200);
      expect(
        (conversationResponse.json() as WorkspaceConversationResponse).data,
      ).toMatchObject({
        id: conversationId,
        messages: [
          {
            role: "user",
            content: "Summarize the current policy changes for my group.",
            status: "completed",
          },
          {
            role: "assistant",
            content: expect.stringContaining(
              "Policy Watch is now reachable through the AgentifUI gateway.",
            ),
            artifacts: [
              expect.objectContaining({
                kind: "markdown",
                source: "assistant_response",
              }),
            ],
            citations: expect.arrayContaining([
              expect.objectContaining({
                label: "S1",
                title: "Policy Watch workspace context",
              }),
              expect.objectContaining({
                title: "Policy Watch handbook",
              }),
            ]),
            status: "completed",
            suggestedPrompts: expect.arrayContaining([
              expect.stringContaining("Summarize the key takeaways about"),
            ]),
          },
        ],
        run: {
          status: "succeeded",
        },
      });

      const runResponse = await app.inject({
        method: "GET",
        url: `/workspace/runs/${runId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runResponse.statusCode).toBe(200);
      expect(
        (runResponse.json() as WorkspaceRunResponse).data.inputs,
      ).toMatchObject({
        retrieval: {
          query: {
            appId: "app_policy_watch",
            conversationId,
            groupId: "grp_research",
            queryText: "Summarize the current policy changes for my group.",
            limit: 4,
          },
          matches: expect.arrayContaining([
            expect.objectContaining({
              sourceId: "src_policy_watch_handbook",
              title: "Policy Watch handbook",
            }),
          ]),
        },
      });
      expect(
        (runResponse.json() as WorkspaceRunResponse).data.sourceBlocks,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "knowledge",
            title: "Policy Watch handbook",
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it("creates a fresh run for the next completion on the same conversation", async () => {
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
      const initialRunId = launchBody.data.runId;

      if (!conversationId || !initialRunId) {
        throw new Error(
          "expected launch payload to include conversation and run ids",
        );
      }

      const firstCompletion = await app.inject({
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
              content: "Summarize the current policy changes for my group.",
            },
          ],
        },
      });
      const firstBody = firstCompletion.json() as ChatCompletionResponse;

      expect(firstBody.id).toBe(initialRunId);

      const secondCompletion = await app.inject({
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
              content: "Summarize the current policy changes for my group.",
            },
            {
              role: "assistant",
              content: firstBody.choices[0]?.message.content ?? "",
            },
            {
              role: "user",
              content: "Now tell me what changed since the previous answer.",
            },
          ],
        },
      });
      const secondBody = secondCompletion.json() as ChatCompletionResponse;

      expect(secondCompletion.statusCode).toBe(200);
      expect(secondBody.id).toEqual(expect.stringMatching(/^run_/));
      expect(secondBody.id).not.toBe(initialRunId);
      expect(secondBody.trace_id).not.toBe(launchBody.data.traceId);
      expect(secondBody.metadata?.run_id).toBe(secondBody.id);

      const runsResponse = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}/runs`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runsResponse.statusCode).toBe(200);
      expect(
        (runsResponse.json() as { data: { runs: Array<{ id: string }> } }).data
          .runs,
      ).toEqual([
        expect.objectContaining({
          id: secondBody.id,
        }),
        expect.objectContaining({
          id: initialRunId,
        }),
      ]);

      const runResponse = await app.inject({
        method: "GET",
        url: `/workspace/runs/${secondBody.id}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runResponse.statusCode).toBe(200);
      expect(
        (runResponse.json() as { data: Record<string, unknown> }).data,
      ).toMatchObject({
        id: secondBody.id,
        conversationId,
        status: "succeeded",
        triggeredFrom: "chat_completion",
        artifacts: [
          expect.objectContaining({
            kind: "markdown",
            source: "assistant_response",
          }),
        ],
        citations: expect.arrayContaining([
          expect.objectContaining({
            label: "S1",
            title: "Policy Watch workspace context",
          }),
        ]),
        sourceBlocks: expect.arrayContaining([
          expect.objectContaining({
            kind: "workspace_context",
            title: "Policy Watch workspace context",
          }),
        ]),
        usage: {
          totalTokens: expect.any(Number),
        },
        outputs: {
          assistant: {
            content: expect.any(String),
          },
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
        (conversationResponse.json() as WorkspaceConversationResponse).data.run,
      ).toMatchObject({
        id: secondBody.id,
        status: "succeeded",
        triggeredFrom: "chat_completion",
      });
    } finally {
      await app.close();
    }
  });

  it("returns input-request pending actions for tenant control workflows", async () => {
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
        throw new Error("expected launch payload to include conversation id");
      }

      const response = await app.inject({
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
              content:
                "Open the details form and collect the justification input for this tenant access change.",
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(
        (response.json() as ChatCompletionResponse).choices[0]?.message,
      ).toMatchObject({
        pending_actions: [
          expect.objectContaining({
            kind: "input_request",
            status: "pending",
            title: "Collect change request details",
            submitLabel: "Submit details",
            fields: [
              expect.objectContaining({
                id: "justification",
                type: "textarea",
                required: true,
              }),
              expect.objectContaining({
                id: "risk_level",
                type: "select",
                required: true,
                options: expect.arrayContaining([
                  expect.objectContaining({
                    id: "low",
                    value: "low",
                  }),
                  expect.objectContaining({
                    id: "medium",
                    value: "medium",
                  }),
                  expect.objectContaining({
                    id: "high",
                    value: "high",
                  }),
                ]),
              }),
            ],
          }),
        ],
      });
    } finally {
      await app.close();
    }
  });

  it("creates a new conversation when conversation_id is omitted", async () => {
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
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
          "x-active-group-id": "grp_research",
        },
        payload: {
          app_id: "app_policy_watch",
          messages: [
            {
              role: "user",
              content: "Create a new workspace-backed conversation.",
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

  it("returns SSE-compatible payloads when stream=true", async () => {
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
        url: "/v1/chat/completions",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
          "x-active-group-id": "grp_research",
        },
        payload: {
          app_id: "app_policy_watch",
          messages: [
            {
              role: "user",
              content: "Stream the response.",
            },
          ],
          stream: true,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/event-stream");
      expect(response.body).toContain("event: agentif.metadata");
      expect(response.body).toContain('"object":"chat.completion.chunk"');
      expect(response.body).toContain('"artifacts"');
      expect(response.body).toContain('"citations"');
      expect(response.body).toContain('"source_blocks"');
      expect(response.body).toContain('"source":"assistant_response"');
      expect(response.body).toContain('"suggested_prompts"');
      expect(response.body).toContain("data: [DONE]");
    } finally {
      await app.close();
    }
  });

  it("returns a soft stop result for the minimal protocol slice", async () => {
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
        url: "/v1/chat/completions/run_test/stop",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        result: "success",
        stop_type: "soft",
      } satisfies ChatCompletionStopResponse);
    } finally {
      await app.close();
    }
  });

  it("binds uploaded workspace attachments onto the conversation transcript and run inputs", async () => {
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
      const runId = launchBody.data.runId;

      if (!conversationId || !runId) {
        throw new Error(
          "expected launch payload to include conversation and run ids",
        );
      }

      const upload = await app.inject({
        method: "POST",
        url: `/workspace/conversations/${conversationId}/uploads`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          fileName: "brief.txt",
          contentType: "text/plain",
          base64Data: Buffer.from("Policy attachment").toString("base64"),
        },
      });

      expect(upload.statusCode).toBe(200);
      const attachmentId = (upload.json() as { data: { id: string } }).data.id;

      const response = await app.inject({
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
              content: "Review the attachment.",
            },
          ],
          files: [
            {
              type: "local",
              file_id: attachmentId,
              transfer_method: "local_file",
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(
        (response.json() as ChatCompletionResponse).choices[0]?.message.content,
      ).toContain("Attachments: brief.txt (text/plain, 17 bytes).");

      const conversationResponse = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(conversationResponse.statusCode).toBe(200);
      expect(
        (conversationResponse.json() as WorkspaceConversationResponse).data
          .messages,
      ).toEqual([
        expect.objectContaining({
          role: "user",
          content: "Review the attachment.",
          attachments: [
            expect.objectContaining({
              id: attachmentId,
              fileName: "brief.txt",
              contentType: "text/plain",
              sizeBytes: 17,
            }),
          ],
        }),
        expect.objectContaining({
          role: "assistant",
          status: "completed",
        }),
      ]);

      const runResponse = await app.inject({
        method: "GET",
        url: `/workspace/runs/${runId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(runResponse.statusCode).toBe(200);
      expect(
        (runResponse.json() as WorkspaceRunResponse).data.inputs,
      ).toMatchObject({
        attachments: [
          {
            id: attachmentId,
            fileName: "brief.txt",
            contentType: "text/plain",
            sizeBytes: 17,
          },
        ],
      });
      expect(
        (runResponse.json() as WorkspaceRunResponse).data.artifacts,
      ).toEqual([
        expect.objectContaining({
          kind: "markdown",
          source: "assistant_response",
        }),
      ]);
    } finally {
      await app.close();
    }
  }, 25_000);

  it("hard-stops an active streaming response and persists stopped state", async () => {
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

    let baseUrl: string | null = null;

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
      const runId = launchBody.data.runId;

      if (!conversationId || !runId) {
        throw new Error(
          "expected launch payload to include conversation and run ids",
        );
      }

      baseUrl = await app.listen({
        host: "127.0.0.1",
        port: 0,
      });

      const streamResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          app_id: "app_policy_watch",
          conversation_id: conversationId,
          messages: [
            {
              role: "user",
              content: "Start a response that I will stop.",
            },
          ],
          stream: true,
        }),
      });

      expect(streamResponse.status).toBe(200);

      const reader = streamResponse.body?.getReader();

      expect(reader).toBeDefined();

      if (!reader) {
        throw new Error("expected stream reader to exist");
      }

      const firstChunk = await reader.read();

      expect(firstChunk.done).toBe(false);
      expect(new TextDecoder().decode(firstChunk.value)).toContain(
        "chat.completion.chunk",
      );

      const stopResponse = await fetch(
        `${baseUrl}/v1/chat/completions/${runId}/stop`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${login.data.sessionToken}`,
          },
        },
      );

      expect(stopResponse.status).toBe(200);
      expect((await stopResponse.json()) as ChatCompletionStopResponse).toEqual(
        {
          result: "success",
          stop_type: "hard",
        },
      );

      let streamBody = new TextDecoder().decode(firstChunk.value);

      while (true) {
        const nextChunk = await reader.read();

        if (nextChunk.done) {
          break;
        }

        streamBody += new TextDecoder().decode(nextChunk.value);
      }

      expect(streamBody).toContain("data: [DONE]");

      const conversationResponse = await app.inject({
        method: "GET",
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(conversationResponse.statusCode).toBe(200);
      expect(
        (conversationResponse.json() as WorkspaceConversationResponse).data,
      ).toMatchObject({
        id: conversationId,
        run: {
          status: "stopped",
        },
        messages: [
          {
            role: "user",
            content: "Start a response that I will stop.",
            status: "completed",
          },
          {
            role: "assistant",
            status: "stopped",
          },
        ],
      });

      const auditEvents = await auditService.listEvents({
        tenantId: testEnv.defaultTenantId,
      });

      expect(auditEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workspace.run.stop_requested",
            entityType: "run",
            entityId: runId,
            payload: expect.objectContaining({
              runId,
              stopType: "hard",
              conversationId,
            }),
          }),
        ]),
      );
    } finally {
      if (baseUrl) {
        await app.close();
      } else {
        await app.close();
      }
    }
  });
});
