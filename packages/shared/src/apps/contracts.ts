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
