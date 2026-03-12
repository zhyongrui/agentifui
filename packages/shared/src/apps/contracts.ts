export type WorkspaceAppKind = 'chat' | 'analysis' | 'automation' | 'governance';

export type WorkspaceAppStatus = 'ready' | 'beta';

export type WorkspaceGroup = {
  id: string;
  name: string;
  description: string;
};

export type WorkspaceApp = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  kind: WorkspaceAppKind;
  status: WorkspaceAppStatus;
  shortCode: string;
  tags: string[];
  grantedGroupIds: string[];
  launchCost: number;
};

export type QuotaScope = 'tenant' | 'group' | 'user';

export type QuotaServiceState = 'available' | 'degraded';

export type QuotaUsage = {
  scope: QuotaScope;
  scopeId: string;
  scopeLabel: string;
  used: number;
  limit: number;
};

export type QuotaSeverity = 'healthy' | 'warning' | 'critical' | 'blocked';

export type WorkspaceSections = {
  recent: WorkspaceApp[];
  favorites: WorkspaceApp[];
  all: WorkspaceApp[];
};

export type LaunchBlockReason =
  | 'ok'
  | 'not_authorized'
  | 'group_switch_required'
  | 'quota_exceeded'
  | 'quota_service_degraded';

export type AppLaunchGuard = {
  canLaunch: boolean;
  reason: LaunchBlockReason;
  attributedGroupId: string | null;
  eligibleGroupIds: string[];
  blockingScopes: QuotaUsage[];
};

export type WorkspaceCatalog = {
  groups: WorkspaceGroup[];
  memberGroupIds: string[];
  defaultActiveGroupId: string;
  apps: WorkspaceApp[];
  favoriteAppIds: string[];
  recentAppIds: string[];
  quotaServiceState: QuotaServiceState;
  quotaUsagesByGroupId: Record<string, QuotaUsage[]>;
  generatedAt: string;
};

export type WorkspaceCatalogResponse = {
  ok: true;
  data: WorkspaceCatalog;
};

export type WorkspacePreferences = {
  favoriteAppIds: string[];
  recentAppIds: string[];
  defaultActiveGroupId: string | null;
  updatedAt: string | null;
};

export type WorkspacePreferencesUpdateRequest = {
  favoriteAppIds: string[];
  recentAppIds: string[];
  defaultActiveGroupId: string | null;
};

export type WorkspacePreferencesResponse = {
  ok: true;
  data: WorkspacePreferences;
};

export type WorkspaceAppLaunchRequest = {
  appId: string;
  activeGroupId: string;
};

export type WorkspaceAppLaunchStatus = 'handoff_ready';

export type WorkspaceAppLaunch = {
  id: string;
  status: WorkspaceAppLaunchStatus;
  launchUrl: string;
  launchedAt: string;
  app: Pick<
    WorkspaceApp,
    'id' | 'slug' | 'name' | 'summary' | 'kind' | 'status' | 'shortCode' | 'launchCost'
  >;
  attributedGroup: WorkspaceGroup;
};

export type WorkspaceAppLaunchResponse = {
  ok: true;
  data: WorkspaceAppLaunch;
};

export type WorkspaceErrorCode =
  | 'WORKSPACE_UNAUTHORIZED'
  | 'WORKSPACE_FORBIDDEN'
  | 'WORKSPACE_INVALID_PAYLOAD'
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_LAUNCH_BLOCKED';

export type WorkspaceErrorResponse = {
  ok: false;
  error: {
    code: WorkspaceErrorCode;
    message: string;
    details?: unknown;
  };
};
