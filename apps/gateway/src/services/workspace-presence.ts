import type {
  WorkspaceConversationPresence,
  WorkspaceConversationPresenceEntry,
  WorkspaceConversationPresenceState,
  WorkspaceConversationPresenceSurface,
} from "@agentifui/shared/apps";
import type { AuthUser } from "@agentifui/shared/auth";

type WorkspacePresenceRecord = Omit<
  WorkspaceConversationPresenceEntry,
  "isCurrentUser"
>;

const WORKSPACE_PRESENCE_TTL_MS = 60_000;

function isPresenceSurface(
  value: unknown,
): value is WorkspaceConversationPresenceSurface {
  return value === "conversation";
}

function isPresenceState(value: unknown): value is WorkspaceConversationPresenceState {
  return value === "active" || value === "idle";
}

function normalizePresenceRecord(value: unknown): WorkspacePresenceRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.sessionId !== "string" ||
    typeof record.userId !== "string" ||
    typeof record.displayName !== "string" ||
    typeof record.joinedAt !== "string" ||
    typeof record.lastSeenAt !== "string" ||
    typeof record.expiresAt !== "string" ||
    !isPresenceSurface(record.surface) ||
    !isPresenceState(record.state)
  ) {
    return null;
  }

  return {
    sessionId: record.sessionId,
    userId: record.userId,
    displayName: record.displayName,
    joinedAt: record.joinedAt,
    lastSeenAt: record.lastSeenAt,
    expiresAt: record.expiresAt,
    surface: record.surface,
    state: record.state,
    activeRunId:
      typeof record.activeRunId === "string" ? record.activeRunId : null,
  };
}

export function workspacePresenceTtlSeconds() {
  return Math.round(WORKSPACE_PRESENCE_TTL_MS / 1000);
}

export function pruneWorkspacePresenceEntries(
  entries: WorkspacePresenceRecord[],
  now = new Date().toISOString(),
) {
  const nowMs = Date.parse(now);

  return entries.filter((entry) => {
    const expiresAtMs = Date.parse(entry.expiresAt);
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
}

export function readWorkspacePresenceEntries(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return pruneWorkspacePresenceEntries(
    value.flatMap((entry) => {
      const normalized = normalizePresenceRecord(entry);
      return normalized ? [normalized] : [];
    }),
  );
}

export function upsertWorkspacePresenceEntry(input: {
  activeRunId?: string | null;
  entries: WorkspacePresenceRecord[];
  now?: string;
  sessionId: string;
  state?: WorkspaceConversationPresenceState;
  surface?: WorkspaceConversationPresenceSurface;
  user: AuthUser;
}) {
  const now = input.now ?? new Date().toISOString();
  const expiresAt = new Date(Date.parse(now) + WORKSPACE_PRESENCE_TTL_MS).toISOString();
  const nextState = input.state ?? "active";
  const nextSurface = input.surface ?? "conversation";
  const currentEntries = pruneWorkspacePresenceEntries(input.entries, now);
  const existing = currentEntries.find(
    (entry) => entry.sessionId === input.sessionId,
  );

  const nextEntry: WorkspacePresenceRecord = {
    sessionId: input.sessionId,
    userId: input.user.id,
    displayName: input.user.displayName,
    joinedAt: existing?.joinedAt ?? now,
    lastSeenAt: now,
    expiresAt,
    surface: nextSurface,
    state: nextState,
    activeRunId: input.activeRunId?.trim() || null,
  };

  return [
    nextEntry,
    ...currentEntries.filter((entry) => entry.sessionId !== input.sessionId),
  ].sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt));
}

export function buildWorkspaceConversationPresence(input: {
  conversationId: string;
  entries: WorkspacePresenceRecord[];
  currentUserId: string;
}) : WorkspaceConversationPresence {
  return {
    conversationId: input.conversationId,
    ttlSeconds: workspacePresenceTtlSeconds(),
    viewers: input.entries.map((entry) => ({
      ...entry,
      isCurrentUser: entry.userId === input.currentUserId,
    })),
  };
}
