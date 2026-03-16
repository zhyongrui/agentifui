import { describe, expect, it } from "vitest";

import {
  buildWorkspaceRunFailure,
  buildWorkspaceToolExecutionFailure,
  parseWorkspaceRunFailure,
} from "./workspace-run-failure.js";

describe("workspace run failure helpers", () => {
  it("builds a structured failure payload", () => {
    expect(
      buildWorkspaceRunFailure({
        code: "stream_interrupted",
        stage: "streaming",
        message: "The streaming response ended unexpectedly.",
        retryable: true,
        detail: "The stream closed before the final completion event arrived.",
        recordedAt: "2026-03-14T16:00:00.000Z",
      }),
    ).toEqual({
      code: "stream_interrupted",
      stage: "streaming",
      message: "The streaming response ended unexpectedly.",
      retryable: true,
      detail: "The stream closed before the final completion event arrived.",
      recordedAt: "2026-03-14T16:00:00.000Z",
    });
  });

  it("falls back to an unknown execution failure when only the legacy error string exists", () => {
    expect(
      parseWorkspaceRunFailure(undefined, {
        error: "Provider request timed out.",
        recordedAt: "2026-03-14T16:05:00.000Z",
      }),
    ).toEqual({
      code: "unknown",
      stage: "execution",
      message: "Provider request timed out.",
      retryable: false,
      detail: null,
      recordedAt: "2026-03-14T16:05:00.000Z",
    });
  });

  it("derives a structured timeout failure for failed tool executions", () => {
    expect(
      buildWorkspaceToolExecutionFailure({
        attempt: 2,
        metadata: {
          failureReason: "timeout",
          maxAttempts: "3",
          timeoutMs: "155",
        },
        result: {
          content: "Tool `workspace.search` timed out after 155 ms on attempt 2.",
          isError: true,
          recordedAt: "2026-03-16T12:00:00.120Z",
        },
        status: "failed",
        toolName: "workspace.search",
      }),
    ).toEqual({
      code: "tool_timeout",
      stage: "tool_execution",
      message: 'Tool "workspace.search" timed out.',
      retryable: true,
      detail: "Tool `workspace.search` timed out after 155 ms on attempt 2.",
      recordedAt: "2026-03-16T12:00:00.120Z",
    });
  });

  it("derives a structured approval rejection failure for rejected tool executions", () => {
    expect(
      buildWorkspaceToolExecutionFailure({
        attempt: 1,
        metadata: {
          failureReason: "approval_rejected",
        },
        result: {
          content: "Tool `tenant.access.review` was not executed because approval was rejected.",
          isError: true,
          recordedAt: "2026-03-16T12:10:00.000Z",
        },
        status: "failed",
        toolName: "tenant.access.review",
      }),
    ).toEqual({
      code: "tool_approval_rejected",
      stage: "tool_approval",
      message: 'Tool "tenant.access.review" was rejected during approval.',
      retryable: false,
      detail:
        "Tool `tenant.access.review` was not executed because approval was rejected.",
      recordedAt: "2026-03-16T12:10:00.000Z",
    });
  });
});
