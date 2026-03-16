import type { WorkspaceConversationPresence } from "@agentifui/shared/apps";

const WORKSPACE_PRESENCE_SESSION_PREFIX = "workspace.presence.";

export function readOrCreateWorkspacePresenceSessionId(
  storage: Pick<Storage, "getItem" | "setItem">,
  scopeId: string,
) {
  const storageKey = `${WORKSPACE_PRESENCE_SESSION_PREFIX}${scopeId}`;
  const existing = storage.getItem(storageKey)?.trim();

  if (existing) {
    return existing;
  }

  const sessionId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `presence_${crypto.randomUUID()}`
      : `presence_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  storage.setItem(storageKey, sessionId);
  return sessionId;
}

export function summarizeWorkspacePresence(
  presence: WorkspaceConversationPresence | null,
) {
  const viewers = presence?.viewers ?? [];

  return {
    total: viewers.length,
    active: viewers.filter((viewer) => viewer.state === "active").length,
    idle: viewers.filter((viewer) => viewer.state === "idle").length,
  };
}
