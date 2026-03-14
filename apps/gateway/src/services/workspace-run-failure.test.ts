import { describe, expect, it } from "vitest";

import {
  buildWorkspaceRunFailure,
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
});
