import { describe, expect, it } from "vitest";

import { createWorkspaceRuntimeService } from "./workspace-runtime.js";

const baseConversation = {
  id: "conv_runtime",
  title: "Runtime conversation",
  status: "active" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  pinned: false,
  launchId: "launch_runtime",
  app: {
    id: "app_policy_watch",
    slug: "policy-watch",
    name: "Policy Watch",
    summary: "Track policy changes.",
    kind: "governance" as const,
    status: "ready" as const,
    shortCode: "PW",
  },
  activeGroup: {
    id: "grp_research",
    name: "Research Lab",
    description: "Research",
  },
  messages: [],
  run: {
    id: "run_runtime",
    type: "agent" as const,
    status: "running" as const,
    triggeredFrom: "chat_completion" as const,
    traceId: "trace_runtime",
    createdAt: new Date().toISOString(),
    finishedAt: null,
    elapsedTime: 0,
    totalTokens: 0,
    totalSteps: 1,
  },
};

describe("workspace runtime service", () => {
  it("returns a healthy adapter snapshot", () => {
    const service = createWorkspaceRuntimeService();
    const snapshot = service.getHealthSnapshot();

    expect(snapshot).toMatchObject({
      overallStatus: "available",
      runtimes: expect.arrayContaining([
        expect.objectContaining({
          id: "placeholder",
          status: "available",
        }),
        expect.objectContaining({
          id: "placeholder_structured",
          status: "available",
        }),
      ]),
    });
  });

  it("routes runbook mentor through the structured adapter", async () => {
    const service = createWorkspaceRuntimeService();

    const result = await service.invoke({
      appId: "app_runbook_mentor",
      attachments: [],
      conversation: {
        ...baseConversation,
        app: {
          ...baseConversation.app,
          id: "app_runbook_mentor",
          slug: "runbook-mentor",
          name: "Runbook Mentor",
          kind: "automation",
          shortCode: "RM",
        },
      },
      latestPrompt: "Turn this SOP into ordered steps.",
      messages: [
        {
          role: "user",
          content: "Turn this SOP into ordered steps.",
        },
      ],
      requestedModel: "runbook-mentor",
      retrieval: {
        query: {
          appId: "app_runbook_mentor",
          conversationId: "conv_runtime",
          groupId: "grp_research",
          queryText: "Turn this SOP into ordered steps.",
          limit: 4,
        },
        matches: [
          {
            sourceId: "src_1",
            chunkId: "chunk_1",
            title: "Runbook policy",
            sourceKind: "markdown",
            sourceUri: null,
            scope: "group",
            groupId: "grp_research",
            labels: ["runbook"],
            headingPath: ["Runbook policy", "Steps"],
            preview: "Confirm prerequisites before proceeding.",
            content: "Confirm prerequisites before proceeding.",
            score: 12,
          },
        ],
      },
      runtimeInput: null,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("expected runtime invocation to succeed");
    }

    expect(result.data).toMatchObject({
      assistantText: expect.stringMatching(
        /structured execution outline[\s\S]*Grounding: retrieved 1 knowledge chunk/i,
      ),
      runtime: {
        id: "placeholder_structured",
        label: "Structured Placeholder Runtime",
      },
      sourceBlocks: expect.arrayContaining([
        expect.objectContaining({
          kind: "workspace_context",
        }),
      ]),
    });
  });
});
