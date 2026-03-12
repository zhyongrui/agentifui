import type { DatabaseClient } from '@agentifui/db';
import type { AuthUser } from '@agentifui/shared/auth';
import {
  evaluateAppLaunch,
  type WorkspaceApp,
  type WorkspaceCatalog,
  type WorkspaceGroup,
  type WorkspacePreferences,
  type WorkspacePreferencesUpdateRequest,
} from '@agentifui/shared/apps';
import { randomUUID } from 'node:crypto';

import {
  WORKSPACE_APPS,
  WORKSPACE_GROUPS,
  WORKSPACE_ROLES,
  buildWorkspaceCatalog,
  resolveDefaultMemberGroupIds,
  resolveDefaultRoleIds,
} from './workspace-catalog-fixtures.js';
import type { WorkspaceLaunchResult, WorkspaceService } from './workspace-service.js';

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
  tags: string[] | string;
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

type WorkspacePreferencesRow = {
  default_active_group_id: string | null;
  favorite_app_ids: string[] | string;
  recent_app_ids: string[] | string;
  updated_at: Date | string;
};

type WorkspaceContext = {
  apps: WorkspaceApp[];
  groups: WorkspaceGroup[];
  memberGroupIds: string[];
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

function normalizeStringArray(value: string[] | string): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function toIso(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dedupeIds(value: string[]) {
  return [...new Set(value)];
}

function recordRecentApp(currentIds: string[], appId: string, limit = 4) {
  return [appId, ...currentIds.filter(currentId => currentId !== appId)].slice(0, limit);
}

function buildLaunchUrl(appSlug: string, launchId: string) {
  const params = new URLSearchParams({
    app: appSlug,
    launchId,
  });

  return `/apps?${params.toString()}`;
}

function buildEmptyPreferences(): WorkspacePreferences {
  return {
    favoriteAppIds: [],
    recentAppIds: [],
    defaultActiveGroupId: null,
    updatedAt: null,
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
    tags: normalizeStringArray(row.tags),
    grantedGroupIds,
    launchCost: row.launch_cost,
  };
}

function sanitizeWorkspacePreferences(
  input: WorkspacePreferences,
  context: WorkspaceContext
): WorkspacePreferences {
  const visibleAppIds = new Set(context.apps.map(app => app.id));

  return {
    favoriteAppIds: dedupeIds(input.favoriteAppIds).filter(appId => visibleAppIds.has(appId)),
    recentAppIds: dedupeIds(input.recentAppIds).filter(appId => visibleAppIds.has(appId)),
    defaultActiveGroupId:
      input.defaultActiveGroupId && context.memberGroupIds.includes(input.defaultActiveGroupId)
        ? input.defaultActiveGroupId
        : null,
    updatedAt: input.updatedAt,
  };
}

async function resolveWorkspaceContext(
  database: DatabaseClient,
  user: AuthUser
): Promise<WorkspaceContext> {
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

    if (accessGrantState.allowedGroupIds.size === 0 && !accessGrantState.hasNonGroupAllow) {
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

  return {
    groups: memberGroupIds
      .map(groupId => groupsById.get(groupId))
      .filter((group): group is GroupRow => Boolean(group))
      .map(toWorkspaceGroup),
    memberGroupIds,
    apps: visibleApps,
  };
}

async function readWorkspacePreferences(
  database: DatabaseClient,
  user: AuthUser,
  context: WorkspaceContext
): Promise<WorkspacePreferences> {
  const [row] = await database<WorkspacePreferencesRow[]>`
    select
      favorite_app_ids,
      recent_app_ids,
      default_active_group_id,
      updated_at
    from workspace_user_preferences
    where user_id = ${user.id}
    limit 1
  `;

  if (!row) {
    return buildEmptyPreferences();
  }

  return sanitizeWorkspacePreferences(
    {
      favoriteAppIds: normalizeStringArray(row.favorite_app_ids),
      recentAppIds: normalizeStringArray(row.recent_app_ids),
      defaultActiveGroupId: row.default_active_group_id,
      updatedAt: toIso(row.updated_at),
    },
    context
  );
}

async function upsertWorkspacePreferences(
  database: DatabaseClient,
  user: AuthUser,
  context: WorkspaceContext,
  input: WorkspacePreferencesUpdateRequest
): Promise<WorkspacePreferences> {
  const nextPreferences = sanitizeWorkspacePreferences(
    {
      favoriteAppIds: input.favoriteAppIds,
      recentAppIds: input.recentAppIds,
      defaultActiveGroupId: input.defaultActiveGroupId,
      updatedAt: new Date().toISOString(),
    },
    context
  );

  await database`
    insert into workspace_user_preferences (
      user_id,
      tenant_id,
      favorite_app_ids,
      recent_app_ids,
      default_active_group_id,
      created_at,
      updated_at
    )
    values (
      ${user.id},
      ${user.tenantId},
      ${JSON.stringify(nextPreferences.favoriteAppIds)}::jsonb,
      ${JSON.stringify(nextPreferences.recentAppIds)}::jsonb,
      ${nextPreferences.defaultActiveGroupId},
      now(),
      now()
    )
    on conflict (user_id) do update
    set favorite_app_ids = excluded.favorite_app_ids,
        recent_app_ids = excluded.recent_app_ids,
        default_active_group_id = excluded.default_active_group_id,
        updated_at = now()
  `;

  return nextPreferences;
}

export function createPersistentWorkspaceService(database: DatabaseClient): WorkspaceService {
  return {
    async getCatalogForUser(user) {
      const context = await resolveWorkspaceContext(database, user);
      const preferences = await readWorkspacePreferences(database, user, context);

      return buildWorkspaceCatalog(user, {
        groups: context.groups,
        memberGroupIds: context.memberGroupIds,
        apps: context.apps,
        preferences,
      });
    },
    async getPreferencesForUser(user) {
      const context = await resolveWorkspaceContext(database, user);

      return readWorkspacePreferences(database, user, context);
    },
    async updatePreferencesForUser(user, input) {
      const context = await resolveWorkspaceContext(database, user);

      return upsertWorkspacePreferences(database, user, context, input);
    },
    async launchAppForUser(user, input): Promise<WorkspaceLaunchResult> {
      const catalog = await this.getCatalogForUser(user);
      const app = catalog.apps.find(candidate => candidate.id === input.appId);

      if (!app) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace app could not be found.',
        };
      }

      const quotaUsages =
        catalog.quotaUsagesByGroupId[input.activeGroupId] ??
        catalog.quotaUsagesByGroupId[catalog.defaultActiveGroupId] ??
        [];
      const guard = evaluateAppLaunch({
        app,
        activeGroupId: input.activeGroupId,
        memberGroupIds: catalog.memberGroupIds,
        quotas: quotaUsages,
        quotaServiceState: catalog.quotaServiceState,
      });

      if (!guard.canLaunch || !guard.attributedGroupId) {
        return {
          ok: false,
          statusCode: 409,
          code: 'WORKSPACE_LAUNCH_BLOCKED',
          message: 'The workspace app launch is blocked by the current authorization or quota state.',
          details: guard,
        };
      }

      const attributedGroup = catalog.groups.find(group => group.id === guard.attributedGroupId);

      if (!attributedGroup) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The attributed workspace group could not be found.',
        };
      }

      const launchId = randomUUID();
      const launchedAt = new Date().toISOString();
      const launchUrl = buildLaunchUrl(app.slug, launchId);

      await database`
        insert into workspace_app_launches (
          id,
          tenant_id,
          user_id,
          app_id,
          attributed_group_id,
          status,
          launch_url,
          launched_at,
          created_at
        )
        values (
          ${launchId},
          ${user.tenantId},
          ${user.id},
          ${app.id},
          ${attributedGroup.id},
          'handoff_ready',
          ${launchUrl},
          ${launchedAt}::timestamptz,
          now()
        )
      `;

      const context = await resolveWorkspaceContext(database, user);
      await upsertWorkspacePreferences(database, user, context, {
        favoriteAppIds: catalog.favoriteAppIds,
        recentAppIds: recordRecentApp(catalog.recentAppIds, app.id),
        defaultActiveGroupId: attributedGroup.id,
      });

      return {
        ok: true,
        data: {
          id: launchId,
          status: 'handoff_ready',
          launchUrl,
          launchedAt,
          app: {
            id: app.id,
            slug: app.slug,
            name: app.name,
            summary: app.summary,
            kind: app.kind,
            status: app.status,
            shortCode: app.shortCode,
            launchCost: app.launchCost,
          },
          attributedGroup,
        },
      };
    },
  };
}

export { ensureUserDefaultMemberships, ensureWorkspaceCatalogSeed };
