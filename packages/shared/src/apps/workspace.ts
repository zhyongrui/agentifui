import type {
  AppLaunchGuard,
  QuotaServiceState,
  QuotaSeverity,
  QuotaUsage,
  WorkspaceApp,
  WorkspaceSections,
} from './contracts.js';

type BuildWorkspaceSectionsArgs = {
  apps: WorkspaceApp[];
  memberGroupIds: string[];
  favoriteIds: string[];
  recentIds: string[];
  search: string;
};

type EvaluateAppLaunchArgs = {
  app: WorkspaceApp;
  activeGroupId: string;
  memberGroupIds: string[];
  quotas: QuotaUsage[];
  quotaServiceState: QuotaServiceState;
};

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function listVisibleApps(apps: WorkspaceApp[], memberGroupIds: string[]): WorkspaceApp[] {
  const memberGroupIdSet = new Set(memberGroupIds);

  return apps.filter(app => app.grantedGroupIds.some(groupId => memberGroupIdSet.has(groupId)));
}

export function searchWorkspaceApps(apps: WorkspaceApp[], search: string): WorkspaceApp[] {
  const normalizedSearch = normalizeSearchQuery(search);

  if (!normalizedSearch) {
    return apps;
  }

  return apps.filter(app =>
    [app.name, app.summary, app.kind, ...app.tags].some(value =>
      value.toLowerCase().includes(normalizedSearch)
    )
  );
}

export function buildWorkspaceSections({
  apps,
  memberGroupIds,
  favoriteIds,
  recentIds,
  search,
}: BuildWorkspaceSectionsArgs): WorkspaceSections {
  const visibleApps = searchWorkspaceApps(listVisibleApps(apps, memberGroupIds), search).sort(
    (left, right) => left.name.localeCompare(right.name)
  );
  const visibleAppById = new Map(visibleApps.map(app => [app.id, app]));
  const favoriteIdSet = new Set(favoriteIds);

  return {
    recent: recentIds
      .map(appId => visibleAppById.get(appId))
      .filter((app): app is WorkspaceApp => app !== undefined),
    favorites: visibleApps.filter(app => favoriteIdSet.has(app.id)),
    all: visibleApps,
  };
}

export function getQuotaSeverity(usage: QuotaUsage): QuotaSeverity {
  if (usage.limit <= 0) {
    return 'blocked';
  }

  const ratio = usage.used / usage.limit;

  if (ratio >= 1) {
    return 'blocked';
  }

  if (ratio >= 0.9) {
    return 'critical';
  }

  if (ratio >= 0.8) {
    return 'warning';
  }

  return 'healthy';
}

export function listQuotaAlerts(usages: QuotaUsage[]): QuotaUsage[] {
  const severityPriority: Record<QuotaSeverity, number> = {
    blocked: 3,
    critical: 2,
    warning: 1,
    healthy: 0,
  };

  return usages
    .filter(usage => getQuotaSeverity(usage) !== 'healthy')
    .sort((left, right) => {
      const rightSeverity = severityPriority[getQuotaSeverity(right)] ?? 0;
      const leftSeverity = severityPriority[getQuotaSeverity(left)] ?? 0;
      const severityDiff = rightSeverity - leftSeverity;

      if (severityDiff !== 0) {
        return severityDiff;
      }

      return right.used / right.limit - left.used / left.limit;
    });
}

export function evaluateAppLaunch({
  app,
  activeGroupId,
  memberGroupIds,
  quotas,
  quotaServiceState,
}: EvaluateAppLaunchArgs): AppLaunchGuard {
  const memberGroupIdSet = new Set(memberGroupIds);
  const eligibleGroupIds = app.grantedGroupIds.filter(groupId => memberGroupIdSet.has(groupId));

  if (eligibleGroupIds.length === 0) {
    return {
      canLaunch: false,
      reason: 'not_authorized',
      attributedGroupId: null,
      eligibleGroupIds,
      blockingScopes: [],
    };
  }

  if (quotaServiceState === 'degraded') {
    return {
      canLaunch: false,
      reason: 'quota_service_degraded',
      attributedGroupId: null,
      eligibleGroupIds,
      blockingScopes: [],
    };
  }

  if (!eligibleGroupIds.includes(activeGroupId)) {
    return {
      canLaunch: false,
      reason: 'group_switch_required',
      attributedGroupId: null,
      eligibleGroupIds,
      blockingScopes: [],
    };
  }

  const blockingScopes = quotas.filter(usage => usage.used + app.launchCost > usage.limit);

  if (blockingScopes.length > 0) {
    return {
      canLaunch: false,
      reason: 'quota_exceeded',
      attributedGroupId: activeGroupId,
      eligibleGroupIds,
      blockingScopes,
    };
  }

  return {
    canLaunch: true,
    reason: 'ok',
    attributedGroupId: activeGroupId,
    eligibleGroupIds,
    blockingScopes: [],
  };
}
