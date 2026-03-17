import type { AuthAuditEvent, AuthUser } from '@agentifui/shared/auth';
import type {
  AdminAppGrantCreateRequest,
  AdminAuditDatePreset,
  AdminCleanupLastRun,
  AdminCleanupPolicy,
  AdminCleanupPreview,
  AdminTenantQuotaUsageSummary,
  AdminTenantUsageAppSummary,
  AdminUsageTotals,
  AdminTenantUsageSummary,
  AdminAppSummary,
  AdminAppUserGrant,
  AdminAuditActionCount,
  AdminAuditEventSummary,
  AdminAuditFilters,
  AdminAuditPayloadMode,
  AdminAuditTenantCount,
  AdminTenantBootstrapInvitation,
  AdminTenantSummary,
  AdminErrorCode,
  AdminGroupSummary,
  AdminIdentityAccessRequest,
  AdminIdentityAccessRequestStatus,
  AdminIdentityDomainClaim,
  AdminIdentityDomainClaimStatus,
  AdminBreakGlassSession,
  AdminBreakGlassSessionStatus,
  AdminTenantGovernanceSettings,
  AdminTenantGovernanceUpdateRequest,
  AdminUserSummary,
} from '@agentifui/shared/admin';
import { randomUUID } from 'node:crypto';

import { inspectAdminAuditPayload } from './admin-audit-pii.js';
import {
  WORKSPACE_APPS,
  WORKSPACE_GROUPS,
  resolveDefaultMemberGroupIds,
  resolveDefaultRoleIds,
} from './workspace-catalog-fixtures.js';
import { buildWorkspaceCleanupPolicy } from './workspace-cleanup.js';
import { buildDefaultQuotaLimitRecords } from './workspace-quota.js';

type AdminMutationErrorResult = {
  ok: false;
  statusCode: 400 | 404 | 409;
  code: Extract<AdminErrorCode, 'ADMIN_INVALID_PAYLOAD' | 'ADMIN_NOT_FOUND' | 'ADMIN_CONFLICT'>;
  message: string;
  details?: unknown;
};

type AdminMutationResult<TData> =
  | {
      ok: true;
      data: TData;
    }
  | AdminMutationErrorResult;

type CreateAppGrantInput = {
  appId: string;
  subjectUserEmail: string;
  effect: AdminAppGrantCreateRequest['effect'];
  reason?: string | null;
};

type RevokeAppGrantInput = {
  appId: string;
  grantId: string;
};

type CreateTenantInput = {
  name: string;
  slug: string;
  adminEmail: string;
  adminDisplayName?: string | null;
};

type UpdateTenantStatusInput = {
  tenantId: string;
  status: AdminTenantSummary['status'];
  reason?: string | null;
};

type IdentityOverviewInput = {
  tenantId?: string | null;
};

type CreateDomainClaimInput = {
  tenantId?: string | null;
  domain: string;
  providerId: string;
  jitUserStatus: Extract<AdminIdentityDomainClaim['jitUserStatus'], 'active' | 'pending'>;
};

type ReviewDomainClaimInput = {
  claimId: string;
  status: Extract<AdminIdentityDomainClaimStatus, 'approved' | 'rejected'>;
  reviewReason?: string | null;
};

type ReviewAccessRequestInput = {
  requestId: string;
  decision: 'approved' | 'rejected' | 'transferred';
  reviewReason?: string | null;
  targetTenantId?: string | null;
};

type ResetUserMfaInput = {
  userId: string;
  reason?: string | null;
};

type CreateBreakGlassInput = {
  tenantId?: string | null;
  reason: string;
  justification?: string | null;
  expiresInMinutes?: number | null;
};

type UpdateBreakGlassInput = {
  sessionId: string;
  status: Extract<AdminBreakGlassSessionStatus, 'revoked'>;
  reviewNotes?: string | null;
};

type UpdateTenantGovernanceInput = AdminTenantGovernanceUpdateRequest;

type CapturePendingAccessRequestInput = {
  tenantId: string;
  tenantName?: string | null;
  userId: string | null;
  email: string;
  displayName?: string | null;
  source: AdminIdentityAccessRequest['source'];
  domainClaimId?: string | null;
  reason?: string | null;
};

type ResolvedSsoProvider = {
  providerId: string;
  tenantId: string;
  claimId: string | null;
  jitUserStatus: Extract<AdminIdentityDomainClaim['jitUserStatus'], 'active' | 'pending'>;
};

type AdminService = {
  canReadAdminForUser(user: AuthUser): boolean | Promise<boolean>;
  canReadPlatformAdminForUser(user: AuthUser): boolean | Promise<boolean>;
  listTenantsForUser(user: AuthUser): AdminTenantSummary[] | Promise<AdminTenantSummary[]>;
  createTenantForUser(
    user: AuthUser,
    input: CreateTenantInput
  ): Promise<
    AdminMutationResult<{
      tenant: AdminTenantSummary;
      bootstrapInvitation: AdminTenantBootstrapInvitation;
    }>
  > | AdminMutationResult<{
    tenant: AdminTenantSummary;
    bootstrapInvitation: AdminTenantBootstrapInvitation;
  }>;
  updateTenantStatusForUser(
    user: AuthUser,
    input: UpdateTenantStatusInput
  ): Promise<
    AdminMutationResult<{
      tenant: AdminTenantSummary;
      previousStatus: AdminTenantSummary['status'];
      reason: string | null;
    }>
  > | AdminMutationResult<{
    tenant: AdminTenantSummary;
    previousStatus: AdminTenantSummary['status'];
    reason: string | null;
  }>;
  listUsersForUser(
    user: AuthUser,
    input?: {
      tenantId?: string;
    }
  ): AdminUserSummary[] | Promise<AdminUserSummary[]>;
  listGroupsForUser(user: AuthUser): AdminGroupSummary[] | Promise<AdminGroupSummary[]>;
  listAppsForUser(user: AuthUser): AdminAppSummary[] | Promise<AdminAppSummary[]>;
  getCleanupStatusForUser(
    user: AuthUser
  ): Promise<{
    policy: AdminCleanupPolicy;
    preview: AdminCleanupPreview;
    lastRun: AdminCleanupLastRun | null;
  }> | {
    policy: AdminCleanupPolicy;
    preview: AdminCleanupPreview;
    lastRun: AdminCleanupLastRun | null;
  };
  listUsageForUser(
    user: AuthUser
  ): Promise<{
    tenants: AdminTenantUsageSummary[];
    totals: AdminUsageTotals;
  }> | {
    tenants: AdminTenantUsageSummary[];
    totals: AdminUsageTotals;
  };
  createAppGrantForUser(
    user: AuthUser,
    input: CreateAppGrantInput
  ): Promise<
    AdminMutationResult<{
      app: AdminAppSummary;
      grant: AdminAppUserGrant;
    }>
  > | AdminMutationResult<{
    app: AdminAppSummary;
    grant: AdminAppUserGrant;
  }>;
  revokeAppGrantForUser(
    user: AuthUser,
    input: RevokeAppGrantInput
  ): Promise<
    AdminMutationResult<{
      app: AdminAppSummary;
      revokedGrantId: string;
      revokedGrant: AdminAppUserGrant;
    }>
  > | AdminMutationResult<{
    app: AdminAppSummary;
    revokedGrantId: string;
    revokedGrant: AdminAppUserGrant;
  }>;
  listAuditForUser(
    user: AuthUser,
    filters?: AdminAuditFilters
  ): Promise<{
    countsByAction: AdminAuditActionCount[];
    countsByTenant: AdminAuditTenantCount[];
    highRiskEventCount: number;
    events: AdminAuditEventSummary[];
  }> | {
    countsByAction: AdminAuditActionCount[];
    countsByTenant: AdminAuditTenantCount[];
    highRiskEventCount: number;
    events: AdminAuditEventSummary[];
  };
  getIdentityOverviewForUser(
    user: AuthUser,
    input?: IdentityOverviewInput
  ): Promise<{
    tenant: AdminTenantSummary | null;
    domainClaims: AdminIdentityDomainClaim[];
    pendingAccessRequests: AdminIdentityAccessRequest[];
    breakGlassSessions: AdminBreakGlassSession[];
    governance: AdminTenantGovernanceSettings | null;
  }> | {
    tenant: AdminTenantSummary | null;
    domainClaims: AdminIdentityDomainClaim[];
    pendingAccessRequests: AdminIdentityAccessRequest[];
    breakGlassSessions: AdminBreakGlassSession[];
    governance: AdminTenantGovernanceSettings | null;
  };
  createDomainClaimForUser(
    user: AuthUser,
    input: CreateDomainClaimInput
  ): Promise<AdminMutationResult<{ claim: AdminIdentityDomainClaim }>> | AdminMutationResult<{
    claim: AdminIdentityDomainClaim;
  }>;
  reviewDomainClaimForUser(
    user: AuthUser,
    input: ReviewDomainClaimInput
  ): Promise<AdminMutationResult<{ claim: AdminIdentityDomainClaim }>> | AdminMutationResult<{
    claim: AdminIdentityDomainClaim;
  }>;
  reviewAccessRequestForUser(
    user: AuthUser,
    input: ReviewAccessRequestInput
  ): Promise<AdminMutationResult<{ request: AdminIdentityAccessRequest }>> | AdminMutationResult<{
    request: AdminIdentityAccessRequest;
  }>;
  resetUserMfaForUser(
    user: AuthUser,
    input: ResetUserMfaInput
  ): Promise<AdminMutationResult<{ userId: string; reset: true; reason: string | null }>> |
    AdminMutationResult<{ userId: string; reset: true; reason: string | null }>;
  createBreakGlassSessionForUser(
    user: AuthUser,
    input: CreateBreakGlassInput
  ): Promise<AdminMutationResult<{ session: AdminBreakGlassSession }>> | AdminMutationResult<{
    session: AdminBreakGlassSession;
  }>;
  updateBreakGlassSessionForUser(
    user: AuthUser,
    input: UpdateBreakGlassInput
  ): Promise<AdminMutationResult<{ session: AdminBreakGlassSession }>> | AdminMutationResult<{
    session: AdminBreakGlassSession;
  }>;
  updateTenantGovernanceForUser(
    user: AuthUser,
    input: UpdateTenantGovernanceInput
  ): Promise<AdminMutationResult<{ governance: AdminTenantGovernanceSettings }>> |
    AdminMutationResult<{ governance: AdminTenantGovernanceSettings }>;
  resolveSsoProviderForEmail(
    email: string
  ): Promise<ResolvedSsoProvider | null> | ResolvedSsoProvider | null;
  capturePendingAccessRequest(
    input: CapturePendingAccessRequestInput
  ): Promise<AdminIdentityAccessRequest> | AdminIdentityAccessRequest;
};

type InMemoryAppGrant = AdminAppUserGrant & {
  appId: string;
};

type InMemoryDomainClaim = AdminIdentityDomainClaim;
type InMemoryAccessRequest = AdminIdentityAccessRequest;
type InMemoryBreakGlassSession = AdminBreakGlassSession;

function toGroupMemberships(email: string) {
  const groupIds = resolveDefaultMemberGroupIds(email);

  return groupIds.flatMap((groupId, index) => {
    const group = WORKSPACE_GROUPS.find(candidate => candidate.id === groupId);

    if (!group) {
      return [];
    }

    return [
      {
        groupId: group.id,
        groupName: group.name,
        role: index === 0 ? ('manager' as const) : ('member' as const),
        isPrimary: index === 0,
      },
    ];
  });
}

function canReadAdmin(email: string) {
  const roleIds = resolveDefaultRoleIds(email);

  return roleIds.includes('tenant_admin') || roleIds.includes('root_admin');
}

function canReadPlatformAdmin(email: string) {
  return resolveDefaultRoleIds(email).includes('root_admin');
}

function formatTenantName(tenantId: string) {
  return tenantId
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function normalizeTenantSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildTenantIdFromSlug(slug: string) {
  return `tenant-${slug}`;
}

function buildInMemoryAuditEvent(
  input: Pick<AuthAuditEvent, 'action' | 'entityId' | 'entityType' | 'payload'> & {
    actorUserId: string | null;
    id?: string;
    level?: AuthAuditEvent['level'];
    occurredAtOffsetMs?: number;
    tenantName?: string | null;
    tenantId: string;
  }
): AdminAuditEventSummary {
  return buildInMemoryAuditEventWithMode(input, 'masked');
}

function buildInMemoryAuditEventWithMode(
  input: Pick<AuthAuditEvent, 'action' | 'entityId' | 'entityType' | 'payload'> & {
    actorUserId: string | null;
    id?: string;
    level?: AuthAuditEvent['level'];
    occurredAtOffsetMs?: number;
    tenantName?: string | null;
    tenantId: string;
  },
  payloadMode: AdminAuditPayloadMode
): AdminAuditEventSummary {
  const payloadResult = inspectAdminAuditPayload(input.payload, payloadMode);
  const payload = payloadResult.payload;

  return {
    id: input.id ?? randomUUID(),
    tenantId: input.tenantId,
    tenantName: input.tenantName ?? formatTenantName(input.tenantId),
    actorUserId: input.actorUserId,
    action: input.action,
    level: input.level ?? 'info',
    entityType: input.entityType,
    entityId: input.entityId,
    ipAddress: '127.0.0.1',
    payload,
    occurredAt: new Date(Date.now() - (input.occurredAtOffsetMs ?? 0)).toISOString(),
    context: {
      traceId: typeof payload.traceId === 'string' ? payload.traceId : null,
      runId: typeof payload.runId === 'string' ? payload.runId : null,
      conversationId: typeof payload.conversationId === 'string' ? payload.conversationId : null,
      appId: typeof payload.appId === 'string' ? payload.appId : null,
      appName: typeof payload.appName === 'string' ? payload.appName : null,
      activeGroupId: typeof payload.activeGroupId === 'string' ? payload.activeGroupId : null,
      activeGroupName:
        typeof payload.activeGroupName === 'string' ? payload.activeGroupName : null,
    },
    payloadInspection: payloadResult.inspection,
  };
}

function buildEmptyUsageTotals(): AdminUsageTotals {
  return {
    launchCount: 0,
    runCount: 0,
    succeededRunCount: 0,
    failedRunCount: 0,
    stoppedRunCount: 0,
    messageCount: 0,
    artifactCount: 0,
    uploadedFileCount: 0,
    uploadedBytes: 0,
    artifactBytes: 0,
    totalStorageBytes: 0,
    totalTokens: 0,
    lastActivityAt: null,
  };
}

function buildInMemoryUsers(user: AuthUser, tenantId = user.tenantId): AdminUserSummary[] {
  const adminRoleIds = resolveDefaultRoleIds(user.email);

  const entries: AdminUserSummary[] = [
    {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      mfaEnabled: true,
      roleIds: adminRoleIds,
      groupMemberships: toGroupMemberships(user.email),
    },
    {
      id: 'usr_pending_reviewer',
      email: 'pending-review@example.net',
      displayName: 'Pending Reviewer',
      status: 'pending',
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      lastLoginAt: null,
      mfaEnabled: false,
      roleIds: ['user'],
      groupMemberships: [],
    },
    {
      id: 'usr_security_audit',
      email: 'security-audit@example.net',
      displayName: 'Security Audit',
      status: 'active',
      createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      lastLoginAt: new Date(Date.now() - 3_600_000).toISOString(),
      mfaEnabled: true,
      roleIds: ['user'],
      groupMemberships: toGroupMemberships('security-audit@example.net'),
    },
  ];

  return entries.map(entry => ({
    ...entry,
    id:
      tenantId === user.tenantId
        ? entry.id
        : `${entry.id}_${tenantId.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
  }));
}

function buildInMemoryTenants(user: AuthUser): AdminTenantSummary[] {
  const users = buildInMemoryUsers(user);
  const primaryAdmin = canReadAdmin(user.email)
    ? {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      }
    : null;

  return [
    {
      id: user.tenantId,
      slug: user.tenantId.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: formatTenantName(user.tenantId),
      status: 'active',
      createdAt: user.createdAt,
      updatedAt: user.lastLoginAt ?? user.createdAt,
      userCount: users.length,
      groupCount: WORKSPACE_GROUPS.length,
      appCount: WORKSPACE_APPS.length,
      adminCount: primaryAdmin ? 1 : 0,
      primaryAdmin,
    },
  ];
}

function buildDefaultGovernance(tenantId: string): AdminTenantGovernanceSettings {
  return {
    tenantId,
    legalHoldEnabled: false,
    retentionOverrideDays: null,
    scimPlanning: {
      enabled: false,
      ownerEmail: null,
      notes: null,
    },
    policyPack: {
      runtimeMode: 'standard',
      sharingMode: 'editor',
      artifactDownloadMode: 'shared_readers',
    },
  };
}

function mergeGovernanceSettings(
  currentValue: AdminTenantGovernanceSettings,
  input: UpdateTenantGovernanceInput
): AdminTenantGovernanceSettings {
  return {
    ...currentValue,
    legalHoldEnabled: input.legalHoldEnabled ?? currentValue.legalHoldEnabled,
    retentionOverrideDays:
      input.retentionOverrideDays === undefined
        ? currentValue.retentionOverrideDays
        : input.retentionOverrideDays,
    scimPlanning: {
      ...currentValue.scimPlanning,
      ...(input.scimPlanning ?? {}),
    },
    policyPack: {
      ...currentValue.policyPack,
      ...(input.policyPack ?? {}),
    },
  };
}

function resolveAuditPresetWindow(
  preset: AdminAuditDatePreset | null | undefined
): { occurredAfter: string | null; occurredBefore: string | null } {
  if (!preset) {
    return {
      occurredAfter: null,
      occurredBefore: null,
    };
  }

  const now = Date.now();
  const durationMsByPreset: Record<AdminAuditDatePreset, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };

  return {
    occurredAfter: new Date(now - durationMsByPreset[preset]).toISOString(),
    occurredBefore: new Date(now).toISOString(),
  };
}

function buildAppSummary(
  appId: string,
  grants: InMemoryAppGrant[]
): AdminAppSummary | null {
  const app = WORKSPACE_APPS.find(candidate => candidate.id === appId);

  if (!app) {
    return null;
  }

  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    summary: app.summary,
    kind: app.kind,
    status: app.status,
    shortCode: app.shortCode,
    launchCost: app.launchCost,
    grantedGroups: app.grantedGroupIds.flatMap(groupId => {
      const group = WORKSPACE_GROUPS.find(candidate => candidate.id === groupId);

      return group ? [{ id: group.id, name: group.name }] : [];
    }),
    grantedRoleIds: app.grantedRoleIds,
    directUserGrantCount: grants.filter(grant => grant.effect === 'allow').length,
    denyGrantCount: grants.filter(grant => grant.effect === 'deny').length,
    launchCount: app.id === 'app_policy_watch' ? 4 : 0,
    lastLaunchedAt: app.id === 'app_policy_watch' ? new Date(Date.now() - 15 * 60_000).toISOString() : null,
    tools: [],
    enabledToolCount: 0,
    toolOverrideCount: 0,
    userGrants: grants
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(({ appId: _, ...grant }) => grant),
  };
}

function normalizeAuditFilters(filters: AdminAuditFilters = {}): AdminAuditFilters {
  const presetWindow =
    (!filters.occurredAfter || !filters.occurredBefore) && filters.datePreset
      ? resolveAuditPresetWindow(filters.datePreset)
      : {
          occurredAfter: null,
          occurredBefore: null,
        };

  return {
    scope: filters.scope ?? 'tenant',
    tenantId: filters.tenantId?.trim() || null,
    action: filters.action?.trim() || null,
    level: filters.level ?? null,
    actorUserId: filters.actorUserId?.trim() || null,
    entityType: filters.entityType ?? null,
    traceId: filters.traceId?.trim() || null,
    runId: filters.runId?.trim() || null,
    conversationId: filters.conversationId?.trim() || null,
    occurredAfter: filters.occurredAfter?.trim() || presetWindow.occurredAfter,
    occurredBefore: filters.occurredBefore?.trim() || presetWindow.occurredBefore,
    datePreset: filters.datePreset ?? null,
    payloadMode: filters.payloadMode ?? 'masked',
    limit: filters.limit ?? null,
  };
}

function matchesAuditFilters(event: AdminAuditEventSummary, filters: AdminAuditFilters) {
  if (filters.tenantId && event.tenantId !== filters.tenantId) {
    return false;
  }

  if (filters.action && event.action !== filters.action) {
    return false;
  }

  if (filters.level && event.level !== filters.level) {
    return false;
  }

  if (filters.actorUserId && event.actorUserId !== filters.actorUserId) {
    return false;
  }

  if (filters.entityType && event.entityType !== filters.entityType) {
    return false;
  }

  if (filters.traceId && event.context.traceId !== filters.traceId) {
    return false;
  }

  if (filters.runId && event.context.runId !== filters.runId) {
    return false;
  }

  if (filters.conversationId && event.context.conversationId !== filters.conversationId) {
    return false;
  }

  if (filters.occurredAfter && event.occurredAt < filters.occurredAfter) {
    return false;
  }

  if (filters.occurredBefore && event.occurredAt > filters.occurredBefore) {
    return false;
  }

  return true;
}

function isHighRiskAuditEvent(event: AdminAuditEventSummary) {
  return event.level === 'critical' || event.payloadInspection.highRiskMatchCount > 0;
}

function buildAuditQueryResult(events: AdminAuditEventSummary[], filters: AdminAuditFilters) {
  const limit =
    typeof filters.limit === 'number' && filters.limit > 0 ? filters.limit : events.length;
  const countsByAction = [...events].reduce<AdminAuditActionCount[]>((counts, event) => {
    const currentCount = counts.find(count => count.action === event.action);

    if (currentCount) {
      currentCount.count += 1;
      return counts;
    }

    counts.push({
      action: event.action,
      count: 1,
    });

    return counts;
  }, []);
  const countsByTenant = [...events].reduce<AdminAuditTenantCount[]>((counts, event) => {
    const tenantId = event.tenantId ?? 'tenant-unknown';
    const tenantName = event.tenantName ?? event.tenantId ?? 'Unknown tenant';
    const currentCount = counts.find(count => count.tenantId === tenantId);

    if (currentCount) {
      currentCount.count += 1;
      return counts;
    }

    counts.push({
      tenantId,
      tenantName,
      count: 1,
    });

    return counts;
  }, []);

  return {
    countsByAction,
    countsByTenant: countsByTenant.sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.tenantName.localeCompare(right.tenantName);
    }),
    highRiskEventCount: events.filter(isHighRiskAuditEvent).length,
    events: events.slice(0, limit),
  };
}

export function createAdminService(): AdminService {
  const memoryGrants: InMemoryAppGrant[] = [];
  const memoryTenants = new Map<string, AdminTenantSummary>();
  const memoryGovernance = new Map<string, AdminTenantGovernanceSettings>();
  const memoryDomainClaims: InMemoryDomainClaim[] = [];
  const memoryAccessRequests: InMemoryAccessRequest[] = [];
  const memoryBreakGlassSessions: InMemoryBreakGlassSession[] = [];

  function resolveKnownTenants(user: AuthUser) {
    const tenants = new Map(buildInMemoryTenants(user).map(tenant => [tenant.id, tenant]));

    for (const tenant of memoryTenants.values()) {
      tenants.set(tenant.id, tenant);
    }

    return [...tenants.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  function getTenantSummaryForUser(user: AuthUser, tenantId: string) {
    return resolveKnownTenants(user).find(tenant => tenant.id === tenantId) ?? null;
  }

  function getGovernance(tenantId: string) {
    const currentValue = memoryGovernance.get(tenantId) ?? buildDefaultGovernance(tenantId);
    memoryGovernance.set(tenantId, currentValue);
    return currentValue;
  }

  return {
    canReadAdminForUser(user) {
      return canReadAdmin(user.email);
    },
    canReadPlatformAdminForUser(user) {
      return canReadPlatformAdmin(user.email);
    },
    listTenantsForUser(user) {
      return resolveKnownTenants(user);
    },
    createTenantForUser(user, input) {
      const slug = normalizeTenantSlug(input.slug);
      const name = input.name.trim();
      const adminEmail = input.adminEmail.trim().toLowerCase();

      if (!slug || !name || !adminEmail) {
        return {
          ok: false,
          statusCode: 400,
          code: 'ADMIN_INVALID_PAYLOAD',
          message: 'Tenant creation requires a tenant name, slug and bootstrap admin email.',
        };
      }

      const tenantId = buildTenantIdFromSlug(slug);

      if (memoryTenants.has(tenantId)) {
        return {
          ok: false,
          statusCode: 409,
          code: 'ADMIN_CONFLICT',
          message: 'A tenant with this slug already exists.',
          details: {
            slug,
            tenantId,
          },
        };
      }

      const createdAt = new Date().toISOString();
      const invitedUserId = `user_${randomUUID()}`;
      const inviteToken = randomUUID();
      const invitationId = `invite_${randomUUID()}`;
      const tenant: AdminTenantSummary = {
        id: tenantId,
        slug,
        name,
        status: 'active',
        createdAt,
        updatedAt: createdAt,
        userCount: 1,
        groupCount: WORKSPACE_GROUPS.length,
        appCount: WORKSPACE_APPS.length,
        adminCount: 1,
        primaryAdmin: {
          id: invitedUserId,
          email: adminEmail,
          displayName: input.adminDisplayName?.trim() || adminEmail.split('@')[0] || 'Tenant Admin',
        },
      };

      memoryTenants.set(tenant.id, tenant);

      return {
        ok: true,
        data: {
          tenant,
          bootstrapInvitation: {
            invitationId,
            invitedUserId,
            email: adminEmail,
            inviteToken,
            inviteUrl: `/invite/accept?token=${inviteToken}`,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
      };
    },
    updateTenantStatusForUser(user, input) {
      const tenantId = input.tenantId.trim();
      const existingTenant =
        memoryTenants.get(tenantId) ?? buildInMemoryTenants(user).find(tenant => tenant.id === tenantId);

      if (!existingTenant) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The target tenant could not be found.',
          details: {
            tenantId,
          },
        };
      }

      if (tenantId === user.tenantId && input.status === 'suspended') {
        return {
          ok: false,
          statusCode: 409,
          code: 'ADMIN_CONFLICT',
          message: 'Root admins cannot suspend their current tenant while using it.',
          details: {
            tenantId,
          },
        };
      }

      if (existingTenant.status === input.status) {
        return {
          ok: false,
          statusCode: 409,
          code: 'ADMIN_CONFLICT',
          message: `The tenant is already ${input.status}.`,
          details: {
            tenantId,
            status: input.status,
          },
        };
      }

      const updatedTenant: AdminTenantSummary = {
        ...existingTenant,
        status: input.status,
        updatedAt: new Date().toISOString(),
      };

      memoryTenants.set(updatedTenant.id, updatedTenant);

      return {
        ok: true,
        data: {
          tenant: updatedTenant,
          previousStatus: existingTenant.status,
          reason: input.reason?.trim() || null,
        },
      };
    },
    listUsersForUser(user, input) {
      return buildInMemoryUsers(user, input?.tenantId?.trim() || user.tenantId);
    },
    listGroupsForUser() {
      return WORKSPACE_GROUPS.map(group => {
        const appGrants = WORKSPACE_APPS.filter(app => app.grantedGroupIds.includes(group.id)).map(app => ({
          id: app.id,
          slug: app.slug,
          name: app.name,
          shortCode: app.shortCode,
          status: app.status,
        }));

        return {
          ...group,
          memberCount: group.id === 'grp_security' ? 1 : 2,
          managerCount: 1,
          primaryMemberCount: 1,
          appGrants,
        };
      });
    },
    listAppsForUser() {
      return WORKSPACE_APPS.map(app => buildAppSummary(
        app.id,
        memoryGrants.filter(grant => grant.appId === app.id)
      )!).filter((app): app is AdminAppSummary => Boolean(app));
    },
    getCleanupStatusForUser() {
      const policy = buildWorkspaceCleanupPolicy();
      const now = new Date().toISOString();

      return {
        policy,
        preview: {
          archivedConversations: 0,
          expiredShares: 0,
          orphanedArtifacts: 0,
          coldTimelineEvents: 0,
          staleKnowledgeSources: 0,
          totalCandidates: 0,
          cutoffs: {
            archivedConversationBefore: now,
            shareCreatedBefore: now,
            timelineCreatedBefore: now,
            staleKnowledgeSourceBefore: now,
          },
        },
        lastRun: null,
      };
    },
    listUsageForUser(user) {
      const totals = buildEmptyUsageTotals();
      const memberGroupIds = resolveDefaultMemberGroupIds(user.email);
      const appSummaries = WORKSPACE_APPS.map(app =>
        buildAppSummary(
          app.id,
          memoryGrants.filter(grant => grant.appId === app.id),
        ),
      ).filter((app): app is AdminAppSummary => Boolean(app));
      const launchCount = appSummaries.reduce((sum, app) => sum + app.launchCount, 0);
      const appBreakdown: AdminTenantUsageAppSummary[] = appSummaries
        .filter(app => app.launchCount > 0)
        .map(app => ({
          appId: app.id,
          appName: app.name,
          shortCode: app.shortCode,
          kind: app.kind,
          launchCount: app.launchCount,
          runCount: app.launchCount,
          messageCount: app.launchCount * 2,
          artifactCount: app.launchCount,
          uploadedFileCount: 0,
          totalStorageBytes: app.launchCount * 320,
          totalTokens: app.launchCount * 80,
          lastActivityAt: app.lastLaunchedAt,
        }));
      const quotaUsage: AdminTenantQuotaUsageSummary[] = buildDefaultQuotaLimitRecords(
        user,
        memberGroupIds,
      ).map(limit => {
        const scopeUsage = limit.scope === 'tenant' ? launchCount * 20 : limit.scope === 'group' ? launchCount * 12 : launchCount * 10;
        const actualUsed = limit.baseUsed + scopeUsage;

        return {
          scope: limit.scope,
          scopeId: limit.scopeId,
          scopeLabel: limit.scopeLabel,
          monthlyLimit: limit.limit,
          actualUsed,
          remaining: Math.max(0, limit.limit - actualUsed),
          utilizationPercent: Math.min(999, Math.round((actualUsed / Math.max(limit.limit, 1)) * 100)),
          isOverLimit: actualUsed > limit.limit,
        };
      });
      const usage: AdminTenantUsageSummary = {
        tenantId: user.tenantId,
        tenantName: formatTenantName(user.tenantId),
        launchCount,
        runCount: launchCount,
        succeededRunCount: launchCount,
        failedRunCount: 0,
        stoppedRunCount: 0,
        messageCount: launchCount * 2,
        artifactCount: launchCount,
        uploadedFileCount: 0,
        uploadedBytes: 0,
        artifactBytes: launchCount * 320,
        totalStorageBytes: launchCount * 320,
        totalTokens: launchCount * 80,
        lastActivityAt: appSummaries.find((app) => app.lastLaunchedAt)?.lastLaunchedAt ?? null,
        appBreakdown,
        quotaUsage,
      };

      return {
        tenants: [usage],
        totals: {
          ...totals,
          launchCount: usage.launchCount,
          runCount: usage.runCount,
          succeededRunCount: usage.succeededRunCount,
          failedRunCount: usage.failedRunCount,
          stoppedRunCount: usage.stoppedRunCount,
          messageCount: usage.messageCount,
          artifactCount: usage.artifactCount,
          uploadedFileCount: usage.uploadedFileCount,
          uploadedBytes: usage.uploadedBytes,
          artifactBytes: usage.artifactBytes,
          totalStorageBytes: usage.totalStorageBytes,
          totalTokens: usage.totalTokens,
          lastActivityAt: usage.lastActivityAt,
        },
      };
    },
    createAppGrantForUser(user, input) {
      const app = WORKSPACE_APPS.find(candidate => candidate.id === input.appId);

      if (!app) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The target workspace app could not be found.',
        };
      }

      const normalizedEmail = input.subjectUserEmail.trim().toLowerCase();

      if (!normalizedEmail) {
        return {
          ok: false,
          statusCode: 400,
          code: 'ADMIN_INVALID_PAYLOAD',
          message: 'A target user email is required.',
        };
      }

      const targetUser = buildInMemoryUsers(user).find(candidate => candidate.email === normalizedEmail);

      if (!targetUser) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The target user could not be found in this tenant.',
          details: {
            subjectUserEmail: normalizedEmail,
          },
        };
      }

      const duplicateGrant = memoryGrants.find(
        grant =>
          grant.appId === app.id &&
          grant.user.id === targetUser.id &&
          grant.effect === input.effect
      );

      if (duplicateGrant) {
        return {
          ok: false,
          statusCode: 409,
          code: 'ADMIN_CONFLICT',
          message: 'This direct user grant already exists.',
          details: {
            appId: app.id,
            subjectUserEmail: normalizedEmail,
            effect: input.effect,
          },
        };
      }

      const grant: InMemoryAppGrant = {
        id: randomUUID(),
        appId: app.id,
        effect: input.effect,
        reason: input.reason?.trim() || null,
        createdAt: new Date().toISOString(),
        expiresAt: null,
        createdByUserId: user.id,
        user: {
          id: targetUser.id,
          email: targetUser.email,
          displayName: targetUser.displayName,
          status: targetUser.status,
        },
      };
      memoryGrants.push(grant);

      return {
        ok: true,
        data: {
          grant: (({ appId: _, ...strippedGrant }) => strippedGrant)(grant),
          app: buildAppSummary(
            app.id,
            memoryGrants.filter(currentGrant => currentGrant.appId === app.id)
          )!,
        },
      };
    },
    revokeAppGrantForUser(user, input) {
      void user;

      const index = memoryGrants.findIndex(
        grant => grant.appId === input.appId && grant.id === input.grantId
      );

      if (index === -1) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The target direct user grant could not be found.',
          details: {
            appId: input.appId,
            grantId: input.grantId,
          },
        };
      }

      const revokedGrant = memoryGrants[index];

      if (!revokedGrant) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The target direct user grant could not be found.',
          details: {
            appId: input.appId,
            grantId: input.grantId,
          },
        };
      }

      memoryGrants.splice(index, 1);
      const app = buildAppSummary(
        input.appId,
        memoryGrants.filter(grant => grant.appId === input.appId)
      );

      if (!app) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The target workspace app could not be found.',
          details: {
            appId: input.appId,
          },
        };
      }

      return {
        ok: true,
        data: {
          app,
          revokedGrantId: revokedGrant.id,
          revokedGrant: {
            id: revokedGrant.id,
            effect: revokedGrant.effect,
            reason: revokedGrant.reason,
            createdAt: revokedGrant.createdAt,
            expiresAt: revokedGrant.expiresAt,
            createdByUserId: revokedGrant.createdByUserId,
            user: revokedGrant.user,
          },
        },
      };
    },
    getIdentityOverviewForUser(user, input = {}) {
      const targetTenantId = input.tenantId?.trim() || user.tenantId;
      const tenant = getTenantSummaryForUser(user, targetTenantId);

      return {
        tenant,
        domainClaims: memoryDomainClaims
          .filter(claim => claim.tenantId === targetTenantId)
          .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt)),
        pendingAccessRequests: memoryAccessRequests
          .filter(request => request.tenantId === targetTenantId)
          .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt)),
        breakGlassSessions: memoryBreakGlassSessions
          .filter(session => session.tenantId === targetTenantId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        governance: tenant ? getGovernance(targetTenantId) : null,
      };
    },
    createDomainClaimForUser(user, input) {
      const tenantId = input.tenantId?.trim() || user.tenantId;
      const tenant = getTenantSummaryForUser(user, tenantId);
      const domain = input.domain.trim().toLowerCase();
      const providerId = input.providerId.trim();

      if (!tenant || !domain || !providerId) {
        return {
          ok: false,
          statusCode: 400,
          code: 'ADMIN_INVALID_PAYLOAD',
          message: 'Domain claims require a tenant, domain and provider id.',
        };
      }

      if (memoryDomainClaims.some(claim => claim.domain === domain)) {
        return {
          ok: false,
          statusCode: 409,
          code: 'ADMIN_CONFLICT',
          message: 'This domain already has a pending or active claim.',
          details: {
            domain,
          },
        };
      }

      const claim: InMemoryDomainClaim = {
        id: `claim_${randomUUID()}`,
        tenantId,
        tenantName: tenant.name,
        domain,
        providerId,
        status: canReadPlatformAdmin(user.email) ? 'approved' : 'pending',
        jitUserStatus: input.jitUserStatus,
        requestedAt: new Date().toISOString(),
        requestedByUserId: user.id,
        reviewedAt: canReadPlatformAdmin(user.email) ? new Date().toISOString() : null,
        reviewedByUserId: canReadPlatformAdmin(user.email) ? user.id : null,
        reviewReason: null,
      };
      memoryDomainClaims.unshift(claim);

      return {
        ok: true,
        data: {
          claim,
        },
      };
    },
    reviewDomainClaimForUser(user, input) {
      const claim = memoryDomainClaims.find(candidate => candidate.id === input.claimId);

      if (!claim) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The domain claim could not be found.',
          details: {
            claimId: input.claimId,
          },
        };
      }

      claim.status = input.status;
      claim.reviewedAt = new Date().toISOString();
      claim.reviewedByUserId = user.id;
      claim.reviewReason = input.reviewReason?.trim() || null;

      return {
        ok: true,
        data: {
          claim,
        },
      };
    },
    reviewAccessRequestForUser(user, input) {
      const request = memoryAccessRequests.find(candidate => candidate.id === input.requestId);

      if (!request) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The access request could not be found.',
          details: {
            requestId: input.requestId,
          },
        };
      }

      if (input.decision === 'transferred') {
        const targetTenantId = input.targetTenantId?.trim();
        const targetTenant = targetTenantId ? getTenantSummaryForUser(user, targetTenantId) : null;

        if (!targetTenantId || !targetTenant) {
          return {
            ok: false,
            statusCode: 400,
            code: 'ADMIN_INVALID_PAYLOAD',
            message: 'Transferring an access request requires a valid target tenant.',
            details: {
              targetTenantId: input.targetTenantId ?? null,
            },
          };
        }

        request.status = 'transferred';
        request.targetTenantId = targetTenant.id;
        request.targetTenantName = targetTenant.name;
        request.tenantId = targetTenant.id;
        request.tenantName = targetTenant.name;
      } else {
        request.status = input.decision;
      }

      request.reviewReason = input.reviewReason?.trim() || null;
      request.reviewedAt = new Date().toISOString();
      request.reviewedByUserId = user.id;

      return {
        ok: true,
        data: {
          request,
        },
      };
    },
    resetUserMfaForUser(_user, input) {
      const targetUser = buildInMemoryUsers(_user).find(candidate => candidate.id === input.userId);

      if (!targetUser) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The target user could not be found.',
          details: {
            userId: input.userId,
          },
        };
      }

      return {
        ok: true,
        data: {
          userId: targetUser.id,
          reset: true,
          reason: input.reason?.trim() || null,
        },
      };
    },
    createBreakGlassSessionForUser(user, input) {
      const tenantId = input.tenantId?.trim() || user.tenantId;
      const tenant = getTenantSummaryForUser(user, tenantId);
      const reason = input.reason.trim();

      if (!tenant || !reason) {
        return {
          ok: false,
          statusCode: 400,
          code: 'ADMIN_INVALID_PAYLOAD',
          message: 'Break-glass sessions require a valid tenant and reason.',
        };
      }

      const session: InMemoryBreakGlassSession = {
        id: `bg_${randomUUID()}`,
        tenantId,
        tenantName: tenant.name,
        actorUserId: user.id,
        actorUserEmail: user.email,
        reason,
        justification: input.justification?.trim() || null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + Math.max(15, input.expiresInMinutes ?? 60) * 60_000).toISOString(),
        status: 'active',
        reviewedAt: null,
        reviewedByUserId: null,
        reviewNotes: null,
      };
      memoryBreakGlassSessions.unshift(session);

      return {
        ok: true,
        data: {
          session,
        },
      };
    },
    updateBreakGlassSessionForUser(user, input) {
      const session = memoryBreakGlassSessions.find(candidate => candidate.id === input.sessionId);

      if (!session) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The break-glass session could not be found.',
          details: {
            sessionId: input.sessionId,
          },
        };
      }

      session.status = input.status;
      session.reviewedAt = new Date().toISOString();
      session.reviewedByUserId = user.id;
      session.reviewNotes = input.reviewNotes?.trim() || null;

      return {
        ok: true,
        data: {
          session,
        },
      };
    },
    updateTenantGovernanceForUser(user, input) {
      const tenantId = input.tenantId?.trim() || user.tenantId;
      const tenant = getTenantSummaryForUser(user, tenantId);

      if (!tenant) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The target tenant could not be found.',
          details: {
            tenantId,
          },
        };
      }

      const governance = mergeGovernanceSettings(getGovernance(tenantId), input);
      memoryGovernance.set(tenantId, governance);

      return {
        ok: true,
        data: {
          governance,
        },
      };
    },
    resolveSsoProviderForEmail(email) {
      const domain = email.trim().toLowerCase().split('@')[1] ?? '';
      const claim = memoryDomainClaims.find(
        candidate => candidate.domain === domain && candidate.status === 'approved'
      );

      if (!claim) {
        return null;
      }

      return {
        providerId: claim.providerId,
        tenantId: claim.tenantId,
        claimId: claim.id,
        jitUserStatus: claim.jitUserStatus,
      };
    },
    capturePendingAccessRequest(input) {
      const existing = memoryAccessRequests.find(
        request =>
          request.tenantId === input.tenantId &&
          request.email === input.email.toLowerCase() &&
          request.status === 'pending'
      );

      if (existing) {
        return existing;
      }

      const request: InMemoryAccessRequest = {
        id: `request_${randomUUID()}`,
        tenantId: input.tenantId,
        tenantName: input.tenantName ?? formatTenantName(input.tenantId),
        userId: input.userId,
        email: input.email.trim().toLowerCase(),
        displayName: input.displayName?.trim() || null,
        source: input.source,
        status: 'pending',
        requestedAt: new Date().toISOString(),
        requestedByUserId: null,
        domainClaimId: input.domainClaimId ?? null,
        reason: input.reason?.trim() || null,
        targetTenantId: null,
        targetTenantName: null,
        reviewedAt: null,
        reviewedByUserId: null,
        reviewReason: null,
      };
      memoryAccessRequests.unshift(request);
      return request;
    },
    listAuditForUser(user, filters = {}) {
      const normalizedFilters = normalizeAuditFilters(filters);
      const tenantEvents = [
        buildInMemoryAuditEventWithMode({
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: 'auth.login.succeeded',
          entityType: 'session',
          entityId: 'mem-session-1',
          payload: {
            email: user.email,
            authMethod: 'password',
          },
          occurredAtOffsetMs: 5 * 60_000,
        }, normalizedFilters.payloadMode ?? 'masked'),
        buildInMemoryAuditEventWithMode({
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: 'auth.mfa.enabled',
          entityType: 'user',
          entityId: user.id,
          payload: {
            email: user.email,
          },
          occurredAtOffsetMs: 35 * 60_000,
        }, normalizedFilters.payloadMode ?? 'masked'),
        buildInMemoryAuditEventWithMode({
          tenantId: user.tenantId,
          actorUserId: null,
          action: 'auth.login.failed',
          entityType: 'user',
          entityId: 'usr_pending_reviewer',
          payload: {
            email: 'pending-review@example.net',
          },
          level: 'warning',
          occurredAtOffsetMs: 50 * 60_000,
        }, normalizedFilters.payloadMode ?? 'masked'),
      ];
      const platformEvents = canReadPlatformAdmin(user.email)
        ? [
            buildInMemoryAuditEventWithMode(
              {
                tenantId: 'tenant-acme-platform',
                tenantName: 'Acme Platform',
                actorUserId: user.id,
                action: 'admin.tenant.created',
                entityType: 'tenant',
                entityId: 'tenant-acme-platform',
                payload: {
                  tenantSlug: 'acme-platform',
                  bootstrapAdminEmail: 'owner@acme.example',
                },
                occurredAtOffsetMs: 10 * 60_000,
              },
              normalizedFilters.payloadMode ?? 'masked'
            ),
            buildInMemoryAuditEventWithMode(
              {
                tenantId: 'tenant-acme-platform',
                tenantName: 'Acme Platform',
                actorUserId: user.id,
                action: 'admin.tenant.suspended',
                entityType: 'tenant',
                entityId: 'tenant-acme-platform',
                payload: {
                  reason: 'Billing hold',
                  traceId: 'trace-platform-1',
                },
                level: 'critical',
                occurredAtOffsetMs: 2 * 60_000,
              },
              normalizedFilters.payloadMode ?? 'masked'
            ),
          ]
        : [];
      const candidateEvents =
        normalizedFilters.scope === 'platform' && canReadPlatformAdmin(user.email)
          ? [...tenantEvents, ...platformEvents]
          : tenantEvents;
      const events = candidateEvents.filter(event => matchesAuditFilters(event, normalizedFilters));

      return buildAuditQueryResult(events, normalizedFilters);
    },
  };
}

export type { AdminMutationResult, AdminService, CreateAppGrantInput, RevokeAppGrantInput };
