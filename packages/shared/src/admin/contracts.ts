import type {
  AuthAuditAction,
  AuthAuditEntityType,
  AuthAuditEvent,
  AuthAuditLevel,
  AuthUserStatus,
} from '../auth/contracts.js';
import type { WorkspaceApp, WorkspaceGroup } from '../apps/contracts.js';
import type { WorkspaceAppToolSummary } from '../tools/contracts.js';
import type { ToolExecutionPolicy } from '../tools/contracts.js';

export type AdminErrorCode =
  | 'ADMIN_UNAUTHORIZED'
  | 'ADMIN_FORBIDDEN'
  | 'ADMIN_NOT_AVAILABLE'
  | 'ADMIN_INVALID_PAYLOAD'
  | 'ADMIN_NOT_FOUND'
  | 'ADMIN_CONFLICT';

export type AdminErrorResponse = {
  ok: false;
  error: {
    code: AdminErrorCode;
    message: string;
    details?: unknown;
  };
};

export type AdminUserGroupMembership = {
  groupId: string;
  groupName: string;
  role: 'member' | 'manager';
  isPrimary: boolean;
};

export type AdminUserSummary = {
  id: string;
  email: string;
  displayName: string;
  status: AuthUserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
  roleIds: string[];
  groupMemberships: AdminUserGroupMembership[];
};

export type AdminUsersResponse = {
  ok: true;
  data: {
    generatedAt: string;
    users: AdminUserSummary[];
  };
};

export type AdminTenantStatus = 'active' | 'suspended';

export type AdminTenantPrimaryAdmin = {
  id: string;
  email: string;
  displayName: string;
};

export type AdminTenantSummary = {
  id: string;
  slug: string;
  name: string;
  status: AdminTenantStatus;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  groupCount: number;
  appCount: number;
  adminCount: number;
  primaryAdmin: AdminTenantPrimaryAdmin | null;
};

export type AdminTenantsResponse = {
  ok: true;
  data: {
    generatedAt: string;
    tenants: AdminTenantSummary[];
  };
};

export type AdminViewerCapabilities = {
  canReadAdmin: boolean;
  canReadPlatformAdmin: boolean;
};

export type AdminContextResponse = {
  ok: true;
  data: {
    generatedAt: string;
    capabilities: AdminViewerCapabilities;
  };
};

export type AdminTenantBootstrapInvitation = {
  invitationId: string;
  invitedUserId: string;
  email: string;
  inviteToken: string;
  inviteUrl: string;
  expiresAt: string;
};

export type AdminTenantCreateRequest = {
  name: string;
  slug: string;
  adminEmail: string;
  adminDisplayName?: string | null;
};

export type AdminTenantCreateResponse = {
  ok: true;
  data: {
    tenant: AdminTenantSummary;
    bootstrapInvitation: AdminTenantBootstrapInvitation;
  };
};

export type AdminTenantStatusUpdateRequest = {
  status: AdminTenantStatus;
  reason?: string | null;
};

export type AdminTenantStatusUpdateResponse = {
  ok: true;
  data: {
    tenant: AdminTenantSummary;
    previousStatus: AdminTenantStatus;
    reason: string | null;
  };
};

export type AdminGroupAppGrant = Pick<WorkspaceApp, 'id' | 'slug' | 'name' | 'shortCode' | 'status'>;

export type AdminGroupSummary = Pick<WorkspaceGroup, 'id' | 'name' | 'description'> & {
  memberCount: number;
  managerCount: number;
  primaryMemberCount: number;
  appGrants: AdminGroupAppGrant[];
};

export type AdminGroupsResponse = {
  ok: true;
  data: {
    generatedAt: string;
    groups: AdminGroupSummary[];
  };
};

export type AdminAppGrantEffect = 'allow' | 'deny';

export type AdminAppGrantSubjectUser = {
  id: string;
  email: string;
  displayName: string;
  status: AuthUserStatus;
};

export type AdminAppUserGrant = {
  id: string;
  effect: AdminAppGrantEffect;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
  createdByUserId: string | null;
  user: AdminAppGrantSubjectUser;
};

export type AdminAppSummary = Pick<
  WorkspaceApp,
  'id' | 'slug' | 'name' | 'summary' | 'kind' | 'status' | 'shortCode' | 'launchCost'
> & {
  grantedGroups: Pick<WorkspaceGroup, 'id' | 'name'>[];
  grantedRoleIds: string[];
  directUserGrantCount: number;
  denyGrantCount: number;
  launchCount: number;
  lastLaunchedAt: string | null;
  userGrants: AdminAppUserGrant[];
  tools: WorkspaceAppToolSummary[];
  enabledToolCount: number;
  toolOverrideCount: number;
};

export type AdminAppsResponse = {
  ok: true;
  data: {
    generatedAt: string;
    apps: AdminAppSummary[];
  };
};

export type AdminCleanupPolicy = {
  archivedConversationRetentionDays: number;
  shareExpiryDays: number;
  timelineRetentionDays: number;
  staleKnowledgeSourceRetentionDays: number;
};

export type AdminCleanupPreview = {
  archivedConversations: number;
  expiredShares: number;
  orphanedArtifacts: number;
  coldTimelineEvents: number;
  staleKnowledgeSources: number;
  totalCandidates: number;
  cutoffs: {
    archivedConversationBefore: string;
    shareCreatedBefore: string;
    timelineCreatedBefore: string;
    staleKnowledgeSourceBefore: string;
  };
};

export type AdminCleanupLastRun = {
  occurredAt: string;
  actorUserId: string | null;
  summary: AdminCleanupPreview & {
    mode: 'dry_run' | 'execute';
    executedAt: string;
    actorUserId: string | null;
    archivedConversationsDeleted: number;
    expiredSharesRevoked: number;
    orphanedArtifactsDeleted: number;
    coldTimelineEventsDeleted: number;
    staleKnowledgeSourcesDeleted: number;
  };
};

export type AdminCleanupResponse = {
  ok: true;
  data: {
    generatedAt: string;
    policy: AdminCleanupPolicy;
    preview: AdminCleanupPreview;
    lastRun: AdminCleanupLastRun | null;
  };
};

export type AdminTenantUsageSummary = {
  tenantId: string;
  tenantName: string;
  launchCount: number;
  runCount: number;
  succeededRunCount: number;
  failedRunCount: number;
  stoppedRunCount: number;
  messageCount: number;
  artifactCount: number;
  uploadedFileCount: number;
  uploadedBytes: number;
  artifactBytes: number;
  totalStorageBytes: number;
  totalTokens: number;
  lastActivityAt: string | null;
  appBreakdown: AdminTenantUsageAppSummary[];
  quotaUsage: AdminTenantQuotaUsageSummary[];
};

export type AdminUsageTotals = Omit<
  AdminTenantUsageSummary,
  'tenantId' | 'tenantName' | 'appBreakdown' | 'quotaUsage'
>;

export type AdminTenantUsageAppSummary = {
  appId: string;
  appName: string;
  shortCode: string;
  kind: AdminAppSummary['kind'];
  launchCount: number;
  runCount: number;
  messageCount: number;
  artifactCount: number;
  uploadedFileCount: number;
  totalStorageBytes: number;
  totalTokens: number;
  lastActivityAt: string | null;
};

export type AdminTenantQuotaUsageSummary = {
  scope: 'group' | 'tenant' | 'user';
  scopeId: string;
  scopeLabel: string;
  monthlyLimit: number;
  actualUsed: number;
  remaining: number;
  utilizationPercent: number;
  isOverLimit: boolean;
};

export type AdminUsageResponse = {
  ok: true;
  data: {
    generatedAt: string;
    tenants: AdminTenantUsageSummary[];
    totals: AdminUsageTotals;
  };
};

export type AdminUsageExportFormat = 'csv' | 'json';

export type AdminUsageExportMetadata = {
  format: AdminUsageExportFormat;
  filename: string;
  exportedAt: string;
  tenantCount: number;
};

export type AdminUsageExportJsonBundle = {
  metadata: AdminUsageExportMetadata;
  generatedAt: string;
  tenants: AdminTenantUsageSummary[];
  totals: AdminUsageTotals;
};

export type AdminBillableAction =
  | 'launch'
  | 'completion'
  | 'retrieval'
  | 'storage'
  | 'export';

export type AdminBillingPlanStatus = 'active' | 'grace' | 'hard_stop';

export type AdminBillingFeatureFlag =
  | 'workflow_authoring'
  | 'provider_routing'
  | 'connector_sync'
  | 'artifact_exports'
  | 'policy_simulation';

export type AdminTenantBillingPlan = {
  id: string;
  tenantId: string;
  name: string;
  currency: 'USD';
  monthlyCreditLimit: number;
  softLimitPercent: number;
  hardStopEnabled: boolean;
  graceCreditBuffer: number;
  storageLimitBytes: number;
  monthlyExportLimit: number;
  featureFlags: AdminBillingFeatureFlag[];
  status: AdminBillingPlanStatus;
  updatedAt: string;
};

export type AdminBillingAdjustmentKind =
  | 'credit_grant'
  | 'temporary_limit_raise'
  | 'meter_correction';

export type AdminBillingAdjustment = {
  id: string;
  tenantId: string;
  kind: AdminBillingAdjustmentKind;
  creditDelta: number;
  expiresAt: string | null;
  reason: string | null;
  createdAt: string;
  createdByUserId: string | null;
};

export type AdminBillingActionSummary = {
  action: AdminBillableAction;
  quantity: number;
  unit: string;
  credits: number;
  estimatedUsd: number;
};

export type AdminBillingUsageRecord = {
  id: string;
  tenantId: string;
  action: AdminBillableAction;
  referenceType: 'aggregate' | 'launch' | 'run' | 'artifact' | 'admin_export';
  referenceId: string | null;
  quantity: number;
  unit: string;
  credits: number;
  estimatedUsd: number;
  occurredAt: string;
  maskedContext: Record<string, string | null>;
};

export type AdminBillingWarning = {
  code:
    | 'soft_limit_reached'
    | 'hard_limit_reached'
    | 'grace_active'
    | 'storage_limit_reached'
    | 'export_limit_reached';
  severity: 'warning' | 'critical';
  summary: string;
  detail: string | null;
};

export type AdminBillingBreakdownEntry = {
  scope: 'app' | 'group' | 'provider';
  key: string;
  label: string;
  credits: number;
  estimatedUsd: number;
  launchCount: number;
  runCount: number;
  retrievalCount: number;
  storageBytes: number;
  exportCount: number;
};

export type AdminBillingTenantSummary = {
  tenantId: string;
  tenantName: string;
  plan: AdminTenantBillingPlan;
  actualCreditsUsed: number;
  effectiveCreditLimit: number;
  remainingCredits: number;
  totalEstimatedUsd: number;
  storageBytesUsed: number;
  exportCount: number;
  actions: AdminBillingActionSummary[];
  adjustments: AdminBillingAdjustment[];
  recentRecords: AdminBillingUsageRecord[];
  warnings: AdminBillingWarning[];
  breakdowns: {
    apps: AdminBillingBreakdownEntry[];
    groups: AdminBillingBreakdownEntry[];
    providers: AdminBillingBreakdownEntry[];
  };
};

export type AdminBillingTotals = {
  tenantCount: number;
  recordCount: number;
  totalCredits: number;
  totalEstimatedUsd: number;
  hardStopTenantCount: number;
};

export type AdminBillingResponse = {
  ok: true;
  data: {
    generatedAt: string;
    tenants: AdminBillingTenantSummary[];
    totals: AdminBillingTotals;
  };
};

export type AdminBillingPlanUpdateRequest = {
  monthlyCreditLimit?: number;
  softLimitPercent?: number;
  hardStopEnabled?: boolean;
  graceCreditBuffer?: number;
  storageLimitBytes?: number;
  monthlyExportLimit?: number;
  featureFlags?: AdminBillingFeatureFlag[];
  name?: string;
};

export type AdminBillingPlanUpdateResponse = {
  ok: true;
  data: {
    tenantId: string;
    plan: AdminTenantBillingPlan;
  };
};

export type AdminBillingAdjustmentCreateRequest = {
  kind: AdminBillingAdjustmentKind;
  creditDelta: number;
  expiresAt?: string | null;
  reason?: string | null;
};

export type AdminBillingAdjustmentCreateResponse = {
  ok: true;
  data: {
    tenantId: string;
    adjustment: AdminBillingAdjustment;
    plan: AdminTenantBillingPlan;
  };
};

export type AdminBillingExportFormat = 'csv' | 'json';

export type AdminBillingExportMetadata = {
  format: AdminBillingExportFormat;
  filename: string;
  exportedAt: string;
  tenantCount: number;
};

export type AdminBillingExportJsonBundle = {
  metadata: AdminBillingExportMetadata;
  generatedAt: string;
  tenants: AdminBillingTenantSummary[];
  totals: AdminBillingTotals;
};

export type AdminAppGrantCreateRequest = {
  subjectUserEmail: string;
  effect: AdminAppGrantEffect;
  reason?: string | null;
};

export type AdminAppGrantCreateResponse = {
  ok: true;
  data: {
    app: AdminAppSummary;
    grant: AdminAppUserGrant;
  };
};

export type AdminAppGrantDeleteResponse = {
  ok: true;
  data: {
    app: AdminAppSummary;
    revokedGrantId: string;
  };
};

export type AdminAppToolUpdateInput = {
  name: string;
  enabled: boolean;
  execution?: ToolExecutionPolicy;
};

export type AdminAppToolUpdateRequest = {
  enabledToolNames?: string[];
  tools?: AdminAppToolUpdateInput[];
};

export type AdminAppToolUpdateResponse = {
  ok: true;
  data: {
    app: AdminAppSummary;
    enabledToolNames: string[];
  };
};

export type AdminAuditActionCount = {
  action: AuthAuditAction | string;
  count: number;
};

export type AdminAuditTenantCount = {
  tenantId: string;
  tenantName: string;
  count: number;
};

export type AdminAuditScope = 'tenant' | 'platform';
export type AdminAuditDatePreset = '24h' | '7d' | '30d' | '90d';

export type AdminAuditFilters = {
  scope?: AdminAuditScope | null;
  tenantId?: string | null;
  action?: string | null;
  level?: AuthAuditLevel | null;
  detectorType?: AdminAuditDetectorType | null;
  actorUserId?: string | null;
  entityType?: AuthAuditEntityType | null;
  traceId?: string | null;
  runId?: string | null;
  conversationId?: string | null;
  occurredAfter?: string | null;
  occurredBefore?: string | null;
  datePreset?: AdminAuditDatePreset | null;
  payloadMode?: AdminAuditPayloadMode | null;
  limit?: number | null;
};

export type AdminAuditEventContext = {
  traceId: string | null;
  runId: string | null;
  conversationId: string | null;
  appId: string | null;
  appName: string | null;
  activeGroupId: string | null;
  activeGroupName: string | null;
};

export type AdminAuditPayloadMode = 'masked' | 'raw';

export type AdminAuditDetectorType =
  | AdminPolicyDetectorType
  | 'prompt_injection'
  | 'data_exfiltration'
  | 'policy_violation';

export type AdminAuditPiiDetector = 'email' | 'phone' | 'secret' | 'token';

export type AdminAuditPiiRiskLevel = 'high' | 'moderate';

export type AdminAuditPiiMatch = {
  path: string;
  detector: AdminAuditPiiDetector;
  risk: AdminAuditPiiRiskLevel;
  valuePreview: string;
  maskedValue: string;
};

export type AdminAuditPayloadInspection = {
  mode: AdminAuditPayloadMode;
  containsSensitiveData: boolean;
  moderateMatchCount: number;
  highRiskMatchCount: number;
  matches: AdminAuditPiiMatch[];
};

export type AdminAuditEventSummary = AuthAuditEvent & {
  tenantName: string | null;
  context: AdminAuditEventContext;
  payloadInspection: AdminAuditPayloadInspection;
};

export type AdminAuditExportFormat = 'csv' | 'json';

export type AdminAuditExportMetadata = {
  format: AdminAuditExportFormat;
  filename: string;
  exportedAt: string;
  eventCount: number;
  appliedFilters: AdminAuditFilters;
};

export type AdminAuditExportJsonBundle = {
  metadata: AdminAuditExportMetadata;
  events: AdminAuditEventSummary[];
};

export type AdminAuditResponse = {
  ok: true;
  data: {
    generatedAt: string;
    capabilities: AdminViewerCapabilities;
    scope: AdminAuditScope;
    appliedFilters: AdminAuditFilters;
    countsByAction: AdminAuditActionCount[];
    countsByTenant: AdminAuditTenantCount[];
    highRiskEventCount: number;
    events: AdminAuditEventSummary[];
  };
};

export type AdminIdentityDomainClaimStatus = 'pending' | 'approved' | 'rejected';

export type AdminIdentityDomainClaim = {
  id: string;
  tenantId: string;
  tenantName: string | null;
  domain: string;
  providerId: string;
  status: AdminIdentityDomainClaimStatus;
  jitUserStatus: Extract<AuthUserStatus, 'active' | 'pending'>;
  requestedAt: string;
  requestedByUserId: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewReason: string | null;
};

export type AdminIdentityAccessRequestSource = 'manual' | 'sso_jit';

export type AdminIdentityAccessRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'transferred';

export type AdminIdentityAccessRequest = {
  id: string;
  tenantId: string;
  tenantName: string | null;
  userId: string | null;
  email: string;
  displayName: string | null;
  source: AdminIdentityAccessRequestSource;
  status: AdminIdentityAccessRequestStatus;
  requestedAt: string;
  requestedByUserId: string | null;
  domainClaimId: string | null;
  reason: string | null;
  targetTenantId: string | null;
  targetTenantName: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewReason: string | null;
};

export type AdminBreakGlassSessionStatus = 'active' | 'expired' | 'revoked';

export type AdminBreakGlassSession = {
  id: string;
  tenantId: string;
  tenantName: string | null;
  actorUserId: string;
  actorUserEmail: string | null;
  reason: string;
  justification: string | null;
  createdAt: string;
  expiresAt: string;
  status: AdminBreakGlassSessionStatus;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewNotes: string | null;
};

export type AdminPolicyPackRuntimeMode = 'standard' | 'strict' | 'degraded';
export type AdminPolicyPackSharingMode = 'read_only' | 'commenter' | 'editor';
export type AdminPolicyPackArtifactDownloadMode = 'shared_readers' | 'owner_only';
export type AdminPolicyPackExportMode = 'allowed' | 'approval_required' | 'blocked';
export type AdminPolicyPackRetentionMode = 'standard' | 'strict' | 'legal_hold';
export type AdminPolicyPackRetrievalMode = 'allowed' | 'flagged' | 'blocked';
export type AdminPolicyPackExceptionScope = 'tenant' | 'group' | 'app' | 'runtime';
export type AdminPolicyPackSimulationScope =
  | 'chat'
  | 'retrieval'
  | 'sharing'
  | 'artifact_download'
  | 'export';

export type AdminTenantGovernanceScimPlanning = {
  enabled: boolean;
  ownerEmail: string | null;
  notes: string | null;
};

export type AdminTenantGovernancePolicyPack = {
  runtimeMode: AdminPolicyPackRuntimeMode;
  retrievalMode: AdminPolicyPackRetrievalMode;
  sharingMode: AdminPolicyPackSharingMode;
  artifactDownloadMode: AdminPolicyPackArtifactDownloadMode;
  exportMode: AdminPolicyPackExportMode;
  retentionMode: AdminPolicyPackRetentionMode;
};

export type AdminPolicyDetectorType =
  | 'secret'
  | 'pii'
  | 'regulated_term'
  | 'exfiltration_pattern';

export type AdminPolicyDetectorMatch = {
  detector: AdminPolicyDetectorType;
  label: string;
  severity: 'warning' | 'critical';
  valuePreview: string;
};

export type AdminPolicyEvaluationTrace = {
  id: string;
  tenantId: string;
  scope: AdminPolicyPackSimulationScope;
  outcome: 'allowed' | 'flagged' | 'blocked';
  reasons: string[];
  detectorMatches: AdminPolicyDetectorMatch[];
  exceptionIds: string[];
  occurredAt: string;
};

export type AdminPolicyException = {
  id: string;
  tenantId: string;
  scope: AdminPolicyPackExceptionScope;
  scopeId: string | null;
  detector: AdminPolicyDetectorType;
  label: string;
  expiresAt: string | null;
  createdAt: string;
  createdByUserId: string | null;
  reviewHistory: Array<{
    occurredAt: string;
    actorUserId: string | null;
    note: string | null;
  }>;
};

export type AdminPolicyOverviewResponse = {
  ok: true;
  data: {
    generatedAt: string;
    governance: AdminTenantGovernanceSettings | null;
    exceptions: AdminPolicyException[];
    recentEvaluations: AdminPolicyEvaluationTrace[];
  };
};

export type AdminPolicySimulationRequest = {
  tenantId?: string | null;
  scope: AdminPolicyPackSimulationScope;
  content: string;
  groupId?: string | null;
  appId?: string | null;
  runtimeId?: string | null;
};

export type AdminPolicySimulationResponse = {
  ok: true;
  data: {
    evaluation: AdminPolicyEvaluationTrace;
  };
};

export type AdminPolicyExceptionCreateRequest = {
  tenantId?: string | null;
  scope: AdminPolicyPackExceptionScope;
  scopeId?: string | null;
  detector: AdminPolicyDetectorType;
  label: string;
  expiresAt?: string | null;
  note?: string | null;
};

export type AdminPolicyExceptionCreateResponse = {
  ok: true;
  data: {
    exception: AdminPolicyException;
  };
};

export type AdminPolicyExceptionReviewRequest = {
  note?: string | null;
  expiresAt?: string | null;
};

export type AdminPolicyExceptionReviewResponse = {
  ok: true;
  data: {
    exception: AdminPolicyException;
  };
};

export type AdminObservabilityRouteSummary = {
  method: string;
  route: string;
  statusCode: number;
  count: number;
  avgDurationMs: number;
  maxDurationMs: number;
};

export type AdminObservabilitySli = {
  key: 'auth_latency' | 'launch_latency' | 'chat_latency' | 'run_success_rate';
  label: string;
  target: string;
  observed: string;
  status: 'healthy' | 'warning' | 'critical';
};

export type AdminObservabilityAlert = {
  id: string;
  severity: 'warning' | 'critical';
  summary: string;
  detail: string | null;
  runbookHref: string | null;
};

export type AdminIncidentTimelineEntry = {
  id: string;
  traceId: string | null;
  runId: string | null;
  source: 'audit' | 'runtime' | 'annotation';
  summary: string;
  occurredAt: string;
};

export type AdminObservabilityAnnotation = {
  id: string;
  tenantId: string | null;
  traceId: string | null;
  runId: string | null;
  note: string;
  createdAt: string;
  createdByUserId: string | null;
};

export type AdminObservabilityResponse = {
  ok: true;
  data: {
    generatedAt: string;
    sli: AdminObservabilitySli[];
    routes: AdminObservabilityRouteSummary[];
    alerts: AdminObservabilityAlert[];
    incidentTimeline: AdminIncidentTimelineEntry[];
    annotations: AdminObservabilityAnnotation[];
  };
};

export type AdminObservabilityAnnotationCreateRequest = {
  tenantId?: string | null;
  traceId?: string | null;
  runId?: string | null;
  note: string;
};

export type AdminObservabilityAnnotationCreateResponse = {
  ok: true;
  data: {
    annotation: AdminObservabilityAnnotation;
  };
};

export type AdminTenantGovernanceSettings = {
  tenantId: string;
  legalHoldEnabled: boolean;
  retentionOverrideDays: number | null;
  scimPlanning: AdminTenantGovernanceScimPlanning;
  policyPack: AdminTenantGovernancePolicyPack;
};

export type AdminIdentityOverviewResponse = {
  ok: true;
  data: {
    generatedAt: string;
    capabilities: AdminViewerCapabilities;
    tenant: AdminTenantSummary | null;
    domainClaims: AdminIdentityDomainClaim[];
    pendingAccessRequests: AdminIdentityAccessRequest[];
    breakGlassSessions: AdminBreakGlassSession[];
    governance: AdminTenantGovernanceSettings | null;
  };
};

export type AdminDomainClaimCreateRequest = {
  tenantId?: string | null;
  domain: string;
  providerId: string;
  jitUserStatus?: Extract<AuthUserStatus, 'active' | 'pending'>;
};

export type AdminDomainClaimCreateResponse = {
  ok: true;
  data: {
    claim: AdminIdentityDomainClaim;
  };
};

export type AdminDomainClaimReviewRequest = {
  status: Extract<AdminIdentityDomainClaimStatus, 'approved' | 'rejected'>;
  reviewReason?: string | null;
};

export type AdminDomainClaimReviewResponse = {
  ok: true;
  data: {
    claim: AdminIdentityDomainClaim;
  };
};

export type AdminAccessRequestReviewDecision = 'approved' | 'rejected' | 'transferred';

export type AdminAccessRequestReviewRequest = {
  decision: AdminAccessRequestReviewDecision;
  reviewReason?: string | null;
  targetTenantId?: string | null;
};

export type AdminAccessRequestReviewResponse = {
  ok: true;
  data: {
    request: AdminIdentityAccessRequest;
  };
};

export type AdminUserMfaResetRequest = {
  reason?: string | null;
};

export type AdminUserMfaResetResponse = {
  ok: true;
  data: {
    userId: string;
    reset: true;
    reason: string | null;
  };
};

export type AdminBreakGlassCreateRequest = {
  tenantId?: string | null;
  reason: string;
  justification?: string | null;
  expiresInMinutes?: number | null;
};

export type AdminBreakGlassCreateResponse = {
  ok: true;
  data: {
    session: AdminBreakGlassSession;
  };
};

export type AdminBreakGlassUpdateRequest = {
  status: Extract<AdminBreakGlassSessionStatus, 'revoked'>;
  reviewNotes?: string | null;
};

export type AdminBreakGlassUpdateResponse = {
  ok: true;
  data: {
    session: AdminBreakGlassSession;
  };
};

export type AdminTenantGovernanceUpdateRequest = {
  tenantId?: string | null;
  legalHoldEnabled?: boolean;
  retentionOverrideDays?: number | null;
  scimPlanning?: Partial<AdminTenantGovernanceScimPlanning>;
  policyPack?: Partial<AdminTenantGovernancePolicyPack>;
};

export type AdminTenantGovernanceUpdateResponse = {
  ok: true;
  data: {
    governance: AdminTenantGovernanceSettings;
  };
};
