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

export type WorkspaceAppLaunchStatus = 'handoff_ready' | 'conversation_ready';

export type WorkspaceConversationStatus = 'active' | 'archived' | 'deleted';

export type WorkspaceRunType = 'workflow' | 'agent' | 'generation';

export type WorkspaceRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'stopped';

export type WorkspaceRunTrigger = 'app_launch' | 'chat_completion';

export type WorkspaceConversationMessageStatus =
  | 'completed'
  | 'streaming'
  | 'stopped'
  | 'failed';

export type WorkspaceConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: WorkspaceConversationMessageStatus;
  createdAt: string;
};

export type WorkspaceRunUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type WorkspaceRunSummary = {
  id: string;
  type: WorkspaceRunType;
  status: WorkspaceRunStatus;
  triggeredFrom: WorkspaceRunTrigger;
  traceId: string;
  createdAt: string;
  finishedAt: string | null;
  elapsedTime: number;
  totalTokens: number;
  totalSteps: number;
};

export type WorkspaceRun = WorkspaceRunSummary & {
  conversationId: string;
  app: Pick<
    WorkspaceApp,
    'id' | 'slug' | 'name' | 'summary' | 'kind' | 'status' | 'shortCode'
  >;
  activeGroup: WorkspaceGroup;
  error: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  usage: WorkspaceRunUsage;
};

export type WorkspaceAppLaunch = {
  id: string;
  status: WorkspaceAppLaunchStatus;
  launchUrl: string;
  launchedAt: string;
  conversationId: string | null;
  runId: string | null;
  traceId: string | null;
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

export type WorkspaceConversation = {
  id: string;
  title: string;
  status: WorkspaceConversationStatus;
  createdAt: string;
  updatedAt: string;
  launchId: string | null;
  app: Pick<
    WorkspaceApp,
    'id' | 'slug' | 'name' | 'summary' | 'kind' | 'status' | 'shortCode'
  >;
  activeGroup: WorkspaceGroup;
  messages: WorkspaceConversationMessage[];
  run: WorkspaceRunSummary;
};

export type WorkspaceConversationResponse = {
  ok: true;
  data: WorkspaceConversation;
};

export type WorkspaceConversationRunsResponse = {
  ok: true;
  data: {
    conversationId: string;
    runs: WorkspaceRunSummary[];
  };
};

export type WorkspaceRunResponse = {
  ok: true;
  data: WorkspaceRun;
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
