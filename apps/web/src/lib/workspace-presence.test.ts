import { describe, expect, it, vi } from "vitest";

import {
  readOrCreateWorkspacePresenceSessionId,
  summarizeWorkspacePresence,
} from "./workspace-presence.js";

describe("workspace presence helpers", () => {
  it("reuses an existing session id for the same conversation", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue("presence_existing"),
      setItem: vi.fn(),
    };

    const sessionId = readOrCreateWorkspacePresenceSessionId(storage, "conv-123");

    expect(sessionId).toBe("presence_existing");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("creates and stores a new session id when one does not exist", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    };

    const sessionId = readOrCreateWorkspacePresenceSessionId(storage, "conv-123");

    expect(sessionId.startsWith("presence_")).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(
      "workspace.presence.conv-123",
      sessionId,
    );
  });

  it("summarizes active and idle viewers", () => {
    expect(
      summarizeWorkspacePresence({
        conversationId: "conv-123",
        ttlSeconds: 60,
        viewers: [
          {
            sessionId: "presence-a",
            userId: "usr_a",
            displayName: "Reviewer A",
            joinedAt: "2026-03-16T15:00:00.000Z",
            lastSeenAt: "2026-03-16T15:00:30.000Z",
            expiresAt: "2026-03-16T15:01:30.000Z",
            surface: "conversation",
            state: "active",
            activeRunId: "run-1",
            isCurrentUser: true,
          },
          {
            sessionId: "presence-b",
            userId: "usr_b",
            displayName: "Reviewer B",
            joinedAt: "2026-03-16T15:00:00.000Z",
            lastSeenAt: "2026-03-16T15:00:20.000Z",
            expiresAt: "2026-03-16T15:01:20.000Z",
            surface: "conversation",
            state: "idle",
            activeRunId: null,
            isCurrentUser: false,
          },
        ],
      }),
    ).toEqual({
      total: 2,
      active: 1,
      idle: 1,
    });
  });
});
