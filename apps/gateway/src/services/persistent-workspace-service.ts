import type { DatabaseClient } from '@agentifui/db';
import type { AuthUser } from '@agentifui/shared/auth';
import type { WorkspaceApp, WorkspaceGroup } from '@agentifui/shared/apps';
import { randomUUID } from 'node:crypto';

import {
  WORKSPACE_APPS,
  WORKSPACE_GROUPS,
  buildWorkspaceCatalog,
  resolveDefaultMemberGroupIds,
} from './workspace-catalog-fixtures.js';
import type { WorkspaceService } from './workspace-service.js';

type GroupRow = {
  description: string | null;
  id: string;
  name: string;
};

type WorkspaceAppRow = {
  granted_group_ids: string[];
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

async function listMemberGroupIds(database: DatabaseClient, userId: string) {
  const rows = await database<{ group_id: string }[]>`
    select group_id
    from group_members
    where user_id = ${userId}
    order by is_primary desc, created_at asc
  `;

  return rows.map(row => row.group_id);
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

async function ensureWorkspaceCatalogSeed(database: DatabaseClient, tenantId: string) {
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
    }
  }
}

function toWorkspaceGroup(row: GroupRow): WorkspaceGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
  };
}

function toWorkspaceApp(row: WorkspaceAppRow): WorkspaceApp {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    kind: row.kind,
    status: row.status,
    shortCode: row.short_code,
    tags: row.tags,
    grantedGroupIds: row.granted_group_ids,
    launchCost: row.launch_cost,
  };
}

export function createPersistentWorkspaceService(database: DatabaseClient): WorkspaceService {
  return {
    async getCatalogForUser(user) {
      const memberGroupIds = await ensureUserDefaultMemberships(database, user);

      const groups = await database<GroupRow[]>`
        select id, name, description
        from groups
        where id in ${database(memberGroupIds)}
      `;
      const apps = await database<WorkspaceAppRow[]>`
        select
          a.id,
          a.slug,
          a.name,
          a.summary,
          a.kind,
          a.status,
          a.short_code,
          a.tags,
          a.launch_cost,
          array_agg(g.group_id order by g.group_id) as granted_group_ids
        from workspace_apps a
        inner join workspace_group_app_grants g on g.app_id = a.id
        where a.tenant_id = ${user.tenantId}
          and g.group_id in ${database(memberGroupIds)}
        group by
          a.id,
          a.slug,
          a.name,
          a.summary,
          a.kind,
          a.status,
          a.short_code,
          a.tags,
          a.launch_cost,
          a.sort_order
        order by a.sort_order asc, a.name asc
      `;

      const groupsById = new Map(groups.map(group => [group.id, group]));

      return buildWorkspaceCatalog(user, {
        groups: memberGroupIds
          .map(groupId => groupsById.get(groupId))
          .filter((group): group is GroupRow => Boolean(group))
          .map(toWorkspaceGroup),
        memberGroupIds,
        apps: apps.map(toWorkspaceApp),
      });
    },
  };
}

export { ensureUserDefaultMemberships, ensureWorkspaceCatalogSeed };
