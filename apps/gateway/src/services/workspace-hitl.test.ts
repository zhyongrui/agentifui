import { describe, expect, it } from "vitest";

import {
  applyWorkspaceHitlStepResponse,
  expireWorkspaceHitlSteps,
} from "./workspace-hitl.js";

describe("workspace HITL helpers", () => {
  it("expires pending steps whose deadline has passed", () => {
    const now = "2026-03-14T15:00:00.000Z";
    const expiredAt = "2026-03-14T14:00:00.000Z";

    const result = expireWorkspaceHitlSteps({
      now,
      items: [
        {
          id: "hitl-expired",
          kind: "approval",
          status: "pending",
          title: "Approve tenant access change",
          description: "Needs review.",
          conversationId: "conv_1",
          runId: "run_1",
          createdAt: "2026-03-14T13:00:00.000Z",
          updatedAt: "2026-03-14T13:00:00.000Z",
          expiresAt: expiredAt,
          approveLabel: "Approve",
          rejectLabel: "Reject",
        },
        {
          id: "hitl-active",
          kind: "approval",
          status: "pending",
          title: "Approve tenant access change",
          description: "Still active.",
          conversationId: "conv_1",
          runId: "run_1",
          createdAt: "2026-03-14T13:00:00.000Z",
          updatedAt: "2026-03-14T13:00:00.000Z",
          expiresAt: "2026-03-14T16:00:00.000Z",
          approveLabel: "Approve",
          rejectLabel: "Reject",
        },
      ],
    });

    expect(result.expiredItems).toHaveLength(1);
    expect(result.expiredItems[0]).toMatchObject({
      id: "hitl-expired",
      status: "expired",
      updatedAt: now,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "hitl-expired",
        status: "expired",
      }),
      expect.objectContaining({
        id: "hitl-active",
        status: "pending",
      }),
    ]);
  });

  it("allows pending steps to be cancelled", () => {
    const respondedAt = "2026-03-14T15:05:00.000Z";
    const result = applyWorkspaceHitlStepResponse({
      step: {
        id: "hitl-input",
        kind: "input_request",
        status: "pending",
        title: "Collect change request details",
        description: "Needs rollout details.",
        conversationId: "conv_1",
        runId: "run_1",
        createdAt: "2026-03-14T13:00:00.000Z",
        updatedAt: "2026-03-14T13:00:00.000Z",
        expiresAt: "2026-03-15T13:00:00.000Z",
        submitLabel: "Submit details",
        fields: [
          {
            id: "justification",
            label: "Business justification",
            type: "textarea",
            required: true,
          },
        ],
      },
      request: {
        action: "cancel",
        note: "Request is no longer needed.",
      },
      actorUserId: "user_1",
      actorDisplayName: "Owner",
      respondedAt,
    });

    expect(result).toEqual({
      ok: true,
      item: expect.objectContaining({
        id: "hitl-input",
        status: "cancelled",
        updatedAt: respondedAt,
        response: {
          action: "cancel",
          actorUserId: "user_1",
          actorDisplayName: "Owner",
          note: "Request is no longer needed.",
          respondedAt,
        },
      }),
    });
  });
});
