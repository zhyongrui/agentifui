import type { DatabaseClient } from '@agentifui/db';
import type { AuthAuditEvent, AuthUser } from '@agentifui/shared/auth';
import type {
  AdminAppSummary,
  AdminAuditActionCount,
  AdminGroupSummary,
  AdminUserSummary,
} from '@agentifui/shared/admin';
import { randomUUID } from 'node:crypto';

import type { AdminService } from './admin-service.js';
import { resolveDefaultRoleIds } from './workspace-catalog-fixtures.js';

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

type AuditEventRow = {
  action: string;
  actor_user_id: string | null;
  entity_id: string | null;
  entity_type: 'session' | 'user';
  id: string;
  ip_address: string | null;
  level: 'critical' | 'info' | 'warning';
  occurred_at: Date | string;
  payload: Record<string, unknown> | string;
  tenant_id: string | null;
};

type AuditCountRow = {
  action: string;
  count: number;
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

function toAuditEvent(row: AuditEventRow): AuthAuditEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    action: row.action as AuthAuditEvent['action'],
    level: row.level,
    entityType: row.entity_type,
    entityId: row.entity_id,
    ipAddress: row.ip_address,
    payload: normalizeJsonRecord(row.payload),
    occurredAt: toIso(row.occurred_at)!,
  };
}

export function createPersistentAdminService(database: DatabaseClient): AdminService {
  return {
    async canReadAdminForUser(user) {
      const roleIds = await ensureDefaultRoles(database, user);

      return roleIds.includes('tenant_admin') || roleIds.includes('root_admin');
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
      const [apps, groupGrantRows, accessGrantRows, launchRows] = await Promise.all([
        database<AppRow[]>`
          select id, slug, name, summary, kind, status, short_code, launch_cost
          from workspace_apps
          where tenant_id = ${user.tenantId}
          order by sort_order asc, name asc
        `,
        database<AppGroupGrantRow[]>`
          select
            gag.app_id,
            g.id as group_id,
            g.name as group_name
          from workspace_group_app_grants gag
          inner join groups g on g.id = gag.group_id
          where gag.tenant_id = ${user.tenantId}
          order by g.name asc
        `,
        database<AppAccessGrantRow[]>`
          select app_id, subject_type, subject_id, effect
          from workspace_app_access_grants
          where tenant_id = ${user.tenantId}
            and (expires_at is null or expires_at > now())
        `,
        database<AppLaunchRow[]>`
          select
            app_id,
            count(*)::int as launch_count,
            max(launched_at) as last_launched_at
          from workspace_app_launches
          where tenant_id = ${user.tenantId}
          group by app_id
        `,
      ]);

      const groupGrantsByAppId = new Map<string, AdminAppSummary['grantedGroups']>();
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
        };
      });
    },
    async listAuditForUser(user) {
      const [countsByActionRows, events] = await Promise.all([
        database<AuditCountRow[]>`
          select action, count(*)::int as count
          from audit_events
          where tenant_id = ${user.tenantId}
          group by action
          order by count(*) desc, action asc
        `,
        database<AuditEventRow[]>`
          select
            id,
            tenant_id,
            actor_user_id,
            action,
            level,
            entity_type,
            entity_id,
            ip_address,
            payload,
            occurred_at
          from audit_events
          where tenant_id = ${user.tenantId}
          order by occurred_at desc
          limit 40
        `,
      ]);

      return {
        countsByAction: countsByActionRows.map(row => ({
          action: row.action,
          count: row.count,
        })),
        events: events.map(toAuditEvent),
      };
    },
  };
}
