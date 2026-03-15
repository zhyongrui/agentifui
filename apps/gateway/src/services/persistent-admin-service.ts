import type { DatabaseClient } from '@agentifui/db';
import type { AuthAuditEvent, AuthUser } from '@agentifui/shared/auth';
import type {
  AdminAppGrantCreateRequest,
  AdminAppSummary,
  AdminAppUserGrant,
  AdminAuditActionCount,
  AdminAuditEventSummary,
  AdminAuditFilters,
  AdminCleanupLastRun,
  AdminCleanupPolicy,
  AdminCleanupPreview,
  AdminAuditPayloadMode,
  AdminAuditTenantCount,
  AdminTenantSummary,
  AdminErrorCode,
  AdminGroupSummary,
  AdminUserSummary,
} from '@agentifui/shared/admin';
import { createHash, randomUUID } from 'node:crypto';

import type { AdminService } from './admin-service.js';
import { inspectAdminAuditPayload } from './admin-audit-pii.js';
import {
  resolveDefaultMemberGroupIds,
  resolveDefaultRoleIds,
  WORKSPACE_APPS,
  WORKSPACE_GROUPS,
} from './workspace-catalog-fixtures.js';
import {
  buildWorkspaceCleanupPolicy,
  getLatestWorkspaceCleanupExecution,
  previewWorkspaceCleanup,
} from './workspace-cleanup.js';
import { buildDefaultQuotaLimitRecords } from './workspace-quota.js';

type UserRow = {
  created_at: Date | string;
  display_name: string;
  email: string;
  id: string;
  last_login_at: Date | string | null;
  status: AdminUserSummary['status'];
};

type GroupMembershipRow = {
  group_id: string;
  group_name: string;
  is_primary: boolean;
  role: 'member' | 'manager';
  user_id: string;
};

type UserRoleRow = {
  role_id: string;
  user_id: string;
};

type MfaRow = {
  user_id: string;
};

type TenantRow = {
  created_at: Date | string;
  id: string;
  name: string;
  slug: string;
  status: AdminTenantSummary['status'];
  updated_at: Date | string;
};

type TenantUserCountRow = {
  tenant_id: string;
  user_count: number;
};

type TenantGroupCountRow = {
  tenant_id: string;
  group_count: number;
};

type TenantAppCountRow = {
  tenant_id: string;
  app_count: number;
};

type TenantAdminCountRow = {
  tenant_id: string;
  admin_count: number;
};

type TenantPrimaryAdminRow = {
  tenant_id: string;
  user_display_name: string;
  user_email: string;
  user_id: string;
};

type GroupRow = {
  description: string | null;
  id: string;
  name: string;
};

type GroupMemberCountRow = {
  group_id: string;
  manager_count: number;
  member_count: number;
  primary_member_count: number;
};

type GroupAppGrantRow = {
  app_id: string;
  group_id: string;
  name: string;
  short_code: string;
  slug: string;
  status: AdminGroupSummary['appGrants'][number]['status'];
};

type AppRow = {
  id: string;
  kind: AdminAppSummary['kind'];
  launch_cost: number;
  name: string;
  short_code: string;
  slug: string;
  status: AdminAppSummary['status'];
  summary: string;
};

type AppGroupGrantRow = {
  app_id: string;
  group_id: string;
  group_name: string;
};

type AppAccessGrantRow = {
  app_id: string;
  effect: 'allow' | 'deny';
  subject_id: string;
  subject_type: 'group' | 'role' | 'user';
};

type AppLaunchRow = {
  app_id: string;
  last_launched_at: Date | string | null;
  launch_count: number;
};

type AppUserGrantRow = {
  app_id: string;
  created_at: Date | string;
  created_by_user_id: string | null;
  effect: 'allow' | 'deny';
  expires_at: Date | string | null;
  id: string;
  reason: string | null;
  user_display_name: string;
  user_email: string;
  user_id: string;
  user_status: AdminUserSummary['status'];
};

type TenantUserLookupRow = {
  display_name: string;
  email: string;
  id: string;
  status: AdminUserSummary['status'];
};

type ExistingTenantRow = {
  id: string;
  slug: string;
  status: AdminTenantSummary['status'];
};

type AuditEventRow = {
  action: string;
  actor_user_id: string | null;
  entity_id: string | null;
  entity_type: 'conversation' | 'run' | 'session' | 'tenant' | 'user' | 'workspace_app';
  id: string;
  ip_address: string | null;
  level: 'critical' | 'info' | 'warning';
  occurred_at: Date | string;
  payload: Record<string, unknown> | string;
  tenant_id: string | null;
  tenant_name: string | null;
};

type AuditCountRow = {
  action: string;
  count: number;
};

type AdminMutationErrorResult = {
  ok: false;
  statusCode: 400 | 404 | 409;
  code: Extract<AdminErrorCode, 'ADMIN_INVALID_PAYLOAD' | 'ADMIN_NOT_FOUND' | 'ADMIN_CONFLICT'>;
  message: string;
  details?: unknown;
};

function toIso(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeJsonRecord(value: Record<string, unknown> | string) {
  if (typeof value !== 'string') {
    return value ?? {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function listActiveRoleIdsForUser(database: DatabaseClient, userId: string) {
  const rows = await database<{ role_id: string }[]>`
    select role_id
    from rbac_user_roles
    where user_id = ${userId}
      and (expires_at is null or expires_at > now())
    order by created_at asc
  `;

  return rows.map(row => row.role_id);
}

async function ensureDefaultRoles(database: DatabaseClient, user: AuthUser) {
  const existingRoleIds = await listActiveRoleIdsForUser(database, user.id);

  if (existingRoleIds.length > 0) {
    return existingRoleIds;
  }

  const defaultRoleIds = resolveDefaultRoleIds(user.email);

  for (const roleId of defaultRoleIds) {
    await database`
      insert into rbac_user_roles (
        id,
        tenant_id,
        user_id,
        role_id,
        created_at
      )
      values (
        ${randomUUID()},
        ${user.tenantId},
        ${user.id},
        ${roleId},
        now()
      )
      on conflict (tenant_id, user_id, role_id) do nothing
    `;
  }

  return defaultRoleIds;
}

function buildAuditContext(event: AuthAuditEvent): AdminAuditEventSummary['context'] {
  const payload = normalizeJsonRecord(event.payload);

  return {
    traceId:
      typeof payload.traceId === 'string'
        ? payload.traceId
        : typeof payload.trace_id === 'string'
          ? payload.trace_id
          : null,
    runId:
      typeof payload.runId === 'string'
        ? payload.runId
        : typeof payload.run_id === 'string'
          ? payload.run_id
          : null,
    conversationId:
      typeof payload.conversationId === 'string'
        ? payload.conversationId
        : typeof payload.conversation_id === 'string'
          ? payload.conversation_id
          : null,
    appId:
      typeof payload.appId === 'string'
        ? payload.appId
        : typeof payload.app_id === 'string'
          ? payload.app_id
          : null,
    appName:
      typeof payload.appName === 'string'
        ? payload.appName
        : typeof payload.app_name === 'string'
          ? payload.app_name
          : null,
    activeGroupId:
      typeof payload.activeGroupId === 'string'
        ? payload.activeGroupId
        : typeof payload.active_group_id === 'string'
          ? payload.active_group_id
          : null,
    activeGroupName:
      typeof payload.activeGroupName === 'string'
        ? payload.activeGroupName
        : typeof payload.active_group_name === 'string'
          ? payload.active_group_name
          : null,
  };
}

function toAuditEvent(
  row: AuditEventRow,
  payloadMode: AdminAuditPayloadMode
): AdminAuditEventSummary {
  const normalizedPayload = normalizeJsonRecord(row.payload);
  const payloadResult = inspectAdminAuditPayload(normalizedPayload, payloadMode);
  const event: AuthAuditEvent = {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    action: row.action as AuthAuditEvent['action'],
    level: row.level,
    entityType: row.entity_type,
    entityId: row.entity_id,
    ipAddress: row.ip_address,
    payload: payloadResult.payload,
    occurredAt: toIso(row.occurred_at)!,
  };

  return {
    ...event,
    tenantName: row.tenant_name,
    context: buildAuditContext(event),
    payloadInspection: payloadResult.inspection,
  };
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
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

function buildTenantScopedId(tenantId: string, baseId: string) {
  return `${tenantId}:${baseId}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function seedTenantWorkspaceResources(database: DatabaseClient, tenantId: string) {
  const groupIdByBaseId = new Map<string, string>();
  const appIdByBaseId = new Map<string, string>();

  for (const group of WORKSPACE_GROUPS) {
    const tenantGroupId = buildTenantScopedId(tenantId, group.id);
    groupIdByBaseId.set(group.id, tenantGroupId);

    await database`
      insert into groups (
        id,
        tenant_id,
        slug,
        name,
        description,
        created_at,
        updated_at
      )
      values (
        ${tenantGroupId},
        ${tenantId},
        ${group.id.replace(/^grp_/, '').replace(/_/g, '-')},
        ${group.name},
        ${group.description},
        now(),
        now()
      )
    `;
  }

  for (const app of WORKSPACE_APPS) {
    const tenantAppId = buildTenantScopedId(tenantId, app.id);
    appIdByBaseId.set(app.id, tenantAppId);

    await database`
      insert into workspace_apps (
        id,
        tenant_id,
        slug,
        name,
        summary,
        kind,
        status,
        short_code,
        tags,
        launch_cost,
        sort_order,
        created_at,
        updated_at
      )
      values (
        ${tenantAppId},
        ${tenantId},
        ${app.slug},
        ${app.name},
        ${app.summary},
        ${app.kind},
        ${app.status},
        ${app.shortCode},
        ${JSON.stringify(app.tags)}::jsonb,
        ${app.launchCost},
        ${app.sortOrder},
        now(),
        now()
      )
    `;
  }

  for (const app of WORKSPACE_APPS) {
    const tenantAppId = appIdByBaseId.get(app.id)!;

    for (const groupId of app.grantedGroupIds) {
      const tenantGroupId = groupIdByBaseId.get(groupId);

      if (!tenantGroupId) {
        continue;
      }

      await database`
        insert into workspace_group_app_grants (
          id,
          tenant_id,
          group_id,
          app_id,
          created_at
        )
        values (
          ${randomUUID()},
          ${tenantId},
          ${tenantGroupId},
          ${tenantAppId},
          now()
        )
      `;

      await database`
        insert into workspace_app_access_grants (
          id,
          tenant_id,
          app_id,
          subject_type,
          subject_id,
          effect,
          created_at
        )
        values (
          ${randomUUID()},
          ${tenantId},
          ${tenantAppId},
          'group',
          ${tenantGroupId},
          'allow',
          now()
        )
      `;
    }

    for (const roleId of app.grantedRoleIds) {
      await database`
        insert into workspace_app_access_grants (
          id,
          tenant_id,
          app_id,
          subject_type,
          subject_id,
          effect,
          created_at
        )
        values (
          ${randomUUID()},
          ${tenantId},
          ${tenantAppId},
          'role',
          ${roleId},
          'allow',
          now()
        )
      `;
    }
  }

  return {
    groupIdByBaseId,
    appIdByBaseId,
  };
}

function normalizeAuditFilters(filters: AdminAuditFilters = {}) {
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
    occurredAfter: filters.occurredAfter?.trim() || null,
    occurredBefore: filters.occurredBefore?.trim() || null,
    payloadMode: filters.payloadMode ?? 'masked',
    limit:
      typeof filters.limit === 'number' && Number.isInteger(filters.limit) && filters.limit > 0
        ? filters.limit
        : 40,
  };
}

function isHighRiskAuditEvent(event: AdminAuditEventSummary) {
  return event.level === 'critical' || event.payloadInspection.highRiskMatchCount > 0;
}

function toAdminAppUserGrant(row: AppUserGrantRow): AdminAppUserGrant {
  return {
    id: row.id,
    effect: row.effect,
    reason: row.reason,
    createdAt: toIso(row.created_at)!,
    expiresAt: toIso(row.expires_at),
    createdByUserId: row.created_by_user_id,
    user: {
      id: row.user_id,
      email: row.user_email,
      displayName: row.user_display_name,
      status: row.user_status,
    },
  };
}

async function listAppSummariesForTenant(database: DatabaseClient, tenantId: string) {
  const [apps, groupGrantRows, accessGrantRows, userGrantRows, launchRows] = await Promise.all([
    database<AppRow[]>`
      select id, slug, name, summary, kind, status, short_code, launch_cost
      from workspace_apps
      where tenant_id = ${tenantId}
      order by sort_order asc, name asc
    `,
    database<AppGroupGrantRow[]>`
      select
        gag.app_id,
        g.id as group_id,
        g.name as group_name
      from workspace_group_app_grants gag
      inner join groups g on g.id = gag.group_id
      where gag.tenant_id = ${tenantId}
      order by g.name asc
    `,
    database<AppAccessGrantRow[]>`
      select app_id, subject_type, subject_id, effect
      from workspace_app_access_grants
      where tenant_id = ${tenantId}
        and (expires_at is null or expires_at > now())
    `,
    database<AppUserGrantRow[]>`
      select
        wag.app_id,
        wag.id,
        wag.effect,
        wag.reason,
        wag.created_at,
        wag.expires_at,
        wag.created_by_user_id,
        u.id as user_id,
        u.email as user_email,
        u.display_name as user_display_name,
        u.status as user_status
      from workspace_app_access_grants wag
      inner join users u on u.id = wag.subject_id
      where wag.tenant_id = ${tenantId}
        and wag.subject_type = 'user'
        and (wag.expires_at is null or wag.expires_at > now())
      order by wag.created_at desc, u.email asc
    `,
    database<AppLaunchRow[]>`
      select
        app_id,
        count(*)::int as launch_count,
        max(launched_at) as last_launched_at
      from workspace_app_launches
      where tenant_id = ${tenantId}
      group by app_id
    `,
  ]);

  const groupGrantsByAppId = new Map<string, AdminAppSummary['grantedGroups']>();
  const userGrantsByAppId = new Map<string, AdminAppSummary['userGrants']>();
  const launchStatsByAppId = new Map(launchRows.map(row => [row.app_id, row]));
  const accessGrantStateByAppId = new Map<
    string,
    Pick<AdminAppSummary, 'directUserGrantCount' | 'denyGrantCount' | 'grantedRoleIds'>
  >();

  for (const groupGrantRow of groupGrantRows) {
    const currentGroupGrants = groupGrantsByAppId.get(groupGrantRow.app_id) ?? [];
    currentGroupGrants.push({
      id: groupGrantRow.group_id,
      name: groupGrantRow.group_name,
    });
    groupGrantsByAppId.set(groupGrantRow.app_id, currentGroupGrants);
  }

  for (const userGrantRow of userGrantRows) {
    const currentUserGrants = userGrantsByAppId.get(userGrantRow.app_id) ?? [];
    currentUserGrants.push(toAdminAppUserGrant(userGrantRow));
    userGrantsByAppId.set(userGrantRow.app_id, currentUserGrants);
  }

  for (const accessGrantRow of accessGrantRows) {
    const currentState = accessGrantStateByAppId.get(accessGrantRow.app_id) ?? {
      grantedRoleIds: [],
      directUserGrantCount: 0,
      denyGrantCount: 0,
    };

    if (accessGrantRow.effect === 'deny') {
      currentState.denyGrantCount += 1;
    } else if (accessGrantRow.subject_type === 'user') {
      currentState.directUserGrantCount += 1;
    } else if (accessGrantRow.subject_type === 'role') {
      currentState.grantedRoleIds.push(accessGrantRow.subject_id);
    }

    accessGrantStateByAppId.set(accessGrantRow.app_id, currentState);
  }

  return apps.map(appRow => {
    const accessState = accessGrantStateByAppId.get(appRow.id);
    const launchStats = launchStatsByAppId.get(appRow.id);

    return {
      id: appRow.id,
      slug: appRow.slug,
      name: appRow.name,
      summary: appRow.summary,
      kind: appRow.kind,
      status: appRow.status,
      shortCode: appRow.short_code,
      launchCost: appRow.launch_cost,
      grantedGroups: groupGrantsByAppId.get(appRow.id) ?? [],
      grantedRoleIds: [...new Set(accessState?.grantedRoleIds ?? [])],
      directUserGrantCount: accessState?.directUserGrantCount ?? 0,
      denyGrantCount: accessState?.denyGrantCount ?? 0,
      launchCount: launchStats?.launch_count ?? 0,
      lastLaunchedAt: toIso(launchStats?.last_launched_at ?? null),
      userGrants: userGrantsByAppId.get(appRow.id) ?? [],
    };
  });
}

async function listTenantSummaries(database: DatabaseClient) {
  const [tenants, userCounts, groupCounts, appCounts, adminCounts, primaryAdminRows] =
    await Promise.all([
      database<TenantRow[]>`
        select id, slug, name, status, created_at, updated_at
        from tenants
        order by created_at asc, slug asc
      `,
      database<TenantUserCountRow[]>`
        select tenant_id, count(*)::int as user_count
        from users
        group by tenant_id
      `,
      database<TenantGroupCountRow[]>`
        select tenant_id, count(*)::int as group_count
        from groups
        group by tenant_id
      `,
      database<TenantAppCountRow[]>`
        select tenant_id, count(*)::int as app_count
        from workspace_apps
        group by tenant_id
      `,
      database<TenantAdminCountRow[]>`
        select tenant_id, count(distinct user_id)::int as admin_count
        from rbac_user_roles
        where role_id in ('tenant_admin', 'root_admin')
          and (expires_at is null or expires_at > now())
        group by tenant_id
      `,
      database<TenantPrimaryAdminRow[]>`
        select distinct on (rur.tenant_id)
          rur.tenant_id,
          u.id as user_id,
          u.email as user_email,
          u.display_name as user_display_name
        from rbac_user_roles rur
        inner join users u on u.id = rur.user_id
        where rur.role_id in ('tenant_admin', 'root_admin')
          and (rur.expires_at is null or rur.expires_at > now())
        order by rur.tenant_id asc, rur.created_at asc, u.created_at asc
      `,
    ]);

  const userCountByTenantId = new Map(userCounts.map(row => [row.tenant_id, row.user_count]));
  const groupCountByTenantId = new Map(groupCounts.map(row => [row.tenant_id, row.group_count]));
  const appCountByTenantId = new Map(appCounts.map(row => [row.tenant_id, row.app_count]));
  const adminCountByTenantId = new Map(adminCounts.map(row => [row.tenant_id, row.admin_count]));
  const primaryAdminByTenantId = new Map(
    primaryAdminRows.map(row => [
      row.tenant_id,
      {
        id: row.user_id,
        email: row.user_email,
        displayName: row.user_display_name,
      },
    ])
  );

  return tenants.map(tenant => ({
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    createdAt: toIso(tenant.created_at)!,
    updatedAt: toIso(tenant.updated_at)!,
    userCount: userCountByTenantId.get(tenant.id) ?? 0,
    groupCount: groupCountByTenantId.get(tenant.id) ?? 0,
    appCount: appCountByTenantId.get(tenant.id) ?? 0,
    adminCount: adminCountByTenantId.get(tenant.id) ?? 0,
    primaryAdmin: primaryAdminByTenantId.get(tenant.id) ?? null,
  }));
}

async function findTenantSummary(database: DatabaseClient, tenantId: string) {
  const tenants = await listTenantSummaries(database);

  return tenants.find(tenant => tenant.id === tenantId) ?? null;
}

async function seedTenantQuotaLimits(
  database: DatabaseClient,
  user: AuthUser,
  memberGroupIds: string[]
) {
  const seeds = buildDefaultQuotaLimitRecords(user, memberGroupIds);

  for (const seed of seeds) {
    await database`
      insert into workspace_quota_limits (
        id,
        tenant_id,
        scope,
        scope_id,
        scope_label,
        monthly_limit,
        base_used
      )
      values (
        ${`quota_${seed.scope}_${seed.scopeId}`},
        ${user.tenantId},
        ${seed.scope},
        ${seed.scopeId},
        ${seed.scopeLabel},
        ${seed.limit},
        ${seed.baseUsed}
      )
      on conflict (tenant_id, scope, scope_id) do nothing
    `;
  }
}

function toMutationError(
  code: AdminMutationErrorResult['code'],
  message: string,
  details?: unknown,
  statusCode: AdminMutationErrorResult['statusCode'] = code === 'ADMIN_CONFLICT' ? 409 : 404
): AdminMutationErrorResult {
  return {
    ok: false,
    statusCode,
    code,
    message,
    details,
  };
}

export function createPersistentAdminService(database: DatabaseClient): AdminService {
  return {
    async canReadAdminForUser(user) {
      const roleIds = await ensureDefaultRoles(database, user);

      return roleIds.includes('tenant_admin') || roleIds.includes('root_admin');
    },
    async canReadPlatformAdminForUser(user) {
      const roleIds = await ensureDefaultRoles(database, user);

      return roleIds.includes('root_admin');
    },
    async listTenantsForUser() {
      return listTenantSummaries(database);
    },
    async createTenantForUser(user, input) {
      const name = input.name.trim();
      const slug = normalizeTenantSlug(input.slug);
      const adminEmail = normalizeEmail(input.adminEmail);
      const adminDisplayName = input.adminDisplayName?.trim() || adminEmail.split('@')[0] || 'Tenant Admin';

      if (!name || !slug || !adminEmail || !isValidEmail(adminEmail)) {
        return toMutationError(
          'ADMIN_INVALID_PAYLOAD',
          'Tenant creation requires a tenant name, slug and bootstrap admin email.',
          undefined,
          400
        );
      }

      const tenantId = buildTenantIdFromSlug(slug);
      const [existingTenant] = await database<ExistingTenantRow[]>`
        select id, slug, status
        from tenants
        where id = ${tenantId}
           or slug = ${slug}
        limit 1
      `;

      if (existingTenant) {
        return toMutationError(
          'ADMIN_CONFLICT',
          'A tenant with this slug already exists.',
          {
            tenantId: existingTenant.id,
            slug: existingTenant.slug,
          },
          409
        );
      }

      const [existingUser] = await database<{ id: string; tenant_id: string }[]>`
        select id, tenant_id
        from users
        where lower(email) = ${adminEmail}
        limit 1
      `;

      if (existingUser) {
        return toMutationError(
          'ADMIN_CONFLICT',
          'The bootstrap admin email already belongs to an existing account.',
          {
            adminEmail,
            userId: existingUser.id,
            tenantId: existingUser.tenant_id,
          },
          409
        );
      }

      const [existingInvitation] = await database<{ id: string; tenant_id: string }[]>`
        select id, tenant_id
        from invitations
        where lower(email) = ${adminEmail}
          and status = 'pending'
        limit 1
      `;

      if (existingInvitation) {
        return toMutationError(
          'ADMIN_CONFLICT',
          'The bootstrap admin email already has a pending invitation.',
          {
            adminEmail,
            invitationId: existingInvitation.id,
            tenantId: existingInvitation.tenant_id,
          },
          409
        );
      }

      const invitedUserId = randomUUID();
      const invitationId = randomUUID();
      const invitationToken = randomUUID();
      const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const invitationUrl = `/invite/accept?token=${invitationToken}`;

      await database.begin(async transaction => {
        const tx = transaction as unknown as DatabaseClient;

        await tx`
          insert into tenants (
            id,
            slug,
            name,
            status,
            metadata,
            created_at,
            updated_at
          )
          values (
            ${tenantId},
            ${slug},
            ${name},
            'active',
            ${JSON.stringify({
              bootstrapAdminEmail: adminEmail,
              createdByRootAdminUserId: user.id,
            })}::jsonb,
            now(),
            now()
          )
        `;

        const seededResources = await seedTenantWorkspaceResources(tx, tenantId);

        await tx`
          insert into users (
            id,
            tenant_id,
            email,
            display_name,
            status,
            password_hash,
            failed_login_count,
            locked_until,
            is_email_verified,
            last_login_at,
            created_at,
            updated_at
          )
          values (
            ${invitedUserId},
            ${tenantId},
            ${adminEmail},
            ${adminDisplayName},
            'pending',
            null,
            0,
            null,
            false,
            null,
            now(),
            now()
          )
        `;

        const memberGroupIds = resolveDefaultMemberGroupIds(adminEmail)
          .map(groupId => seededResources.groupIdByBaseId.get(groupId))
          .filter((groupId): groupId is string => Boolean(groupId));

        for (const [index, groupId] of memberGroupIds.entries()) {
          await tx`
            insert into group_members (
              id,
              tenant_id,
              group_id,
              user_id,
              role,
              is_primary,
              created_at
            )
            values (
              ${randomUUID()},
              ${tenantId},
              ${groupId},
              ${invitedUserId},
              'member',
              ${index === 0},
              now()
            )
          `;
        }

        for (const roleId of ['tenant_admin', 'user']) {
          await tx`
            insert into rbac_user_roles (
              id,
              tenant_id,
              user_id,
              role_id,
              created_at
            )
            values (
              ${randomUUID()},
              ${tenantId},
              ${invitedUserId},
              ${roleId},
              now()
            )
            on conflict (tenant_id, user_id, role_id) do nothing
          `;
        }

        const bootstrapAdminUser: AuthUser = {
          id: invitedUserId,
          tenantId,
          email: adminEmail,
          displayName: adminDisplayName,
          status: 'pending',
          createdAt: new Date().toISOString(),
          lastLoginAt: null,
        };

        await seedTenantQuotaLimits(tx, bootstrapAdminUser, memberGroupIds);

        await tx`
          insert into invitations (
            id,
            tenant_id,
            invited_by_user_id,
            email,
            token_hash,
            status,
            expires_at,
            accepted_at,
            created_at
          )
          values (
            ${invitationId},
            ${tenantId},
            ${user.id},
            ${adminEmail},
            ${hashToken(invitationToken)},
            'pending',
            ${invitationExpiresAt}::timestamptz,
            null,
            now()
          )
        `;
      });

      const tenant = await findTenantSummary(database, tenantId);

      if (!tenant) {
        return toMutationError(
          'ADMIN_NOT_FOUND',
          'The created tenant could not be loaded from persistence.',
          {
            tenantId,
          }
        );
      }

      return {
        ok: true,
        data: {
          tenant,
          bootstrapInvitation: {
            invitationId,
            invitedUserId,
            email: adminEmail,
            inviteToken: invitationToken,
            inviteUrl: invitationUrl,
            expiresAt: invitationExpiresAt,
          },
        },
      };
    },
    async updateTenantStatusForUser(user, input) {
      const tenantId = input.tenantId.trim();
      const reason = input.reason?.trim() || null;

      if (!tenantId || (input.status !== 'active' && input.status !== 'suspended')) {
        return toMutationError(
          'ADMIN_INVALID_PAYLOAD',
          'Tenant status updates require a tenant id and active/suspended status.',
          undefined,
          400
        );
      }

      if (tenantId === user.tenantId && input.status === 'suspended') {
        return toMutationError(
          'ADMIN_CONFLICT',
          'Root admins cannot suspend their current tenant while using it.',
          {
            tenantId,
          },
          409
        );
      }

      const [existingTenant] = await database<ExistingTenantRow[]>`
        select id, slug, status
        from tenants
        where id = ${tenantId}
        limit 1
      `;

      if (!existingTenant) {
        return toMutationError(
          'ADMIN_NOT_FOUND',
          'The target tenant could not be found.',
          {
            tenantId,
          }
        );
      }

      if (existingTenant.status === input.status) {
        return toMutationError(
          'ADMIN_CONFLICT',
          `The tenant is already ${input.status}.`,
          {
            tenantId,
            status: input.status,
          },
          409
        );
      }

      await database`
        update tenants
        set status = ${input.status},
            metadata = coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({
              lastLifecycleActorUserId: user.id,
              lastLifecycleReason: reason,
              lastLifecycleStatus: input.status,
            })}::jsonb,
            updated_at = now()
        where id = ${tenantId}
      `;

      const tenant = await findTenantSummary(database, tenantId);

      if (!tenant) {
        return toMutationError(
          'ADMIN_NOT_FOUND',
          'The updated tenant could not be loaded from persistence.',
          {
            tenantId,
          }
        );
      }

      return {
        ok: true,
        data: {
          tenant,
          previousStatus: existingTenant.status,
          reason,
        },
      };
    },
    async listUsersForUser(user) {
      const [users, memberships, roles, mfaRows] = await Promise.all([
        database<UserRow[]>`
          select id, email, display_name, status, created_at, last_login_at
          from users
          where tenant_id = ${user.tenantId}
          order by created_at asc, email asc
        `,
        database<GroupMembershipRow[]>`
          select
            gm.user_id,
            gm.role,
            gm.is_primary,
            g.id as group_id,
            g.name as group_name
          from group_members gm
          inner join groups g on g.id = gm.group_id
          where gm.tenant_id = ${user.tenantId}
          order by gm.created_at asc, g.name asc
        `,
        database<UserRoleRow[]>`
          select user_id, role_id
          from rbac_user_roles
          where tenant_id = ${user.tenantId}
            and (expires_at is null or expires_at > now())
          order by created_at asc, role_id asc
        `,
        database<MfaRow[]>`
          select distinct user_id
          from mfa_factors
          where tenant_id = ${user.tenantId}
            and enabled_at is not null
            and disabled_at is null
        `,
      ]);

      const membershipsByUserId = new Map<string, AdminUserSummary['groupMemberships']>();
      const roleIdsByUserId = new Map<string, string[]>();
      const mfaUserIds = new Set(mfaRows.map(row => row.user_id));

      for (const membership of memberships) {
        const currentMemberships = membershipsByUserId.get(membership.user_id) ?? [];
        currentMemberships.push({
          groupId: membership.group_id,
          groupName: membership.group_name,
          role: membership.role,
          isPrimary: membership.is_primary,
        });
        membershipsByUserId.set(membership.user_id, currentMemberships);
      }

      for (const role of roles) {
        const currentRoleIds = roleIdsByUserId.get(role.user_id) ?? [];
        currentRoleIds.push(role.role_id);
        roleIdsByUserId.set(role.user_id, currentRoleIds);
      }

      return users.map(userRow => ({
        id: userRow.id,
        email: userRow.email,
        displayName: userRow.display_name,
        status: userRow.status,
        createdAt: toIso(userRow.created_at)!,
        lastLoginAt: toIso(userRow.last_login_at),
        mfaEnabled: mfaUserIds.has(userRow.id),
        roleIds: roleIdsByUserId.get(userRow.id) ?? [],
        groupMemberships: membershipsByUserId.get(userRow.id) ?? [],
      }));
    },
    async listGroupsForUser(user) {
      const [groups, memberCounts, appGrantRows] = await Promise.all([
        database<GroupRow[]>`
          select id, name, description
          from groups
          where tenant_id = ${user.tenantId}
          order by name asc
        `,
        database<GroupMemberCountRow[]>`
          select
            group_id,
            count(*)::int as member_count,
            count(*) filter (where role = 'manager')::int as manager_count,
            count(*) filter (where is_primary = true)::int as primary_member_count
          from group_members
          where tenant_id = ${user.tenantId}
          group by group_id
        `,
        database<GroupAppGrantRow[]>`
          select
            gag.group_id,
            a.id as app_id,
            a.slug,
            a.name,
            a.short_code,
            a.status
          from workspace_group_app_grants gag
          inner join workspace_apps a on a.id = gag.app_id
          where gag.tenant_id = ${user.tenantId}
          order by a.name asc
        `,
      ]);

      const memberCountByGroupId = new Map(memberCounts.map(row => [row.group_id, row]));
      const appGrantsByGroupId = new Map<string, AdminGroupSummary['appGrants']>();

      for (const appGrantRow of appGrantRows) {
        const currentAppGrants = appGrantsByGroupId.get(appGrantRow.group_id) ?? [];
        currentAppGrants.push({
          id: appGrantRow.app_id,
          slug: appGrantRow.slug,
          name: appGrantRow.name,
          shortCode: appGrantRow.short_code,
          status: appGrantRow.status,
        });
        appGrantsByGroupId.set(appGrantRow.group_id, currentAppGrants);
      }

      return groups.map(groupRow => {
        const counts = memberCountByGroupId.get(groupRow.id);

        return {
          id: groupRow.id,
          name: groupRow.name,
          description: groupRow.description ?? '',
          memberCount: counts?.member_count ?? 0,
          managerCount: counts?.manager_count ?? 0,
          primaryMemberCount: counts?.primary_member_count ?? 0,
          appGrants: appGrantsByGroupId.get(groupRow.id) ?? [],
        };
      });
    },
    async listAppsForUser(user) {
      return listAppSummariesForTenant(database, user.tenantId);
    },
    async getCleanupStatusForUser(user) {
      const policy: AdminCleanupPolicy = buildWorkspaceCleanupPolicy();
      const preview: AdminCleanupPreview = await previewWorkspaceCleanup(
        database,
        user.tenantId,
      );
      const latestRun = await getLatestWorkspaceCleanupExecution(
        database,
        user.tenantId,
      );
      const lastRun: AdminCleanupLastRun | null = latestRun
        ? {
            actorUserId: latestRun.actorUserId,
            occurredAt: latestRun.occurredAt,
            summary: latestRun.summary,
          }
        : null;

      return {
        policy,
        preview,
        lastRun,
      };
    },
    async createAppGrantForUser(user, input) {
      const appId = input.appId.trim();
      const subjectUserEmail = normalizeEmail(input.subjectUserEmail);
      const effect = input.effect;
      const reason = input.reason?.trim() || null;

      if (!appId || !subjectUserEmail || (effect !== 'allow' && effect !== 'deny')) {
        return toMutationError(
          'ADMIN_INVALID_PAYLOAD',
          'Workspace app grants require an app id, target user email and allow/deny effect.',
          undefined,
          400
        );
      }

      const [appRow] = await database<{ id: string }[]>`
        select id
        from workspace_apps
        where tenant_id = ${user.tenantId}
          and id = ${appId}
        limit 1
      `;

      if (!appRow) {
        return toMutationError('ADMIN_NOT_FOUND', 'The target workspace app could not be found.', {
          appId,
        });
      }

      const [targetUser] = await database<TenantUserLookupRow[]>`
        select id, email, display_name, status
        from users
        where tenant_id = ${user.tenantId}
          and lower(email) = ${subjectUserEmail}
        limit 1
      `;

      if (!targetUser) {
        return toMutationError('ADMIN_NOT_FOUND', 'The target user could not be found in this tenant.', {
          subjectUserEmail,
        });
      }

      const [grantRow] = await database<AppUserGrantRow[]>`
        insert into workspace_app_access_grants (
          id,
          tenant_id,
          app_id,
          subject_type,
          subject_id,
          effect,
          reason,
          created_by_user_id,
          created_at
        )
        values (
          ${randomUUID()},
          ${user.tenantId},
          ${appId},
          'user',
          ${targetUser.id},
          ${effect},
          ${reason},
          ${user.id},
          now()
        )
        on conflict (tenant_id, app_id, subject_type, subject_id, effect) do nothing
        returning
          app_id,
          id,
          effect,
          reason,
          created_at,
          expires_at,
          created_by_user_id,
          ${targetUser.id}::varchar as user_id,
          ${targetUser.email}::varchar as user_email,
          ${targetUser.display_name}::varchar as user_display_name,
          ${targetUser.status}::varchar as user_status
      `;

      if (!grantRow) {
        return toMutationError(
          'ADMIN_CONFLICT',
          'This direct user grant already exists.',
          {
            appId,
            subjectUserEmail,
            effect,
          },
          409
        );
      }

      const apps = await listAppSummariesForTenant(database, user.tenantId);
      const app = apps.find(candidate => candidate.id === appId);

      if (!app) {
        return toMutationError('ADMIN_NOT_FOUND', 'The target workspace app could not be found.', {
          appId,
        });
      }

      return {
        ok: true,
        data: {
          app,
          grant: toAdminAppUserGrant(grantRow),
        },
      };
    },
    async revokeAppGrantForUser(user, input) {
      const appId = input.appId.trim();
      const grantId = input.grantId.trim();

      if (!appId || !grantId) {
        return toMutationError(
          'ADMIN_INVALID_PAYLOAD',
          'Workspace app grant revocation requires an app id and grant id.',
          undefined,
          400
        );
      }

      const [revokedGrantRow] = await database<AppUserGrantRow[]>`
        with revoked as (
          delete from workspace_app_access_grants
          where tenant_id = ${user.tenantId}
            and app_id = ${appId}
            and id = ${grantId}
            and subject_type = 'user'
          returning
            app_id,
            id,
            effect,
            reason,
            created_at,
            expires_at,
            created_by_user_id,
            subject_id
        )
        select
          revoked.app_id,
          revoked.id,
          revoked.effect,
          revoked.reason,
          revoked.created_at,
          revoked.expires_at,
          revoked.created_by_user_id,
          u.id as user_id,
          u.email as user_email,
          u.display_name as user_display_name,
          u.status as user_status
        from revoked
        inner join users u on u.id = revoked.subject_id
      `;

      if (!revokedGrantRow) {
        return toMutationError('ADMIN_NOT_FOUND', 'The target direct user grant could not be found.', {
          appId,
          grantId,
        });
      }

      const apps = await listAppSummariesForTenant(database, user.tenantId);
      const app = apps.find(candidate => candidate.id === appId);

      if (!app) {
        return toMutationError('ADMIN_NOT_FOUND', 'The target workspace app could not be found.', {
          appId,
        });
      }

      return {
        ok: true,
        data: {
          app,
          revokedGrantId: revokedGrantRow.id,
          revokedGrant: toAdminAppUserGrant(revokedGrantRow),
        },
      };
    },
    async listAuditForUser(user, filters = {}) {
      const normalizedFilters = normalizeAuditFilters(filters);
      const roleIds = await ensureDefaultRoles(database, user);
      const canReadPlatformAdmin = roleIds.includes('root_admin');
      const isPlatformScope = canReadPlatformAdmin && normalizedFilters.scope === 'platform';
      const tenantIdFilter = canReadPlatformAdmin
        ? normalizedFilters.tenantId
        : user.tenantId;
      const rows = await database<AuditEventRow[]>`
        select
          ae.id,
          ae.tenant_id,
          t.name as tenant_name,
          ae.actor_user_id,
          ae.action,
          ae.level,
          ae.entity_type,
          ae.entity_id,
          ae.ip_address,
          ae.payload,
          ae.occurred_at
        from audit_events ae
        left join tenants t on t.id = ae.tenant_id
        where (
            ${isPlatformScope}
            or ae.tenant_id = ${tenantIdFilter ?? user.tenantId}
          )
          and (${tenantIdFilter}::varchar is null or ae.tenant_id = ${tenantIdFilter})
          and (${normalizedFilters.action}::varchar is null or ae.action = ${normalizedFilters.action})
          and (${normalizedFilters.level}::varchar is null or ae.level = ${normalizedFilters.level})
          and (${normalizedFilters.actorUserId}::varchar is null or ae.actor_user_id = ${normalizedFilters.actorUserId})
          and (${normalizedFilters.entityType}::varchar is null or ae.entity_type = ${normalizedFilters.entityType})
          and (
            ${normalizedFilters.occurredAfter}::timestamptz is null
            or ae.occurred_at >= ${normalizedFilters.occurredAfter}::timestamptz
          )
          and (
            ${normalizedFilters.occurredBefore}::timestamptz is null
            or ae.occurred_at <= ${normalizedFilters.occurredBefore}::timestamptz
          )
        order by ae.occurred_at desc
      `;

      const filteredEvents = rows
        .map(row => toAuditEvent(row, normalizedFilters.payloadMode))
        .filter(event => {
          if (normalizedFilters.traceId && event.context.traceId !== normalizedFilters.traceId) {
            return false;
          }

          if (normalizedFilters.runId && event.context.runId !== normalizedFilters.runId) {
            return false;
          }

          if (
            normalizedFilters.conversationId &&
            event.context.conversationId !== normalizedFilters.conversationId
          ) {
            return false;
          }

          return true;
        });
      const tenantNameById = new Map<string, string>();

      if (filteredEvents.some(event => event.tenantId && !event.tenantName)) {
        const tenantSummaries = await listTenantSummaries(database);

        for (const tenant of tenantSummaries) {
          tenantNameById.set(tenant.id, tenant.name);
        }
      }

      const hydratedEvents = filteredEvents.map(event => {
        if (!event.tenantId || event.tenantName) {
          return event;
        }

        return {
          ...event,
          tenantName: tenantNameById.get(event.tenantId) ?? null,
        };
      });

      const countsByAction = [...hydratedEvents].reduce<Map<string, number>>((counts, event) => {
        counts.set(event.action, (counts.get(event.action) ?? 0) + 1);
        return counts;
      }, new Map<string, number>());
      const countsByTenant = [...hydratedEvents].reduce<Map<string, AdminAuditTenantCount>>(
        (counts, event) => {
          const tenantId = event.tenantId ?? 'tenant-unknown';
          const tenantName = event.tenantName ?? event.tenantId ?? 'Unknown tenant';
          const currentCount = counts.get(tenantId);

          if (currentCount) {
            currentCount.count += 1;
            return counts;
          }

          counts.set(tenantId, {
            tenantId,
            tenantName,
            count: 1,
          });

          return counts;
        },
        new Map<string, AdminAuditTenantCount>()
      );

      return {
        countsByAction: [...countsByAction.entries()]
          .map(([action, count]) => ({
            action,
            count,
          }))
          .sort((left, right) => {
            if (right.count !== left.count) {
              return right.count - left.count;
            }

            return left.action.localeCompare(right.action);
          }),
        countsByTenant: [...countsByTenant.values()].sort((left, right) => {
          if (right.count !== left.count) {
            return right.count - left.count;
          }

          return left.tenantName.localeCompare(right.tenantName);
        }),
        highRiskEventCount: hydratedEvents.filter(isHighRiskAuditEvent).length,
        events: hydratedEvents.slice(0, normalizedFilters.limit),
      };
    },
  };
}
