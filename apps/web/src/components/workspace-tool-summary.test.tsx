import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  WorkspaceToolCallSummaryList,
  WorkspaceToolExecutionSummaryList,
} from "./workspace-tool-summary.js";

describe("WorkspaceToolSummary", () => {
  it("renders structured tool call summaries with parsed arguments", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceToolCallSummaryList
        locale="zh-CN"
        title="工具调用"
        toolCalls={[
          {
            id: "call_workspace_search",
            type: "function",
            function: {
              name: "workspace.search",
              arguments: JSON.stringify({
                query: "宿舍熄灯",
                topK: 3,
              }),
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("workspace.search");
    expect(markup).toContain("调用: call_workspace_search");
    expect(markup).toContain("query: 宿舍熄灯");
    expect(markup).toContain("topK: 3");
  });

  it("renders replayable tool execution summaries with metadata and result previews", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceToolExecutionSummaryList
        locale="en-US"
        executions={[
          {
            id: "tool_exec_1",
            attempt: 2,
            status: "failed",
            startedAt: "2026-03-16T12:00:00.000Z",
            finishedAt: "2026-03-16T12:00:00.120Z",
            latencyMs: 120,
            request: {
              id: "call_workspace_search",
              type: "function",
              function: {
                name: "workspace.search",
                arguments: JSON.stringify({
                  query: "lights out",
                }),
              },
            },
            metadata: {
              failureReason: "timeout",
              idempotencyKey: "tool_idem_abcd1234",
              timeoutMs: "155",
              maxAttempts: "3",
            },
            failure: {
              code: "tool_timeout",
              stage: "tool_execution",
              message: 'Tool "workspace.search" timed out.',
              retryable: true,
              detail: "Tool `workspace.search` timed out after 155 ms on attempt 2.",
              recordedAt: "2026-03-16T12:00:00.120Z",
            },
            result: {
              content: "Tool `workspace.search` timed out after 155 ms on attempt 2.",
              isError: true,
              recordedAt: "2026-03-16T12:00:00.120Z",
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("workspace.search");
    expect(markup).not.toContain("Succeeded");
    expect(markup).toContain("Failed");
    expect(markup).toContain("Attempt 2");
    expect(markup).toContain("tool_timeout");
    expect(markup).toContain("tool_execution");
    expect(markup).toContain("Tool &quot;workspace.search&quot; timed out.");
    expect(markup).toContain("retryable");
    expect(markup).toContain("tool_idem_abcd1234");
    expect(markup).toContain("timed out after 155 ms");
  });
});
