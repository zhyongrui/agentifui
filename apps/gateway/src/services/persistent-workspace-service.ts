import type { DatabaseClient } from '@agentifui/db';
import type { AuthUser } from '@agentifui/shared/auth';
import {
  evaluateAppLaunch,
  type WorkspaceApp,
  type WorkspaceConversation,
  type WorkspaceConversationMessage,
  type WorkspaceGroup,
  type WorkspacePreferences,
  type WorkspacePreferencesUpdateRequest,
  type WorkspaceRunType,
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
import type {
  WorkspaceConversationResult,
  WorkspaceLaunchResult,
  WorkspaceRunUpdateInput,
  WorkspaceService,
} from './workspace-service.js';

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

type ConversationRow = {
  active_group_description: string | null;
  active_group_id: string | null;
  active_group_name: string | null;
  app_id: string;
  app_kind: WorkspaceApp['kind'];
  app_name: string;
  app_short_code: string;
  app_slug: string;
  app_status: WorkspaceApp['status'];
  app_summary: string;
  conversation_inputs: Record<string, unknown> | string;
  created_at: Date | string;
  id: string;
  launch_id: string | null;
  run_created_at: Date | string;
  run_id: string;
  run_status: WorkspaceConversation['run']['status'];
  run_trace_id: string;
  run_type: WorkspaceRunType;
  status: WorkspaceConversation['status'];
  title: string;
  updated_at: Date | string;
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

function normalizeJsonRecord(value: Record<string, unknown> | string | null | undefined) {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;

      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return value;
}

function recordRecentApp(currentIds: string[], appId: string, limit = 4) {
  return [appId, ...currentIds.filter(currentId => currentId !== appId)].slice(0, limit);
}

function buildLaunchUrl(conversationId: string) {
  return `/chat/${conversationId}`;
}

function buildTraceId() {
  return randomUUID().replace(/-/g, '');
}

function resolveRunType(kind: WorkspaceApp['kind']): WorkspaceRunType {
  if (kind === 'automation') {
    return 'workflow';
  }

  if (kind === 'chat') {
    return 'generation';
  }

  return 'agent';
}

function buildEmptyPreferences(): WorkspacePreferences {
  return {
    favoriteAppIds: [],
    recentAppIds: [],
    defaultActiveGroupId: null,
    updatedAt: null,
  };
}

function toWorkspaceConversationMessages(
  value: Record<string, unknown> | string | null | undefined
): WorkspaceConversationMessage[] {
  const rawMessageHistory = normalizeJsonRecord(value).messageHistory;
  const messageHistory =
    typeof rawMessageHistory === 'string'
      ? (() => {
          try {
            return JSON.parse(rawMessageHistory) as unknown;
          } catch {
            return [];
          }
        })()
      : rawMessageHistory;

  if (!Array.isArray(messageHistory)) {
    return [];
  }

  return messageHistory.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const message = entry as Record<string, unknown>;

    if (
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.id !== 'string' ||
      typeof message.content !== 'string' ||
      typeof message.status !== 'string' ||
      typeof message.createdAt !== 'string'
    ) {
      return [];
    }

    return [
      {
        id: message.id,
        role: message.role,
        content: message.content,
        status:
          message.status === 'streaming' ||
          message.status === 'stopped' ||
          message.status === 'failed'
            ? message.status
            : 'completed',
        createdAt: message.createdAt,
      },
    ];
  });
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

function toWorkspaceConversation(row: ConversationRow): WorkspaceConversation {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
    launchId: row.launch_id,
    app: {
      id: row.app_id,
      slug: row.app_slug,
      name: row.app_name,
      summary: row.app_summary,
      kind: row.app_kind,
      status: row.app_status,
      shortCode: row.app_short_code,
    },
    activeGroup: {
      id: row.active_group_id ?? '',
      name: row.active_group_name ?? 'Unknown group',
      description: row.active_group_description ?? '',
    },
    messages: toWorkspaceConversationMessages(row.conversation_inputs),
    run: {
      id: row.run_id,
      type: row.run_type,
      status: row.run_status,
      traceId: row.run_trace_id,
      createdAt: toIso(row.run_created_at)!,
    },
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

async function readConversationForUser(
  database: DatabaseClient,
  user: AuthUser,
  conversationId: string
): Promise<WorkspaceConversation | null> {
  const [row] = await database<ConversationRow[]>`
    select
      c.id,
      c.title,
      c.status,
      c.inputs as conversation_inputs,
      c.created_at,
      c.updated_at,
      l.id as launch_id,
      a.id as app_id,
      a.slug as app_slug,
      a.name as app_name,
      a.summary as app_summary,
      a.kind as app_kind,
      a.status as app_status,
      a.short_code as app_short_code,
      g.id as active_group_id,
      g.name as active_group_name,
      g.description as active_group_description,
      r.id as run_id,
      r.type as run_type,
      r.status as run_status,
      r.trace_id as run_trace_id,
      r.created_at as run_created_at
    from conversations c
    inner join workspace_apps a on a.id = c.app_id
    left join groups g on g.id = c.active_group_id
    inner join runs r on r.conversation_id = c.id
    left join workspace_app_launches l on l.conversation_id = c.id
    where c.id = ${conversationId}
      and c.user_id = ${user.id}
    order by r.created_at desc
    limit 1
  `;

  return row ? toWorkspaceConversation(row) : null;
}

async function updateConversationRunForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspaceRunUpdateInput
): Promise<WorkspaceConversation | null> {
  const finishedAt =
    input.finishedAt ??
    (input.status === 'succeeded' || input.status === 'failed' || input.status === 'stopped'
      ? new Date().toISOString()
      : null);
  const nextInputs = input.inputs ?? {};
  const nextOutputs = input.outputs ?? {};
  const nextUpdatedAt = finishedAt ?? new Date().toISOString();
  const errorMessage = input.error ?? null;
  const nextMessageHistory = input.messageHistory ?? [];
  const shouldUpdateMessageHistory = input.messageHistory !== undefined;

  const updated = await database.begin(async transaction => {
    const sql = transaction as unknown as DatabaseClient;
    const rows = await sql<{ id: string }[]>`
      update runs r
      set status = ${input.status},
          inputs = r.inputs || ${nextInputs}::jsonb,
          outputs = r.outputs || ${nextOutputs}::jsonb,
          error = case
            when ${errorMessage}::text is null then r.error
            else ${errorMessage}
          end,
          elapsed_time = coalesce(${input.elapsedTime ?? null}::integer, r.elapsed_time),
          total_tokens = coalesce(${input.totalTokens ?? null}::integer, r.total_tokens),
          total_steps = coalesce(${input.totalSteps ?? null}::integer, r.total_steps),
          finished_at = case
            when ${finishedAt}::timestamptz is null then r.finished_at
            else ${finishedAt}::timestamptz
          end
      from conversations c
      where r.id = ${input.runId}
        and r.conversation_id = ${input.conversationId}
        and c.id = r.conversation_id
        and c.user_id = ${user.id}
      returning r.id
    `;

    if (rows.length === 0) {
      return false;
    }

    if (shouldUpdateMessageHistory) {
      await sql`
        update conversations
        set updated_at = ${nextUpdatedAt}::timestamptz,
            inputs = jsonb_set(
              coalesce(inputs, '{}'::jsonb),
              '{messageHistory}',
              ${nextMessageHistory}::jsonb,
              true
            )
        where id = ${input.conversationId}
          and user_id = ${user.id}
      `;
    } else {
      await sql`
        update conversations
        set updated_at = ${nextUpdatedAt}::timestamptz
        where id = ${input.conversationId}
          and user_id = ${user.id}
      `;
    }

    return true;
  });

  if (!updated) {
    return null;
  }

  return readConversationForUser(database, user, input.conversationId);
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
      const conversationId = `conv_${randomUUID()}`;
      const runId = `run_${randomUUID()}`;
      const traceId = buildTraceId();
      const runType = resolveRunType(app.kind);
      const launchedAt = new Date().toISOString();
      const launchUrl = buildLaunchUrl(conversationId);

      await database.begin(async transaction => {
        const sql = transaction as unknown as DatabaseClient;

        await sql`
          insert into conversations (
            id,
            tenant_id,
            user_id,
            app_id,
            active_group_id,
            title,
            status,
            inputs,
            created_at,
            updated_at
          )
          values (
            ${conversationId},
            ${user.tenantId},
            ${user.id},
            ${app.id},
            ${attributedGroup.id},
            ${app.name},
            'active',
            '{"messageHistory":[]}'::jsonb,
            ${launchedAt}::timestamptz,
            ${launchedAt}::timestamptz
          )
        `;

        await sql`
          insert into runs (
            id,
            tenant_id,
            conversation_id,
            app_id,
            user_id,
            active_group_id,
            type,
            triggered_from,
            status,
            inputs,
            outputs,
            elapsed_time,
            total_tokens,
            total_steps,
            trace_id,
            created_at
          )
          values (
            ${runId},
            ${user.tenantId},
            ${conversationId},
            ${app.id},
            ${user.id},
            ${attributedGroup.id},
            ${runType},
            'app_launch',
            'pending',
            '{}'::jsonb,
            '{}'::jsonb,
            0,
            0,
            0,
            ${traceId},
            ${launchedAt}::timestamptz
          )
        `;

        await sql`
          insert into workspace_app_launches (
            id,
            tenant_id,
            user_id,
            app_id,
            attributed_group_id,
            status,
            conversation_id,
            run_id,
            trace_id,
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
            'conversation_ready',
            ${conversationId},
            ${runId},
            ${traceId},
            ${launchUrl},
            ${launchedAt}::timestamptz,
            now()
          )
        `;
      });

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
          status: 'conversation_ready',
          launchUrl,
          launchedAt,
          conversationId,
          runId,
          traceId,
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
    async getConversationForUser(user, conversationId): Promise<WorkspaceConversationResult> {
      const conversation = await readConversationForUser(database, user, conversationId);

      if (!conversation) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      return {
        ok: true,
        data: conversation,
      };
    },
    async updateConversationRunForUser(user, input): Promise<WorkspaceConversationResult> {
      const conversation = await updateConversationRunForUser(database, user, input);

      if (!conversation) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      return {
        ok: true,
        data: conversation,
      };
    },
  };
}

export { ensureUserDefaultMemberships, ensureWorkspaceCatalogSeed };
