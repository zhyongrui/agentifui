import type { ChatToolCall } from "../tools/contracts.js";

export type WorkspaceAppKind =
  | "chat"
  | "analysis"
  | "automation"
  | "governance";

export type WorkspaceAppStatus = "ready" | "beta";

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

export type QuotaScope = "tenant" | "group" | "user";

export type QuotaServiceState = "available" | "degraded";

export type QuotaUsage = {
  scope: QuotaScope;
  scopeId: string;
  scopeLabel: string;
  used: number;
  limit: number;
};

export type QuotaSeverity = "healthy" | "warning" | "critical" | "blocked";

export type WorkspaceSections = {
  recent: WorkspaceApp[];
  favorites: WorkspaceApp[];
  all: WorkspaceApp[];
};

export type LaunchBlockReason =
  | "ok"
  | "not_authorized"
  | "group_switch_required"
  | "quota_exceeded"
  | "quota_service_degraded";

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

export type WorkspaceAppLaunchStatus = "handoff_ready" | "conversation_ready";

export type WorkspaceConversationStatus = "active" | "archived" | "deleted";

export type WorkspaceConversationListStatusFilter = Exclude<
  WorkspaceConversationStatus,
  "deleted"
>;

export type WorkspaceConversationListAttachmentFilter = "with_attachments";

export type WorkspaceConversationListFeedbackFilter =
  | "any"
  | WorkspaceMessageFeedbackRating;

export type WorkspaceConversationFeedbackSummary = {
  positiveCount: number;
  negativeCount: number;
};
export type WorkspaceConversationShareStatus = "active" | "revoked";
export type WorkspaceConversationShareAccess = "read_only";
export type WorkspaceConversationPresenceSurface =
  | "conversation"
  | "shared_conversation";
export type WorkspaceConversationPresenceState = "active" | "idle";

export type WorkspaceRunType = "workflow" | "agent" | "generation";

export type WorkspaceRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "stopped";

export type WorkspaceRunTrigger = "app_launch" | "chat_completion";

export type WorkspaceRunTimelineEventType =
  | "run_created"
  | "input_recorded"
  | "run_started"
  | "stop_requested"
  | "output_recorded"
  | "run_succeeded"
  | "run_failed"
  | "run_stopped";

export type WorkspaceConversationMessageStatus =
  | "completed"
  | "streaming"
  | "stopped"
  | "failed";

export const WORKSPACE_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;

export const WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES = [
  "application/json",
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
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

export type WorkspaceArtifactKind =
  | "text"
  | "markdown"
  | "json"
  | "table"
  | "link";

export type WorkspaceArtifactSource =
  | "assistant_response"
  | "tool_output"
  | "user_upload";

export type WorkspaceArtifactStatus = "draft" | "stable";

export type WorkspaceArtifactJsonValue =
  | string
  | number
  | boolean
  | null
  | WorkspaceArtifactJsonValue[]
  | { [key: string]: WorkspaceArtifactJsonValue };

export type WorkspaceArtifactTableCell = string | number | boolean | null;

export type WorkspaceArtifactSummary = {
  id: string;
  title: string;
  kind: WorkspaceArtifactKind;
  source: WorkspaceArtifactSource;
  status: WorkspaceArtifactStatus;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  comments?: WorkspaceComment[];
};

type WorkspaceArtifactBase = WorkspaceArtifactSummary;

export type WorkspaceTextArtifact = WorkspaceArtifactBase & {
  kind: "text" | "markdown";
  content: string;
};

export type WorkspaceJsonArtifact = WorkspaceArtifactBase & {
  kind: "json";
  content: WorkspaceArtifactJsonValue;
};

export type WorkspaceTableArtifact = WorkspaceArtifactBase & {
  kind: "table";
  columns: string[];
  rows: WorkspaceArtifactTableCell[][];
};

export type WorkspaceLinkArtifact = WorkspaceArtifactBase & {
  kind: "link";
  href: string;
  label: string;
};

export type WorkspaceArtifact =
  | WorkspaceTextArtifact
  | WorkspaceJsonArtifact
  | WorkspaceTableArtifact
  | WorkspaceLinkArtifact;

export type WorkspaceSourceBlockKind =
  | "workspace_context"
  | "app_reference"
  | "attachment"
  | "knowledge"
  | "web";

export type WorkspaceSourceBlock = {
  id: string;
  kind: WorkspaceSourceBlockKind;
  title: string;
  href: string | null;
  snippet: string | null;
  metadata: Record<string, string>;
};

export type WorkspaceCitation = {
  id: string;
  label: string;
  title: string;
  sourceBlockId: string;
  href: string | null;
  snippet: string | null;
};

export type WorkspaceSafetySignalSeverity = "warning" | "critical";

export type WorkspaceSafetySignalCategory =
  | "prompt_injection"
  | "data_exfiltration"
  | "policy_violation";

export type WorkspaceSafetySignal = {
  id: string;
  severity: WorkspaceSafetySignalSeverity;
  category: WorkspaceSafetySignalCategory;
  summary: string;
  detail: string | null;
  recordedAt: string;
};

export type WorkspaceMessageFeedbackRating = "positive" | "negative";

export type WorkspaceConversationMessageFeedback = {
  rating: WorkspaceMessageFeedbackRating;
  updatedAt: string;
};

export type WorkspaceCommentTargetType = "message" | "run" | "artifact";

export type WorkspaceComment = {
  id: string;
  conversationId: string;
  targetType: WorkspaceCommentTargetType;
  targetId: string;
  content: string;
  authorUserId: string;
  authorDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceConversationMessageRole = "user" | "assistant" | "tool";

export type WorkspaceConversationMessage = {
  id: string;
  role: WorkspaceConversationMessageRole;
  content: string;
  status: WorkspaceConversationMessageStatus;
  createdAt: string;
  attachments?: WorkspaceConversationAttachment[];
  artifacts?: WorkspaceArtifactSummary[];
  citations?: WorkspaceCitation[];
  safetySignals?: WorkspaceSafetySignal[];
  feedback?: WorkspaceConversationMessageFeedback | null;
  comments?: WorkspaceComment[];
  suggestedPrompts?: string[];
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ChatToolCall[];
};

export type WorkspaceHitlStepKind = "approval" | "input_request";

export type WorkspaceHitlStepStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "submitted"
  | "expired"
  | "cancelled";

export type WorkspaceHitlFieldType = "text" | "textarea" | "select";

export type WorkspaceHitlStepResponseAction =
  | "approve"
  | "reject"
  | "submit"
  | "cancel";

export type WorkspaceHitlOption = {
  id: string;
  label: string;
  value: string;
  description?: string | null;
};

export type WorkspaceHitlStepResponse = {
  action: WorkspaceHitlStepResponseAction;
  respondedAt: string;
  actorUserId: string;
  actorDisplayName: string | null;
  note?: string | null;
  values?: Record<string, string>;
};

type WorkspaceHitlStepBase = {
  id: string;
  kind: WorkspaceHitlStepKind;
  status: WorkspaceHitlStepStatus;
  title: string;
  description: string | null;
  conversationId: string;
  runId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  metadata?: Record<string, string>;
  response?: WorkspaceHitlStepResponse | null;
};

export type WorkspaceApprovalHitlStep = WorkspaceHitlStepBase & {
  kind: "approval";
  approveLabel: string;
  rejectLabel: string;
};

export type WorkspaceHitlInputField = {
  id: string;
  label: string;
  type: WorkspaceHitlFieldType;
  required: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  defaultValue?: string | null;
  options?: WorkspaceHitlOption[];
};

export type WorkspaceInputRequestHitlStep = WorkspaceHitlStepBase & {
  kind: "input_request";
  submitLabel: string;
  fields: WorkspaceHitlInputField[];
};

export type WorkspaceHitlStep =
  | WorkspaceApprovalHitlStep
  | WorkspaceInputRequestHitlStep;

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

export type WorkspaceRunFailureCode =
  | "stream_interrupted"
  | "provider_error"
  | "persistence_error"
  | "validation_error"
  | "quota_exceeded"
  | "runtime_unavailable"
  | "tool_timeout"
  | "tool_provider_error"
  | "tool_approval_rejected"
  | "tool_approval_cancelled"
  | "tool_approval_expired"
  | "unknown";

export type WorkspaceRunFailureStage =
  | "launch"
  | "input_validation"
  | "execution"
  | "streaming"
  | "tool_execution"
  | "tool_approval"
  | "persistence";

export type WorkspaceRunFailure = {
  code: WorkspaceRunFailureCode;
  stage: WorkspaceRunFailureStage;
  message: string;
  retryable: boolean;
  detail: string | null;
  recordedAt: string;
};

export type WorkspaceRuntimeHealthState = "available" | "degraded";

export type WorkspaceRuntimeCapabilities = {
  streaming: boolean;
  citations: boolean;
  artifacts: boolean;
  safety: boolean;
  pendingActions: boolean;
  files: boolean;
};

export type WorkspaceRunRuntime = {
  id: string;
  label: string;
  status: WorkspaceRuntimeHealthState;
  capabilities: WorkspaceRuntimeCapabilities;
  invokedAt: string;
};

export type WorkspaceRunToolExecutionStatus = "succeeded" | "failed";

export type WorkspaceRunToolExecutionResult = {
  content: string;
  isError: boolean;
  recordedAt: string;
};

export type WorkspaceRunToolExecution = {
  id: string;
  attempt: number;
  status: WorkspaceRunToolExecutionStatus;
  startedAt: string;
  finishedAt: string | null;
  latencyMs: number | null;
  request: ChatToolCall;
  metadata?: Record<string, string>;
  failure?: WorkspaceRunFailure | null;
  result: WorkspaceRunToolExecutionResult | null;
};

export type WorkspaceRun = WorkspaceRunSummary & {
  conversationId: string;
  app: Pick<
    WorkspaceApp,
    "id" | "slug" | "name" | "summary" | "kind" | "status" | "shortCode"
  >;
  activeGroup: WorkspaceGroup;
  error: string | null;
  failure: WorkspaceRunFailure | null;
  runtime: WorkspaceRunRuntime | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  comments: WorkspaceComment[];
  toolExecutions: WorkspaceRunToolExecution[];
  artifacts: WorkspaceArtifact[];
  citations: WorkspaceCitation[];
  safetySignals: WorkspaceSafetySignal[];
  sourceBlocks: WorkspaceSourceBlock[];
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
    | "id"
    | "slug"
    | "name"
    | "summary"
    | "kind"
    | "status"
    | "shortCode"
    | "launchCost"
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
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  launchId: string | null;
  app: Pick<
    WorkspaceApp,
    "id" | "slug" | "name" | "summary" | "kind" | "status" | "shortCode"
  >;
  activeGroup: WorkspaceGroup;
  messages: WorkspaceConversationMessage[];
  run: WorkspaceRunSummary;
};

export type WorkspaceCommentCreateRequest = {
  targetType: WorkspaceCommentTargetType;
  targetId: string;
  content: string;
};

export type WorkspaceCommentCreateResponse = {
  ok: true;
  data: {
    conversationId: string;
    targetType: WorkspaceCommentTargetType;
    targetId: string;
    comment: WorkspaceComment;
    thread: WorkspaceComment[];
  };
};

export type WorkspaceConversationListItem = {
  id: string;
  title: string;
  status: WorkspaceConversationStatus;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  attachmentCount: number;
  feedbackSummary: WorkspaceConversationFeedbackSummary;
  lastMessagePreview: string | null;
  app: Pick<
    WorkspaceApp,
    "id" | "slug" | "name" | "summary" | "kind" | "status" | "shortCode"
  >;
  activeGroup: WorkspaceGroup;
  run: WorkspaceRunSummary;
};

export type WorkspaceConversationResponse = {
  ok: true;
  data: WorkspaceConversation;
};

export type WorkspaceConversationUpdateRequest = {
  title?: string;
  status?: WorkspaceConversationStatus;
  pinned?: boolean;
};

export type WorkspaceConversationUpdateResponse = {
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
      attachment: WorkspaceConversationListAttachmentFilter | null;
      feedback: WorkspaceConversationListFeedbackFilter | null;
      groupId: string | null;
      query: string | null;
      status: WorkspaceConversationListStatusFilter | null;
      tag: string | null;
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

export type WorkspaceConversationPresenceEntry = {
  sessionId: string;
  userId: string;
  displayName: string;
  joinedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  surface: WorkspaceConversationPresenceSurface;
  state: WorkspaceConversationPresenceState;
  activeRunId: string | null;
  isCurrentUser: boolean;
};

export type WorkspaceConversationPresence = {
  conversationId: string;
  ttlSeconds: number;
  viewers: WorkspaceConversationPresenceEntry[];
};

export type WorkspaceConversationPresenceUpdateRequest = {
  sessionId: string;
  surface?: WorkspaceConversationPresenceSurface;
  state?: WorkspaceConversationPresenceState;
  activeRunId?: string | null;
};

export type WorkspaceConversationPresenceResponse = {
  ok: true;
  data: WorkspaceConversationPresence;
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

export type WorkspacePendingActionsResponse = {
  ok: true;
  data: {
    conversationId: string;
    runId: string;
    items: WorkspaceHitlStep[];
  };
};

export type WorkspacePendingActionRespondRequest =
  | {
      action: "approve";
      note?: string | null;
    }
  | {
      action: "reject";
      note?: string | null;
    }
  | {
      action: "submit";
      note?: string | null;
      values: Record<string, string>;
    }
  | {
      action: "cancel";
      note?: string | null;
    };

export type WorkspacePendingActionRespondResponse = {
  ok: true;
  data: {
    conversationId: string;
    runId: string;
    item: WorkspaceHitlStep;
    items: WorkspaceHitlStep[];
  };
};

export type WorkspaceArtifactResponse = {
  ok: true;
  data: WorkspaceArtifact;
};

export type WorkspaceErrorCode =
  | "WORKSPACE_UNAUTHORIZED"
  | "WORKSPACE_FORBIDDEN"
  | "WORKSPACE_INVALID_PAYLOAD"
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_LAUNCH_BLOCKED"
  | "WORKSPACE_UPLOAD_BLOCKED"
  | "WORKSPACE_ACTION_CONFLICT";

export type WorkspaceErrorResponse = {
  ok: false;
  error: {
    code: WorkspaceErrorCode;
    message: string;
    details?: unknown;
  };
};
