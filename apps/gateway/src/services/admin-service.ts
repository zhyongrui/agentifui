import type { AuthAuditEvent, AuthUser } from '@agentifui/shared/auth';
import type {
  AdminAppGrantCreateRequest,
  AdminAppSummary,
  AdminAppUserGrant,
  AdminAuditActionCount,
  AdminAuditEventSummary,
  AdminAuditFilters,
  AdminAuditPayloadMode,
  AdminTenantBootstrapInvitation,
  AdminTenantSummary,
  AdminErrorCode,
  AdminGroupSummary,
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
  listUsersForUser(user: AuthUser): AdminUserSummary[] | Promise<AdminUserSummary[]>;
  listGroupsForUser(user: AuthUser): AdminGroupSummary[] | Promise<AdminGroupSummary[]>;
  listAppsForUser(user: AuthUser): AdminAppSummary[] | Promise<AdminAppSummary[]>;
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
    events: AdminAuditEventSummary[];
  }> | {
    countsByAction: AdminAuditActionCount[];
    events: AdminAuditEventSummary[];
  };
};

type InMemoryAppGrant = AdminAppUserGrant & {
  appId: string;
};

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
    tenantId: string;
  },
  payloadMode: AdminAuditPayloadMode
): AdminAuditEventSummary {
  const payloadResult = inspectAdminAuditPayload(input.payload, payloadMode);
  const payload = payloadResult.payload;

  return {
    id: input.id ?? randomUUID(),
    tenantId: input.tenantId,
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

function buildInMemoryUsers(user: AuthUser): AdminUserSummary[] {
  const adminRoleIds = resolveDefaultRoleIds(user.email);

  return [
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
    userGrants: grants
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(({ appId: _, ...grant }) => grant),
  };
}

function normalizeAuditFilters(filters: AdminAuditFilters = {}): AdminAuditFilters {
  return {
    action: filters.action?.trim() || null,
    level: filters.level ?? null,
    actorUserId: filters.actorUserId?.trim() || null,
    entityType: filters.entityType ?? null,
    traceId: filters.traceId?.trim() || null,
    runId: filters.runId?.trim() || null,
    conversationId: filters.conversationId?.trim() || null,
    occurredAfter: filters.occurredAfter?.trim() || null,
    occurredBefore: filters.occurredBefore?.trim() || null,
    payloadMode: filters.payloadMode ?? 'masked',
    limit: filters.limit ?? null,
  };
}

function matchesAuditFilters(event: AdminAuditEventSummary, filters: AdminAuditFilters) {
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

export function createAdminService(): AdminService {
  const memoryGrants: InMemoryAppGrant[] = [];
  const memoryTenants = new Map<string, AdminTenantSummary>();

  return {
    canReadAdminForUser(user) {
      return canReadAdmin(user.email);
    },
    canReadPlatformAdminForUser(user) {
      return canReadPlatformAdmin(user.email);
    },
    listTenantsForUser(user) {
      const tenants = new Map(buildInMemoryTenants(user).map(tenant => [tenant.id, tenant]));

      for (const tenant of memoryTenants.values()) {
        tenants.set(tenant.id, tenant);
      }

      return [...tenants.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
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
    listUsersForUser(user) {
      return buildInMemoryUsers(user);
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
    listAuditForUser(user, filters = {}) {
      const normalizedFilters = normalizeAuditFilters(filters);
      const events = [
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
      ].filter(event => matchesAuditFilters(event, normalizedFilters));

      const limit =
        typeof normalizedFilters.limit === 'number' && normalizedFilters.limit > 0
          ? normalizedFilters.limit
          : events.length;
      const limitedEvents = events.slice(0, limit);
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

      return {
        countsByAction,
        events: limitedEvents,
      };
    },
  };
}

export type { AdminMutationResult, AdminService, CreateAppGrantInput, RevokeAppGrantInput };
