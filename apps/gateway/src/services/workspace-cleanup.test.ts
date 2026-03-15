import { describe, expect, it } from "vitest";

import {
  buildWorkspaceCleanupCutoffs,
  buildWorkspaceCleanupPolicy,
  countWorkspaceCleanupCandidates,
} from "./workspace-cleanup.js";

describe("workspace cleanup helpers", () => {
  it("builds deterministic cleanup cutoffs from the retention policy", () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    const policy = buildWorkspaceCleanupPolicy();

    expect(policy).toEqual({
      archivedConversationRetentionDays: 30,
      shareExpiryDays: 14,
      timelineRetentionDays: 14,
    });
    expect(buildWorkspaceCleanupCutoffs(now, policy)).toEqual({
      archivedConversationBefore: "2026-02-13T12:00:00.000Z",
      shareCreatedBefore: "2026-03-01T12:00:00.000Z",
      timelineCreatedBefore: "2026-03-01T12:00:00.000Z",
    });
  });

  it("totals cleanup candidates across all retention buckets", () => {
    expect(
      countWorkspaceCleanupCandidates({
        archivedConversations: 3,
        expiredShares: 2,
        orphanedArtifacts: 1,
        coldTimelineEvents: 5,
      }),
    ).toBe(11);
  });
});
