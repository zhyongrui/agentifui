import type { DatabaseClient } from '@agentifui/db';
import type { AuthUser } from '@agentifui/shared/auth';
import type { WorkspaceApp, WorkspaceGroup } from '@agentifui/shared/apps';
import { randomUUID } from 'node:crypto';

import {
  WORKSPACE_APPS,
  WORKSPACE_GROUPS,
  WORKSPACE_ROLES,
  buildWorkspaceCatalog,
  resolveDefaultMemberGroupIds,
  resolveDefaultRoleIds,
} from './workspace-catalog-fixtures.js';
import type { WorkspaceService } from './workspace-service.js';

type GroupRow = {
  description: string | null;
  id: string;
  name: string;
};

type PersistedWorkspaceAppRow = {
  id: string;
  kind: WorkspaceApp['kind'];
  launch_cost: number;
  name: string;
  short_code: string;
  slug: string;
  status: WorkspaceApp['status'];
  summary: string;
  tags: string[];
};

type AccessGrantRow = {
  app_id: string;
  effect: 'allow' | 'deny';
  subject_id: string;
  subject_type: 'group' | 'user' | 'role';
};

type AccessGrantState = {
  allowedGroupIds: Set<string>;
  denied: boolean;
  hasNonGroupAllow: boolean;
};

async function listMemberGroupIds(database: DatabaseClient, userId: string) {
  const rows = await database<{ group_id: string }[]>`
    select group_id
    from group_members
    where user_id = ${userId}
    order by is_primary desc, created_at asc
  `;

  return rows.map(row => row.group_id);
}

async function listActiveRoleIds(database: DatabaseClient, userId: string) {
  const rows = await database<{ role_id: string }[]>`
    select role_id
    from rbac_user_roles
    where user_id = ${userId}
      and (expires_at is null or expires_at > now())
    order by created_at asc
  `;

  return rows.map(row => row.role_id);
}

async function ensureUserDefaultMemberships(database: DatabaseClient, user: AuthUser) {
  const existingGroupIds = await listMemberGroupIds(database, user.id);

  if (existingGroupIds.length > 0) {
    return existingGroupIds;
  }

  const defaultGroupIds = resolveDefaultMemberGroupIds(user.email);

  for (const [index, groupId] of defaultGroupIds.entries()) {
    await database`
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
        ${user.tenantId},
        ${groupId},
        ${user.id},
        'member',
        ${index === 0},
        now()
      )
      on conflict (group_id, user_id) do nothing
    `;
  }

  return defaultGroupIds;
}

async function ensureUserDefaultRoles(database: DatabaseClient, user: AuthUser) {
  const existingRoleIds = await listActiveRoleIds(database, user.id);

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

async function ensureWorkspaceCatalogSeed(database: DatabaseClient, tenantId: string) {
  for (const role of WORKSPACE_ROLES) {
    await database`
      insert into rbac_roles (
        id,
        name,
        display_name,
        description,
        scope,
        is_system,
        is_active,
        created_at
      )
      values (
        ${role.id},
        ${role.name},
        ${role.displayName},
        ${role.description},
        ${role.scope},
        ${role.isSystem},
        true,
        now()
      )
      on conflict (id) do update
      set name = excluded.name,
          display_name = excluded.display_name,
          description = excluded.description,
          scope = excluded.scope,
          is_system = excluded.is_system,
          is_active = true
    `;
  }

  for (const group of WORKSPACE_GROUPS) {
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
        ${group.id},
        ${tenantId},
        ${group.id.replace(/^grp_/, '').replace(/_/g, '-')},
        ${group.name},
        ${group.description},
        now(),
        now()
      )
      on conflict (id) do update
      set name = excluded.name,
          description = excluded.description,
          updated_at = now()
    `;
  }

  for (const app of WORKSPACE_APPS) {
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
        ${app.id},
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
      on conflict (id) do update
      set slug = excluded.slug,
          name = excluded.name,
          summary = excluded.summary,
          kind = excluded.kind,
          status = excluded.status,
          short_code = excluded.short_code,
          tags = excluded.tags,
          launch_cost = excluded.launch_cost,
          sort_order = excluded.sort_order,
          updated_at = now()
    `;
  }

  for (const app of WORKSPACE_APPS) {
    for (const groupId of app.grantedGroupIds) {
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
          ${groupId},
          ${app.id},
          now()
        )
        on conflict (group_id, app_id) do nothing
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
          ${app.id},
          'group',
          ${groupId},
          'allow',
          now()
        )
        on conflict (tenant_id, app_id, subject_type, subject_id, effect) do nothing
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
          ${app.id},
          'role',
          ${roleId},
          'allow',
          now()
        )
        on conflict (tenant_id, app_id, subject_type, subject_id, effect) do nothing
      `;
    }
  }
}

async function listRelevantAccessGrants(
  database: DatabaseClient,
  input: {
    memberGroupIds: string[];
    roleIds: string[];
    tenantId: string;
    userId: string;
  }
) {
  const rows = await database<AccessGrantRow[]>`
    select app_id, subject_type, subject_id, effect
    from workspace_app_access_grants
    where tenant_id = ${input.tenantId}
      and (expires_at is null or expires_at > now())
      and (
        (subject_type = 'group' and subject_id in ${database(input.memberGroupIds)})
        or (subject_type = 'user' and subject_id = ${input.userId})
        or (subject_type = 'role' and subject_id in ${database(input.roleIds)})
      )
  `;

  return rows;
}

function buildAccessGrantState(rows: AccessGrantRow[]) {
  const grantStateByAppId = new Map<string, AccessGrantState>();

  for (const row of rows) {
    const currentState = grantStateByAppId.get(row.app_id) ?? {
      allowedGroupIds: new Set<string>(),
      denied: false,
      hasNonGroupAllow: false,
    };

    if (row.effect === 'deny') {
      currentState.denied = true;
      grantStateByAppId.set(row.app_id, currentState);
      continue;
    }

    if (row.subject_type === 'group') {
      currentState.allowedGroupIds.add(row.subject_id);
    } else {
      currentState.hasNonGroupAllow = true;
    }

    grantStateByAppId.set(row.app_id, currentState);
  }

  return grantStateByAppId;
}

function toWorkspaceGroup(row: GroupRow): WorkspaceGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
  };
}

function toWorkspaceApp(row: PersistedWorkspaceAppRow, grantedGroupIds: string[]): WorkspaceApp {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    kind: row.kind,
    status: row.status,
    shortCode: row.short_code,
    tags: row.tags,
    grantedGroupIds,
    launchCost: row.launch_cost,
  };
}

export function createPersistentWorkspaceService(database: DatabaseClient): WorkspaceService {
  return {
    async getCatalogForUser(user) {
      const memberGroupIds = await ensureUserDefaultMemberships(database, user);
      const roleIds = await ensureUserDefaultRoles(database, user);

      const groups = await database<GroupRow[]>`
        select id, name, description
        from groups
        where id in ${database(memberGroupIds)}
      `;
      const accessGrantRows = await listRelevantAccessGrants(database, {
        tenantId: user.tenantId,
        userId: user.id,
        memberGroupIds,
        roleIds,
      });
      const candidateAppIds = [...new Set(accessGrantRows.map(row => row.app_id))];
      const apps =
        candidateAppIds.length === 0
          ? []
          : await database<PersistedWorkspaceAppRow[]>`
              select
                id,
                slug,
                name,
                summary,
                kind,
                status,
                short_code,
                tags,
                launch_cost
              from workspace_apps
              where id in ${database(candidateAppIds)}
              order by sort_order asc, name asc
            `;

      const groupsById = new Map(groups.map(group => [group.id, group]));
      const accessGrantStateByAppId = buildAccessGrantState(accessGrantRows);

      const visibleApps = apps.flatMap(app => {
        const accessGrantState = accessGrantStateByAppId.get(app.id);

        if (!accessGrantState || accessGrantState.denied) {
          return [];
        }

        if (
          accessGrantState.allowedGroupIds.size === 0 &&
          !accessGrantState.hasNonGroupAllow
        ) {
          return [];
        }

        const grantedGroupIds =
          accessGrantState.allowedGroupIds.size > 0
            ? memberGroupIds.filter(groupId => accessGrantState.allowedGroupIds.has(groupId))
            : [
                // The current workspace DTO is still group-attribution-based. For direct user or
                // role allows, reuse the member groups until the launch contract grows a non-group
                // attribution mode.
                ...memberGroupIds,
              ];

        return [toWorkspaceApp(app, grantedGroupIds)];
      });

      return buildWorkspaceCatalog(user, {
        groups: memberGroupIds
          .map(groupId => groupsById.get(groupId))
          .filter((group): group is GroupRow => Boolean(group))
          .map(toWorkspaceGroup),
        memberGroupIds,
        apps: visibleApps,
      });
    },
  };
}

export { ensureUserDefaultMemberships, ensureWorkspaceCatalogSeed };
