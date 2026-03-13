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
export type WorkspaceConversationShareStatus = 'active' | 'revoked';
export type WorkspaceConversationShareAccess = 'read_only';

export type WorkspaceRunType = 'workflow' | 'agent' | 'generation';

export type WorkspaceRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'stopped';

export type WorkspaceRunTrigger = 'app_launch' | 'chat_completion';

export type WorkspaceRunTimelineEventType =
  | 'run_created'
  | 'input_recorded'
  | 'run_started'
  | 'stop_requested'
  | 'output_recorded'
  | 'run_succeeded'
  | 'run_failed'
  | 'run_stopped';

export type WorkspaceConversationMessageStatus =
  | 'completed'
  | 'streaming'
  | 'stopped'
  | 'failed';

export const WORKSPACE_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;

export const WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES = [
  'application/json',
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/markdown',
  'text/plain',
] as const;

export type WorkspaceAttachmentContentType =
  (typeof WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES)[number];

export type WorkspaceConversationAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type WorkspaceMessageFeedbackRating = 'positive' | 'negative';

export type WorkspaceConversationMessageFeedback = {
  rating: WorkspaceMessageFeedbackRating;
  updatedAt: string;
};

export type WorkspaceConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: WorkspaceConversationMessageStatus;
  createdAt: string;
  attachments?: WorkspaceConversationAttachment[];
  feedback?: WorkspaceConversationMessageFeedback | null;
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

export type WorkspaceRunTimelineEvent = {
  id: string;
  type: WorkspaceRunTimelineEventType;
  createdAt: string;
  metadata: Record<string, unknown>;
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
  timeline: WorkspaceRunTimelineEvent[];
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

export type WorkspaceConversationListItem = {
  id: string;
  title: string;
  status: WorkspaceConversationStatus;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessagePreview: string | null;
  app: Pick<
    WorkspaceApp,
    'id' | 'slug' | 'name' | 'summary' | 'kind' | 'status' | 'shortCode'
  >;
  activeGroup: WorkspaceGroup;
  run: WorkspaceRunSummary;
};

export type WorkspaceConversationResponse = {
  ok: true;
  data: WorkspaceConversation;
};

export type WorkspaceConversationMessageFeedbackRequest = {
  rating: WorkspaceMessageFeedbackRating | null;
};

export type WorkspaceConversationMessageFeedbackResponse = {
  ok: true;
  data: {
    conversationId: string;
    message: WorkspaceConversationMessage;
  };
};

export type WorkspaceConversationListResponse = {
  ok: true;
  data: {
    items: WorkspaceConversationListItem[];
    filters: {
      appId: string | null;
      groupId: string | null;
      query: string | null;
      limit: number;
    };
  };
};

export type WorkspaceConversationShare = {
  id: string;
  conversationId: string;
  status: WorkspaceConversationShareStatus;
  access: WorkspaceConversationShareAccess;
  shareUrl: string;
  group: WorkspaceGroup;
  createdAt: string;
  revokedAt: string | null;
};

export type WorkspaceConversationShareCreateRequest = {
  groupId: string;
};

export type WorkspaceConversationShareResponse = {
  ok: true;
  data: WorkspaceConversationShare;
};

export type WorkspaceConversationSharesResponse = {
  ok: true;
  data: {
    conversationId: string;
    shares: WorkspaceConversationShare[];
  };
};

export type WorkspaceSharedConversationResponse = {
  ok: true;
  data: {
    share: WorkspaceConversationShare;
    conversation: WorkspaceConversation;
  };
};

export type WorkspaceConversationUploadRequest = {
  fileName: string;
  contentType: string;
  base64Data: string;
};

export type WorkspaceConversationUploadResponse = {
  ok: true;
  data: WorkspaceConversationAttachment;
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
  | 'WORKSPACE_LAUNCH_BLOCKED'
  | 'WORKSPACE_UPLOAD_BLOCKED';

export type WorkspaceErrorResponse = {
  ok: false;
  error: {
    code: WorkspaceErrorCode;
    message: string;
    details?: unknown;
  };
};
