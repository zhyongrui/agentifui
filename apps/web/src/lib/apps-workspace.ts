export const WORKSPACE_FAVORITES_KEY = 'agentifui.workspace.favorite-apps';
export const WORKSPACE_RECENTS_KEY = 'agentifui.workspace.recent-apps';
export const WORKSPACE_ACTIVE_GROUP_KEY = 'agentifui.workspace.active-group-id';

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readStoredIds(storage: Pick<Storage, 'getItem'>, key: string): string[] {
  const raw = storage.getItem(key);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return [...new Set(parsed.filter((value): value is string => typeof value === 'string'))];
  } catch {
    return [];
  }
}

export function writeStoredIds(storage: BrowserStorage, key: string, value: string[]) {
  storage.setItem(key, JSON.stringify([...new Set(value)]));
}

export function readStoredGroupId(storage: Pick<Storage, 'getItem'>, key: string): string | null {
  const value = storage.getItem(key);

  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function writeStoredGroupId(storage: BrowserStorage, key: string, value: string) {
  storage.setItem(key, value);
}

export function toggleFavoriteApp(currentIds: string[], appId: string): string[] {
  return currentIds.includes(appId)
    ? currentIds.filter(currentId => currentId !== appId)
    : [...currentIds, appId];
}

export function recordRecentApp(currentIds: string[], appId: string, limit = 4): string[] {
  return [appId, ...currentIds.filter(currentId => currentId !== appId)].slice(0, limit);
}

export function resolveActiveGroupId(
  candidateGroupId: string | null,
  memberGroupIds: string[],
  fallbackGroupId: string
): string {
  if (candidateGroupId && memberGroupIds.includes(candidateGroupId)) {
    return candidateGroupId;
  }

  return fallbackGroupId;
}
