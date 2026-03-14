import type { DatabaseClient } from "@agentifui/db";
import type { AuthUser } from "@agentifui/shared/auth";
import {
  evaluateAppLaunch,
  type QuotaUsage,
  type WorkspaceApp,
  type WorkspaceArtifact,
  type WorkspaceArtifactJsonValue,
  type WorkspaceArtifactSummary,
  type WorkspaceCitation,
  type WorkspaceConversationAttachment,
  type WorkspaceConversation,
  type WorkspaceConversationMessageFeedback,
  type WorkspaceConversationListItem,
  type WorkspaceConversationShare,
  type WorkspaceConversationMessage,
  type WorkspaceConversationStatus,
  type WorkspaceGroup,
  type WorkspaceMessageFeedbackRating,
  type WorkspacePreferences,
  type WorkspacePreferencesUpdateRequest,
  type WorkspaceRun,
  type WorkspaceRunSummary,
  type WorkspaceRunTimelineEvent,
  type WorkspaceRunTimelineEventType,
  type WorkspaceRunTrigger,
  type WorkspaceRunType,
  type WorkspaceSourceBlock,
} from "@agentifui/shared/apps";
import { createHash, randomUUID } from "node:crypto";

import {
  WORKSPACE_APPS,
  WORKSPACE_GROUPS,
  WORKSPACE_ROLES,
  buildWorkspaceCatalog,
  resolveDefaultMemberGroupIds,
  resolveDefaultRoleIds,
} from "./workspace-catalog-fixtures.js";
import type {
  WorkspaceArtifactResult,
  WorkspaceConversationAttachmentLookupInput,
  WorkspaceConversationAttachmentLookupResult,
  WorkspaceConversationListInput,
  WorkspaceConversationListResult,
  WorkspaceConversationMessageFeedbackResult,
  WorkspaceConversationMessageFeedbackUpdateInput,
  WorkspaceConversationResult,
  WorkspaceConversationRunsResult,
  WorkspaceConversationShareCreateInput,
  WorkspaceConversationShareResult,
  WorkspaceConversationShareRevokeInput,
  WorkspaceConversationSharesResult,
  WorkspaceConversationUpdateInput,
  WorkspaceConversationUploadInput,
  WorkspaceConversationUploadResult,
  WorkspaceLaunchResult,
  WorkspacePendingActionRespondInput,
  WorkspacePendingActionRespondResult,
  WorkspacePendingActionsResult,
  WorkspaceRunCreateInput,
  WorkspaceRunResult,
  WorkspaceRunTimelineEventAppendInput,
  WorkspaceRunUpdateInput,
  WorkspaceService,
  WorkspaceSharedArtifactLookupInput,
  WorkspaceSharedConversationResult,
} from "./workspace-service.js";
import type { WorkspaceFileStorage } from "./workspace-file-storage.js";
import { parseWorkspaceRunFailure } from "./workspace-run-failure.js";
import {
  applyWorkspaceHitlStepResponse,
  expireWorkspaceHitlSteps,
  parseWorkspaceHitlSteps,
} from "./workspace-hitl.js";
import {
  buildDefaultQuotaLimitRecords,
  buildQuotaUsagesByGroupId,
  calculateCompletionQuotaCost,
  type WorkspaceQuotaLimitRecord,
} from "./workspace-quota.js";

type GroupRow = {
  description: string | null;
  id: string;
  name: string;
};

type PersistedWorkspaceAppRow = {
  id: string;
  kind: WorkspaceApp["kind"];
  launch_cost: number;
  name: string;
  short_code: string;
  slug: string;
  status: WorkspaceApp["status"];
  summary: string;
  tags: string[] | string;
};

type AccessGrantRow = {
  app_id: string;
  effect: "allow" | "deny";
  subject_id: string;
  subject_type: "group" | "user" | "role";
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

type WorkspaceQuotaLimitRow = {
  base_used: number;
  monthly_limit: number;
  scope: "tenant" | "group" | "user";
  scope_id: string;
  scope_label: string;
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
  app_kind: WorkspaceApp["kind"];
  app_name: string;
  app_short_code: string;
  app_slug: string;
  app_status: WorkspaceApp["status"];
  app_summary: string;
  app_tags: string[] | string;
  conversation_inputs: Record<string, unknown> | string;
  created_at: Date | string;
  id: string;
  launch_id: string | null;
  pinned: boolean;
  run_created_at: Date | string;
  run_elapsed_time: number;
  run_finished_at: Date | string | null;
  run_id: string;
  run_status: WorkspaceConversation["run"]["status"];
  run_total_steps: number;
  run_total_tokens: number;
  run_trace_id: string;
  run_triggered_from: WorkspaceRunTrigger;
  run_type: WorkspaceRunType;
  status: WorkspaceConversation["status"];
  title: string;
  updated_at: Date | string;
};

type WorkspaceRunRow = {
  active_group_description: string | null;
  active_group_id: string | null;
  active_group_name: string | null;
  app_id: string;
  app_kind: WorkspaceApp["kind"];
  app_name: string;
  app_short_code: string;
  app_slug: string;
  app_status: WorkspaceApp["status"];
  app_summary: string;
  conversation_id: string;
  created_at: Date | string;
  elapsed_time: number;
  error: string | null;
  finished_at: Date | string | null;
  id: string;
  inputs: Record<string, unknown> | string;
  outputs: Record<string, unknown> | string;
  status: WorkspaceConversation["run"]["status"];
  total_steps: number;
  total_tokens: number;
  trace_id: string;
  triggered_from: WorkspaceRunTrigger;
  type: WorkspaceRunType;
};

type WorkspaceArtifactRow = {
  conversation_id: string;
  created_at: Date | string;
  id: string;
  kind: WorkspaceArtifact["kind"];
  mime_type: string | null;
  payload: Record<string, unknown> | string;
  run_id: string;
  sequence: number;
  size_bytes: number | null;
  source: WorkspaceArtifact["source"];
  status: WorkspaceArtifact["status"];
  summary: string | null;
  title: string;
  updated_at: Date | string;
  user_id: string;
};

type WorkspaceRunTimelineEventRow = {
  created_at: Date | string;
  event_type: WorkspaceRunTimelineEventType;
  id: string;
  metadata: Record<string, unknown> | string;
};

type WorkspaceUploadedFileRow = {
  content_type: string;
  created_at: Date | string;
  file_name: string;
  id: string;
  size_bytes: number;
};

type WorkspaceConversationShareRow = {
  conversation_id: string;
  created_at: Date | string;
  group_description: string | null;
  group_id: string;
  group_name: string;
  id: string;
  revoked_at: Date | string | null;
  status: WorkspaceConversationShare["status"];
};

async function listMemberGroupIds(database: DatabaseClient, userId: string) {
  const rows = await database<{ group_id: string }[]>`
    select group_id
    from group_members
    where user_id = ${userId}
    order by is_primary desc, created_at asc
  `;

  return rows.map((row) => row.group_id);
}

async function listActiveRoleIds(database: DatabaseClient, userId: string) {
  const rows = await database<{ role_id: string }[]>`
    select role_id
    from rbac_user_roles
    where user_id = ${userId}
      and (expires_at is null or expires_at > now())
    order by created_at asc
  `;

  return rows.map((row) => row.role_id);
}

async function ensureUserDefaultMemberships(
  database: DatabaseClient,
  user: AuthUser,
) {
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

async function ensureUserDefaultRoles(
  database: DatabaseClient,
  user: AuthUser,
) {
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

async function ensureWorkspaceCatalogSeed(
  database: DatabaseClient,
  tenantId: string,
) {
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
        ${group.id.replace(/^grp_/, "").replace(/_/g, "-")},
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
  },
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

    if (row.effect === "deny") {
      currentState.denied = true;
      grantStateByAppId.set(row.app_id, currentState);
      continue;
    }

    if (row.subject_type === "group") {
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
    description: row.description ?? "",
  };
}

function normalizeStringArray(value: string[] | string): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function toIso(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function dedupeIds(value: string[]) {
  return [...new Set(value)];
}

function normalizeJsonRecord(
  value: Record<string, unknown> | string | null | undefined,
) {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;

      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return value;
}

function recordRecentApp(currentIds: string[], appId: string, limit = 4) {
  return [
    appId,
    ...currentIds.filter((currentId) => currentId !== appId),
  ].slice(0, limit);
}

function buildLaunchUrl(conversationId: string) {
  return `/chat/${conversationId}`;
}

function buildShareUrl(shareId: string) {
  return `/chat/shared/${shareId}`;
}

function buildTraceId() {
  return randomUUID().replace(/-/g, "");
}

function resolveRunType(kind: WorkspaceApp["kind"]): WorkspaceRunType {
  if (kind === "automation") {
    return "workflow";
  }

  if (kind === "chat") {
    return "generation";
  }

  return "agent";
}

function buildEmptyPreferences(): WorkspacePreferences {
  return {
    favoriteAppIds: [],
    recentAppIds: [],
    defaultActiveGroupId: null,
    updatedAt: null,
  };
}

function toWorkspaceConversationAttachments(
  value: unknown,
): WorkspaceConversationAttachment[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const attachments = value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const attachment = entry as Record<string, unknown>;

    if (
      typeof attachment.id !== "string" ||
      typeof attachment.fileName !== "string" ||
      typeof attachment.contentType !== "string" ||
      typeof attachment.sizeBytes !== "number" ||
      typeof attachment.uploadedAt !== "string"
    ) {
      return [];
    }

    return [
      {
        id: attachment.id,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        uploadedAt: attachment.uploadedAt,
      },
    ];
  });

  return attachments.length > 0 ? attachments : undefined;
}

function toWorkspaceConversationMessageFeedback(
  value: unknown,
): WorkspaceConversationMessageFeedback | null | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const feedback = value as Record<string, unknown>;

  if (
    (feedback.rating !== "positive" && feedback.rating !== "negative") ||
    typeof feedback.updatedAt !== "string"
  ) {
    return undefined;
  }

  return {
    rating: feedback.rating,
    updatedAt: feedback.updatedAt,
  };
}

function toWorkspaceConversationSuggestedPrompts(
  value: unknown,
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const prompts = [
    ...new Set(
      value
        .filter((entry) => typeof entry === "string")
        .map((prompt) => prompt.trim()),
    ),
  ].filter((prompt) => prompt.length > 0);

  return prompts.length > 0 ? prompts.slice(0, 3) : undefined;
}

function toWorkspaceCitation(value: unknown): WorkspaceCitation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const citation = value as Record<string, unknown>;

  if (
    typeof citation.id !== "string" ||
    typeof citation.label !== "string" ||
    typeof citation.title !== "string" ||
    typeof citation.sourceBlockId !== "string"
  ) {
    return null;
  }

  return {
    id: citation.id,
    label: citation.label,
    title: citation.title,
    sourceBlockId: citation.sourceBlockId,
    href: typeof citation.href === "string" ? citation.href : null,
    snippet: typeof citation.snippet === "string" ? citation.snippet : null,
  };
}

function toWorkspaceCitations(value: unknown): WorkspaceCitation[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const citations = value.flatMap((entry) => {
    const citation = toWorkspaceCitation(entry);
    return citation ? [citation] : [];
  });

  return citations.length > 0 ? citations : undefined;
}

function toWorkspaceSourceBlock(value: unknown): WorkspaceSourceBlock | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const sourceBlock = value as Record<string, unknown>;

  if (
    typeof sourceBlock.id !== "string" ||
    typeof sourceBlock.title !== "string" ||
    typeof sourceBlock.kind !== "string"
  ) {
    return null;
  }

  const metadata =
    typeof sourceBlock.metadata === "object" && sourceBlock.metadata !== null
      ? Object.fromEntries(
          Object.entries(sourceBlock.metadata as Record<string, unknown>).flatMap(
            ([key, metadataValue]) =>
              typeof metadataValue === "string" ? [[key, metadataValue]] : [],
          ),
        )
      : {};

  return {
    id: sourceBlock.id,
    kind: sourceBlock.kind as WorkspaceSourceBlock["kind"],
    title: sourceBlock.title,
    href: typeof sourceBlock.href === "string" ? sourceBlock.href : null,
    snippet:
      typeof sourceBlock.snippet === "string" ? sourceBlock.snippet : null,
    metadata,
  };
}

function toWorkspaceSourceBlocks(
  value: unknown,
): WorkspaceSourceBlock[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sourceBlocks = value.flatMap((entry) => {
    const sourceBlock = toWorkspaceSourceBlock(entry);
    return sourceBlock ? [sourceBlock] : [];
  });

  return sourceBlocks.length > 0 ? sourceBlocks : undefined;
}

function isWorkspaceArtifactKind(
  value: unknown,
): value is WorkspaceArtifact["kind"] {
  return ["text", "markdown", "json", "table", "link"].includes(String(value));
}

function isWorkspaceArtifactSource(
  value: unknown,
): value is WorkspaceArtifact["source"] {
  return ["assistant_response", "tool_output", "user_upload"].includes(
    String(value),
  );
}

function isWorkspaceArtifactStatus(
  value: unknown,
): value is WorkspaceArtifact["status"] {
  return ["draft", "stable"].includes(String(value));
}

function toWorkspaceArtifactSummary(
  value: unknown,
): WorkspaceArtifactSummary | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const artifact = value as Record<string, unknown>;

  if (
    typeof artifact.id !== "string" ||
    typeof artifact.title !== "string" ||
    !isWorkspaceArtifactKind(artifact.kind) ||
    !isWorkspaceArtifactSource(artifact.source) ||
    !isWorkspaceArtifactStatus(artifact.status) ||
    typeof artifact.createdAt !== "string" ||
    typeof artifact.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    source: artifact.source,
    status: artifact.status,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    summary: typeof artifact.summary === "string" ? artifact.summary : null,
    mimeType:
      typeof artifact.mimeType === "string" ? artifact.mimeType : null,
    sizeBytes:
      typeof artifact.sizeBytes === "number" ? artifact.sizeBytes : null,
  };
}

function toWorkspaceArtifact(value: unknown): WorkspaceArtifact | null {
  const summary = toWorkspaceArtifactSummary(value);

  if (!summary || typeof value !== "object" || value === null) {
    return null;
  }

  const artifact = value as Record<string, unknown>;

  if (
    (summary.kind === "text" || summary.kind === "markdown") &&
    typeof artifact.content === "string"
  ) {
    return {
      ...summary,
      kind: summary.kind,
      content: artifact.content,
    };
  }

  if (summary.kind === "json" && artifact.content !== undefined) {
    return {
      ...summary,
      kind: "json",
      content: artifact.content as WorkspaceArtifactJsonValue,
    };
  }

  if (
    summary.kind === "table" &&
    Array.isArray(artifact.columns) &&
    artifact.columns.every((column) => typeof column === "string") &&
    Array.isArray(artifact.rows) &&
    artifact.rows.every(
      (row) =>
        Array.isArray(row) &&
        row.every(
          (cell) =>
            typeof cell === "string" ||
            typeof cell === "number" ||
            typeof cell === "boolean" ||
            cell === null,
        ),
    )
  ) {
    return {
      ...summary,
      kind: "table",
      columns: artifact.columns,
      rows: artifact.rows,
    };
  }

  if (
    summary.kind === "link" &&
    typeof artifact.href === "string" &&
    typeof artifact.label === "string"
  ) {
    return {
      ...summary,
      kind: "link",
      href: artifact.href,
      label: artifact.label,
    };
  }

  return null;
}

function toWorkspaceArtifactSummaries(value: unknown): WorkspaceArtifactSummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const artifacts = value.flatMap((entry) => {
    const artifact = toWorkspaceArtifactSummary(entry);
    return artifact ? [artifact] : [];
  });

  return artifacts.length > 0 ? artifacts : undefined;
}

function toWorkspaceArtifacts(value: unknown): WorkspaceArtifact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const artifact = toWorkspaceArtifact(entry);
    return artifact ? [artifact] : [];
  });
}

function toWorkspaceArtifactFromRow(row: WorkspaceArtifactRow): WorkspaceArtifact | null {
  const payload = normalizeJsonRecord(row.payload);
  const summary: WorkspaceArtifactSummary = {
    id: row.id,
    title: row.title,
    kind: row.kind,
    source: row.source,
    status: row.status,
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
    summary: row.summary,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
  };

  return toWorkspaceArtifact({
    ...summary,
    ...payload,
  });
}

function toWorkspaceConversationMessages(
  value: Record<string, unknown> | string | null | undefined,
): WorkspaceConversationMessage[] {
  const rawMessageHistory = normalizeJsonRecord(value).messageHistory;
  const messageHistory =
    typeof rawMessageHistory === "string"
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

  return messageHistory.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const message = entry as Record<string, unknown>;

    if (
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.id !== "string" ||
      typeof message.content !== "string" ||
      typeof message.status !== "string" ||
      typeof message.createdAt !== "string"
    ) {
      return [];
    }

    return [
      {
        id: message.id,
        role: message.role,
        content: message.content,
        status:
          message.status === "streaming" ||
          message.status === "stopped" ||
          message.status === "failed"
            ? message.status
            : "completed",
        createdAt: message.createdAt,
        attachments: toWorkspaceConversationAttachments(message.attachments),
        artifacts: toWorkspaceArtifactSummaries(message.artifacts),
        citations: toWorkspaceCitations(message.citations),
        feedback: toWorkspaceConversationMessageFeedback(message.feedback),
        suggestedPrompts: toWorkspaceConversationSuggestedPrompts(
          message.suggestedPrompts,
        ),
      },
    ];
  });
}

function buildMessageFeedback(
  rating: WorkspaceMessageFeedbackRating | null,
): WorkspaceConversationMessageFeedback | null {
  if (!rating) {
    return null;
  }

  return {
    rating,
    updatedAt: new Date().toISOString(),
  };
}

function toWorkspaceConversationAttachment(
  row: WorkspaceUploadedFileRow,
): WorkspaceConversationAttachment {
  return {
    id: row.id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedAt: toIso(row.created_at)!,
  };
}

function toWorkspaceConversationShare(
  row: WorkspaceConversationShareRow,
): WorkspaceConversationShare {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    status: row.status,
    access: "read_only",
    shareUrl: buildShareUrl(row.id),
    group: {
      id: row.group_id,
      name: row.group_name,
      description: row.group_description ?? "",
    },
    createdAt: toIso(row.created_at)!,
    revokedAt: toIso(row.revoked_at),
  };
}

function toWorkspaceApp(
  row: PersistedWorkspaceAppRow,
  grantedGroupIds: string[],
): WorkspaceApp {
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
  context: WorkspaceContext,
): WorkspacePreferences {
  const visibleAppIds = new Set(context.apps.map((app) => app.id));

  return {
    favoriteAppIds: dedupeIds(input.favoriteAppIds).filter((appId) =>
      visibleAppIds.has(appId),
    ),
    recentAppIds: dedupeIds(input.recentAppIds).filter((appId) =>
      visibleAppIds.has(appId),
    ),
    defaultActiveGroupId:
      input.defaultActiveGroupId &&
      context.memberGroupIds.includes(input.defaultActiveGroupId)
        ? input.defaultActiveGroupId
        : null,
    updatedAt: input.updatedAt,
  };
}

function toWorkspaceRunSummary(
  row:
    | Pick<
        ConversationRow,
        | "run_created_at"
        | "run_elapsed_time"
        | "run_finished_at"
        | "run_id"
        | "run_status"
        | "run_total_steps"
        | "run_total_tokens"
        | "run_trace_id"
        | "run_triggered_from"
        | "run_type"
      >
    | Pick<
        WorkspaceRunRow,
        | "created_at"
        | "elapsed_time"
        | "finished_at"
        | "id"
        | "status"
        | "total_steps"
        | "total_tokens"
        | "trace_id"
        | "triggered_from"
        | "type"
      >,
): WorkspaceRunSummary {
  if ("run_id" in row) {
    return {
      id: row.run_id,
      type: row.run_type,
      status: row.run_status,
      triggeredFrom: row.run_triggered_from,
      traceId: row.run_trace_id,
      createdAt: toIso(row.run_created_at)!,
      finishedAt: toIso(row.run_finished_at),
      elapsedTime: row.run_elapsed_time,
      totalTokens: row.run_total_tokens,
      totalSteps: row.run_total_steps,
    };
  }

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    triggeredFrom: row.triggered_from,
    traceId: row.trace_id,
    createdAt: toIso(row.created_at)!,
    finishedAt: toIso(row.finished_at),
    elapsedTime: row.elapsed_time,
    totalTokens: row.total_tokens,
    totalSteps: row.total_steps,
  };
}

function toWorkspaceRunUsage(
  outputs: Record<string, unknown> | string,
  totalTokens: number,
): WorkspaceRun["usage"] {
  const usage = normalizeJsonRecord(outputs).usage;

  if (typeof usage !== "object" || usage === null) {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens,
    };
  }

  const usageRecord = usage as Record<string, unknown>;

  return {
    promptTokens:
      typeof usageRecord.promptTokens === "number"
        ? Math.max(usageRecord.promptTokens, 0)
        : 0,
    completionTokens:
      typeof usageRecord.completionTokens === "number"
        ? Math.max(usageRecord.completionTokens, 0)
        : 0,
    totalTokens:
      typeof usageRecord.totalTokens === "number"
        ? Math.max(usageRecord.totalTokens, 0)
        : totalTokens,
  };
}

function toWorkspaceConversation(row: ConversationRow): WorkspaceConversation {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    pinned: row.pinned,
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
      id: row.active_group_id ?? "",
      name: row.active_group_name ?? "Unknown group",
      description: row.active_group_description ?? "",
    },
    messages: toWorkspaceConversationMessages(row.conversation_inputs),
    run: toWorkspaceRunSummary(row),
  };
}

function toWorkspaceRun(row: WorkspaceRunRow): WorkspaceRun {
  return {
    ...toWorkspaceRunSummary(row),
    conversationId: row.conversation_id,
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
      id: row.active_group_id ?? "",
      name: row.active_group_name ?? "Unknown group",
      description: row.active_group_description ?? "",
    },
    error: row.error,
    failure: parseWorkspaceRunFailure(normalizeJsonRecord(row.outputs).failure, {
      error: row.error,
      recordedAt: toIso(row.finished_at) ?? toIso(row.created_at),
    }),
    inputs: normalizeJsonRecord(row.inputs),
    outputs: normalizeJsonRecord(row.outputs),
    artifacts: toWorkspaceArtifacts(normalizeJsonRecord(row.outputs).artifacts),
    citations: toWorkspaceCitations(normalizeJsonRecord(row.outputs).citations) ?? [],
    sourceBlocks:
      toWorkspaceSourceBlocks(normalizeJsonRecord(row.outputs).sourceBlocks) ??
      [],
    usage: toWorkspaceRunUsage(row.outputs, row.total_tokens),
    timeline: [],
  };
}

function toWorkspaceRunTimelineEvent(
  row: WorkspaceRunTimelineEventRow,
): WorkspaceRunTimelineEvent {
  return {
    id: row.id,
    type: row.event_type,
    createdAt: toIso(row.created_at)!,
    metadata: normalizeJsonRecord(row.metadata),
  };
}

function buildConversationHistoryMetadata(
  messages: WorkspaceConversationMessage[],
): Pick<
  WorkspaceConversationListItem,
  "attachmentCount" | "feedbackSummary" | "lastMessagePreview" | "messageCount"
> {
  const lastMessage = messages[messages.length - 1];
  let attachmentCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;

  for (const message of messages) {
    attachmentCount += message.attachments?.length ?? 0;

    if (message.feedback?.rating === "positive") {
      positiveCount += 1;
    }

    if (message.feedback?.rating === "negative") {
      negativeCount += 1;
    }
  }

  if (!lastMessage) {
    return {
      attachmentCount,
      feedbackSummary: {
        positiveCount,
        negativeCount,
      },
      lastMessagePreview: null,
      messageCount: 0,
    };
  }

  const normalized = lastMessage.content.replace(/\s+/g, " ").trim();

  return {
    attachmentCount,
    feedbackSummary: {
      positiveCount,
      negativeCount,
    },
    lastMessagePreview:
      normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized,
    messageCount: messages.length,
  };
}

function conversationMatchesListFilters(input: {
  appTags: string[];
  conversation: WorkspaceConversation;
  filters: WorkspaceConversationListInput;
}) {
  const { appTags, conversation, filters } = input;
  const normalizedTag = filters.tag?.trim().toLowerCase() || null;
  const normalizedQuery = filters.query?.trim().toLowerCase() || null;

  if (filters.status && conversation.status !== filters.status) {
    return false;
  }

  if (
    normalizedTag &&
    !appTags.some((tag) => tag.toLowerCase() === normalizedTag)
  ) {
    return false;
  }

  const history = buildConversationHistoryMetadata(conversation.messages);

  if (
    filters.attachment === "with_attachments" &&
    history.attachmentCount === 0
  ) {
    return false;
  }

  if (filters.feedback === "any") {
    if (
      history.feedbackSummary.positiveCount +
        history.feedbackSummary.negativeCount ===
      0
    ) {
      return false;
    }
  } else if (
    filters.feedback === "positive" &&
    history.feedbackSummary.positiveCount === 0
  ) {
    return false;
  } else if (
    filters.feedback === "negative" &&
    history.feedbackSummary.negativeCount === 0
  ) {
    return false;
  }

  if (normalizedQuery) {
    const haystack = [
      conversation.title,
      conversation.app.name,
      ...appTags,
      ...conversation.messages.map((message) => message.content),
    ]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(normalizedQuery)) {
      return false;
    }
  }

  return true;
}

function toWorkspaceConversationListItem(
  row: ConversationRow,
): WorkspaceConversationListItem {
  const conversation = toWorkspaceConversation(row);
  const preview = buildConversationHistoryMetadata(conversation.messages);

  return {
    id: conversation.id,
    title: conversation.title,
    status: conversation.status,
    pinned: conversation.pinned,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    attachmentCount: preview.attachmentCount,
    feedbackSummary: preview.feedbackSummary,
    messageCount: preview.messageCount,
    lastMessagePreview: preview.lastMessagePreview,
    app: conversation.app,
    activeGroup: conversation.activeGroup,
    run: conversation.run,
  };
}

async function resolveWorkspaceContext(
  database: DatabaseClient,
  user: AuthUser,
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
  const candidateAppIds = [
    ...new Set(accessGrantRows.map((row) => row.app_id)),
  ];
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

  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const accessGrantStateByAppId = buildAccessGrantState(accessGrantRows);
  const visibleApps = apps.flatMap((app) => {
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
        ? memberGroupIds.filter((groupId) =>
            accessGrantState.allowedGroupIds.has(groupId),
          )
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
      .map((groupId) => groupsById.get(groupId))
      .filter((group): group is GroupRow => Boolean(group))
      .map(toWorkspaceGroup),
    memberGroupIds,
    apps: visibleApps,
  };
}

async function readWorkspacePreferences(
  database: DatabaseClient,
  user: AuthUser,
  context: WorkspaceContext,
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
    context,
  );
}

async function ensureWorkspaceQuotaLimits(
  database: DatabaseClient,
  user: AuthUser,
  context: WorkspaceContext,
): Promise<WorkspaceQuotaLimitRecord[]> {
  const seeds = buildDefaultQuotaLimitRecords(user, context.memberGroupIds);

  await database.begin(async (transaction) => {
    const sql = transaction as unknown as DatabaseClient;

    for (const seed of seeds) {
      await sql`
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
          ${`quota_${user.tenantId}_${seed.scope}_${seed.scopeId}`},
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
  });

  const rows = await database<WorkspaceQuotaLimitRow[]>`
    select
      scope,
      scope_id,
      scope_label,
      monthly_limit,
      base_used
    from workspace_quota_limits
    where tenant_id = ${user.tenantId}
      and (
        (scope = 'tenant' and scope_id = ${user.tenantId})
        or (scope = 'user' and scope_id = ${user.id})
        or (scope = 'group' and scope_id in ${database(context.memberGroupIds)})
      )
    order by scope asc, scope_id asc
  `;

  return rows.map((row) => ({
    scope: row.scope,
    scopeId: row.scope_id,
    scopeLabel: row.scope_label,
    limit: row.monthly_limit,
    baseUsed: row.base_used,
  }));
}

async function readWorkspaceQuotaSnapshot(
  database: DatabaseClient,
  user: AuthUser,
  context: WorkspaceContext,
): Promise<{
  quotaServiceState: "available";
  quotaUsagesByGroupId: Record<string, QuotaUsage[]>;
}> {
  const quotaLimits = await ensureWorkspaceQuotaLimits(database, user, context);
  const launchRows = await database<
    {
      active_group_id: string | null;
      launch_cost: number;
      user_id: string;
    }[]
  >`
    select
      launches.attributed_group_id as active_group_id,
      apps.launch_cost,
      launches.user_id
    from workspace_app_launches as launches
    inner join workspace_apps as apps
      on apps.id = launches.app_id
    where launches.tenant_id = ${user.tenantId}
  `;
  const runRows = await database<
    {
      active_group_id: string | null;
      total_tokens: number;
      user_id: string;
    }[]
  >`
    select active_group_id, total_tokens, user_id
    from runs
    where tenant_id = ${user.tenantId}
      and status in ('succeeded', 'failed', 'stopped')
      and total_tokens > 0
  `;

  let tenantUsage = 0;
  let userUsage = 0;
  const groupsById: Record<string, number> = {};

  for (const row of launchRows) {
    tenantUsage += row.launch_cost;

    if (row.user_id === user.id) {
      userUsage += row.launch_cost;
    }

    if (row.active_group_id) {
      groupsById[row.active_group_id] =
        (groupsById[row.active_group_id] ?? 0) + row.launch_cost;
    }
  }

  for (const row of runRows) {
    const usageCost = calculateCompletionQuotaCost(row.total_tokens);

    if (usageCost <= 0) {
      continue;
    }

    tenantUsage += usageCost;

    if (row.user_id === user.id) {
      userUsage += usageCost;
    }

    if (row.active_group_id) {
      groupsById[row.active_group_id] =
        (groupsById[row.active_group_id] ?? 0) + usageCost;
    }
  }

  return {
    quotaServiceState: "available",
    quotaUsagesByGroupId: buildQuotaUsagesByGroupId({
      memberGroupIds: context.memberGroupIds,
      quotaLimits,
      usageTotals: {
        tenant: tenantUsage,
        user: userUsage,
        groupsById,
      },
    }),
  };
}

async function upsertWorkspacePreferences(
  database: DatabaseClient,
  user: AuthUser,
  context: WorkspaceContext,
  input: WorkspacePreferencesUpdateRequest,
): Promise<WorkspacePreferences> {
  const nextPreferences = sanitizeWorkspacePreferences(
    {
      favoriteAppIds: input.favoriteAppIds,
      recentAppIds: input.recentAppIds,
      defaultActiveGroupId: input.defaultActiveGroupId,
      updatedAt: new Date().toISOString(),
    },
    context,
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
  conversationId: string,
  options: {
    includeDeleted?: boolean;
  } = {},
): Promise<WorkspaceConversation | null> {
  const [row] = await database<ConversationRow[]>`
    select
      c.id,
      c.title,
      c.status,
      c.pinned,
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
      r.triggered_from as run_triggered_from,
      r.trace_id as run_trace_id,
      r.created_at as run_created_at,
      r.finished_at as run_finished_at,
      r.elapsed_time as run_elapsed_time,
      r.total_tokens as run_total_tokens,
      r.total_steps as run_total_steps
    from conversations c
    inner join workspace_apps a on a.id = c.app_id
    left join groups g on g.id = c.active_group_id
    inner join runs r on r.conversation_id = c.id
    left join workspace_app_launches l on l.conversation_id = c.id
    where c.id = ${conversationId}
      and c.user_id = ${user.id}
      and (${options.includeDeleted ?? false} or c.status <> 'deleted')
    order by r.created_at desc
    limit 1
  `;

  return row ? toWorkspaceConversation(row) : null;
}

async function readConversationById(
  database: DatabaseClient,
  conversationId: string,
  options: {
    includeDeleted?: boolean;
  } = {},
): Promise<WorkspaceConversation | null> {
  const [row] = await database<ConversationRow[]>`
    select
      c.id,
      c.title,
      c.status,
      c.pinned,
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
      r.triggered_from as run_triggered_from,
      r.trace_id as run_trace_id,
      r.created_at as run_created_at,
      r.finished_at as run_finished_at,
      r.elapsed_time as run_elapsed_time,
      r.total_tokens as run_total_tokens,
      r.total_steps as run_total_steps
    from conversations c
    inner join workspace_apps a on a.id = c.app_id
    left join groups g on g.id = c.active_group_id
    inner join runs r on r.conversation_id = c.id
    left join workspace_app_launches l on l.conversation_id = c.id
    where c.id = ${conversationId}
      and (${options.includeDeleted ?? false} or c.status <> 'deleted')
    order by r.created_at desc
    limit 1
  `;

  return row ? toWorkspaceConversation(row) : null;
}

async function readConversationRunsForUser(
  database: DatabaseClient,
  user: AuthUser,
  conversationId: string,
): Promise<WorkspaceRunSummary[]> {
  const rows = await database<WorkspaceRunRow[]>`
    select
      r.id,
      r.conversation_id,
      r.type,
      r.status,
      r.triggered_from,
      r.trace_id,
      r.inputs,
      r.outputs,
      r.error,
      r.elapsed_time,
      r.total_tokens,
      r.total_steps,
      r.created_at,
      r.finished_at,
      a.id as app_id,
      a.slug as app_slug,
      a.name as app_name,
      a.summary as app_summary,
      a.kind as app_kind,
      a.status as app_status,
      a.short_code as app_short_code,
      g.id as active_group_id,
      g.name as active_group_name,
      g.description as active_group_description
    from runs r
    inner join conversations c on c.id = r.conversation_id
    inner join workspace_apps a on a.id = r.app_id
    left join groups g on g.id = r.active_group_id
    where r.conversation_id = ${conversationId}
      and c.user_id = ${user.id}
      and c.status <> 'deleted'
    order by r.created_at desc
  `;

  return rows.map(toWorkspaceRunSummary);
}

async function readRecentConversationsForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspaceConversationListInput,
): Promise<WorkspaceConversationListItem[]> {
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 50);

  const rows = await database<ConversationRow[]>`
    select
      c.id,
      c.title,
      c.status,
      c.pinned,
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
      a.tags as app_tags,
      g.id as active_group_id,
      g.name as active_group_name,
      g.description as active_group_description,
      r.id as run_id,
      r.type as run_type,
      r.status as run_status,
      r.triggered_from as run_triggered_from,
      r.trace_id as run_trace_id,
      r.created_at as run_created_at,
      r.finished_at as run_finished_at,
      r.elapsed_time as run_elapsed_time,
      r.total_tokens as run_total_tokens,
      r.total_steps as run_total_steps
    from conversations c
    inner join workspace_apps a on a.id = c.app_id
    left join groups g on g.id = c.active_group_id
    left join workspace_app_launches l on l.conversation_id = c.id
    inner join lateral (
      select
        r.id,
        r.type,
        r.status,
        r.triggered_from,
        r.trace_id,
        r.created_at,
        r.finished_at,
        r.elapsed_time,
        r.total_tokens,
        r.total_steps
      from runs r
      where r.conversation_id = c.id
      order by r.created_at desc
      limit 1
    ) r on true
    where c.user_id = ${user.id}
      and c.status <> 'deleted'
      and (${input.appId ?? null}::varchar is null or c.app_id = ${input.appId ?? null})
      and (${input.groupId ?? null}::varchar is null or c.active_group_id = ${input.groupId ?? null})
      and (${input.status ?? null}::conversation_status is null or c.status = ${input.status ?? null})
    order by c.pinned desc, c.updated_at desc
  `;

  return rows
    .flatMap((row) => {
      const conversation = toWorkspaceConversation(row);
      const appTags = normalizeStringArray(row.app_tags);

      if (
        !conversationMatchesListFilters({
          appTags,
          conversation,
          filters: input,
        })
      ) {
        return [];
      }

      return [toWorkspaceConversationListItem(row)];
    })
    .slice(0, limit);
}

async function updateConversationForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspaceConversationUpdateInput,
): Promise<WorkspaceConversation | null> {
  const nextUpdatedAt = new Date().toISOString();
  const nextTitle = input.title ?? null;
  const nextStatus = input.status ?? null;
  const nextPinned = input.pinned ?? null;

  const rows = await database<{ id: string }[]>`
    update conversations c
    set title = coalesce(${nextTitle}::varchar, c.title),
        status = coalesce(${nextStatus}::conversation_status, c.status),
        pinned = coalesce(${nextPinned}::boolean, c.pinned),
        updated_at = ${nextUpdatedAt}::timestamptz
    where c.id = ${input.conversationId}
      and c.user_id = ${user.id}
    returning c.id
  `;

  if (rows.length === 0) {
    return null;
  }

  return readConversationForUser(database, user, input.conversationId, {
    includeDeleted: true,
  });
}

async function readRunTimelineForUser(
  database: DatabaseClient,
  user: AuthUser,
  runId: string,
): Promise<WorkspaceRunTimelineEvent[]> {
  const rows = await database<WorkspaceRunTimelineEventRow[]>`
    select
      rte.id,
      rte.event_type,
      rte.metadata,
      rte.created_at
    from run_timeline_events rte
    inner join runs r on r.id = rte.run_id
    inner join conversations c on c.id = r.conversation_id
    where rte.run_id = ${runId}
      and c.user_id = ${user.id}
    order by rte.created_at asc
  `;

  return rows.map(toWorkspaceRunTimelineEvent);
}

async function insertRunTimelineEvent(
  database: DatabaseClient,
  input: {
    conversationId: string;
    createdAt?: string;
    metadata?: Record<string, unknown>;
    runId: string;
    tenantId: string;
    type: WorkspaceRunTimelineEventType;
    userId: string;
  },
) {
  await database`
    insert into run_timeline_events (
      id,
      tenant_id,
      user_id,
      conversation_id,
      run_id,
      event_type,
      metadata,
      created_at
    )
    values (
      ${`timeline_${randomUUID()}`},
      ${input.tenantId},
      ${input.userId},
      ${input.conversationId},
      ${input.runId},
      ${input.type},
      ${input.metadata ?? {}}::jsonb,
      coalesce(${input.createdAt ?? null}::timestamptz, now())
    )
  `;
}

async function readRunForUser(
  database: DatabaseClient,
  user: AuthUser,
  runId: string,
): Promise<WorkspaceRun | null> {
  const [row] = await database<WorkspaceRunRow[]>`
    select
      r.id,
      r.conversation_id,
      r.type,
      r.status,
      r.triggered_from,
      r.trace_id,
      r.inputs,
      r.outputs,
      r.error,
      r.elapsed_time,
      r.total_tokens,
      r.total_steps,
      r.created_at,
      r.finished_at,
      a.id as app_id,
      a.slug as app_slug,
      a.name as app_name,
      a.summary as app_summary,
      a.kind as app_kind,
      a.status as app_status,
      a.short_code as app_short_code,
      g.id as active_group_id,
      g.name as active_group_name,
      g.description as active_group_description
    from runs r
    inner join conversations c on c.id = r.conversation_id
    inner join workspace_apps a on a.id = r.app_id
    left join groups g on g.id = r.active_group_id
    where r.id = ${runId}
      and c.user_id = ${user.id}
      and c.status <> 'deleted'
    limit 1
  `;

  if (!row) {
    return null;
  }

  const run = toWorkspaceRun(row);
  const artifactRows = await database<WorkspaceArtifactRow[]>`
    select
      id,
      user_id,
      conversation_id,
      run_id,
      sequence,
      title,
      kind,
      source,
      status,
      summary,
      mime_type,
      size_bytes,
      payload,
      created_at,
      updated_at
    from workspace_artifacts
    where run_id = ${runId}
      and user_id = ${user.id}
    order by sequence asc, created_at asc
  `;

  if (artifactRows.length > 0) {
    run.artifacts = artifactRows.flatMap((artifactRow) => {
      const artifact = toWorkspaceArtifactFromRow(artifactRow);
      return artifact ? [artifact] : [];
    });
  }
  run.timeline = await readRunTimelineForUser(database, user, runId);

  return run;
}

async function readArtifactForUser(
  database: DatabaseClient,
  user: AuthUser,
  artifactId: string,
): Promise<WorkspaceArtifact | null> {
  const [row] = await database<WorkspaceArtifactRow[]>`
    select
      id,
      user_id,
      conversation_id,
      run_id,
      sequence,
      title,
      kind,
      source,
      status,
      summary,
      mime_type,
      size_bytes,
      payload,
      created_at,
      updated_at
    from workspace_artifacts
    where id = ${artifactId}
      and user_id = ${user.id}
    limit 1
  `;

  return row ? toWorkspaceArtifactFromRow(row) : null;
}

async function listPendingActionsForUser(
  database: DatabaseClient,
  user: AuthUser,
  conversationId: string,
): Promise<WorkspacePendingActionsResult> {
  const conversation = await readConversationForUser(database, user, conversationId);

  if (!conversation) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace conversation could not be found.",
    };
  }

  const run = await readRunForUser(database, user, conversation.run.id);

  if (!run) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace run could not be found.",
    };
  }

  const now = new Date().toISOString();
  const expirationResult = expireWorkspaceHitlSteps({
    items: parseWorkspaceHitlSteps(run.outputs.pendingActions),
    now,
  });

  if (expirationResult.expiredItems.length > 0) {
    await database.begin(async (transaction) => {
      const sql = transaction as unknown as DatabaseClient;

      await sql`
        update runs
        set outputs = case
          when outputs is null then jsonb_set('{}'::jsonb, '{pendingActions}', ${expirationResult.items}::jsonb, true)
          when jsonb_typeof(outputs) = 'string' then jsonb_set((outputs #>> '{}')::jsonb, '{pendingActions}', ${expirationResult.items}::jsonb, true)
          else jsonb_set(outputs, '{pendingActions}', ${expirationResult.items}::jsonb, true)
        end
        where id = ${run.id}
          and conversation_id = ${conversation.id}
      `;

      await sql`
        update conversations
        set updated_at = ${now}::timestamptz
        where id = ${conversation.id}
          and user_id = ${user.id}
      `;
    });
  }

  return {
    ok: true,
    data: {
      conversationId,
      runId: run.id,
      items: expirationResult.items,
      expiredItems:
        expirationResult.expiredItems.length > 0
          ? expirationResult.expiredItems
          : undefined,
    },
  };
}

async function respondToPendingActionForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspacePendingActionRespondInput,
): Promise<WorkspacePendingActionRespondResult> {
  const conversation = await readConversationForUser(
    database,
    user,
    input.conversationId,
  );

  if (!conversation) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace conversation could not be found.",
    };
  }

  const run = await readRunForUser(database, user, conversation.run.id);

  if (!run) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace run could not be found.",
    };
  }

  const now = new Date().toISOString();
  const expirationResult = expireWorkspaceHitlSteps({
    items: parseWorkspaceHitlSteps(run.outputs.pendingActions),
    now,
  });
  const pendingActions = expirationResult.items;

  if (expirationResult.expiredItems.length > 0) {
    await database.begin(async (transaction) => {
      const sql = transaction as unknown as DatabaseClient;

      await sql`
        update runs
        set outputs = case
          when outputs is null then jsonb_set('{}'::jsonb, '{pendingActions}', ${pendingActions}::jsonb, true)
          when jsonb_typeof(outputs) = 'string' then jsonb_set((outputs #>> '{}')::jsonb, '{pendingActions}', ${pendingActions}::jsonb, true)
          else jsonb_set(outputs, '{pendingActions}', ${pendingActions}::jsonb, true)
        end
        where id = ${run.id}
          and conversation_id = ${conversation.id}
      `;

      await sql`
        update conversations
        set updated_at = ${now}::timestamptz
        where id = ${conversation.id}
          and user_id = ${user.id}
      `;
    });
  }

  const pendingActionIndex = pendingActions.findIndex(
    (item) => item.id === input.stepId,
  );

  if (pendingActionIndex < 0) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The requested workspace pending action could not be found.",
      details: {
        stepId: input.stepId,
      },
    };
  }

  const respondedAt = new Date().toISOString();
  const responseResult = applyWorkspaceHitlStepResponse({
    step: pendingActions[pendingActionIndex]!,
    request: input.request,
    actorUserId: user.id,
    actorDisplayName: user.displayName,
    respondedAt,
  });

  if (!responseResult.ok) {
    return {
      ok: false,
      statusCode:
        responseResult.code === "WORKSPACE_ACTION_CONFLICT" ? 409 : 400,
      code: responseResult.code,
      message: responseResult.message,
      details: responseResult.details,
    };
  }

  const items = pendingActions.map((item, index) =>
    index === pendingActionIndex ? responseResult.item : item,
  );

  await database.begin(async (transaction) => {
    const sql = transaction as unknown as DatabaseClient;

    await sql`
      update runs
      set outputs = case
        when outputs is null then jsonb_set('{}'::jsonb, '{pendingActions}', ${items}::jsonb, true)
        when jsonb_typeof(outputs) = 'string' then jsonb_set((outputs #>> '{}')::jsonb, '{pendingActions}', ${items}::jsonb, true)
        else jsonb_set(outputs, '{pendingActions}', ${items}::jsonb, true)
      end
      where id = ${run.id}
        and conversation_id = ${conversation.id}
    `;

    await sql`
      update conversations
      set updated_at = ${respondedAt}::timestamptz
      where id = ${conversation.id}
        and user_id = ${user.id}
    `;
  });

  return {
    ok: true,
    data: {
      conversationId: conversation.id,
      runId: run.id,
      item: responseResult.item,
      items,
    },
  };
}

async function readSharedArtifactForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspaceSharedArtifactLookupInput,
): Promise<WorkspaceArtifactResult> {
  const [shareRow] = await database<WorkspaceConversationShareRow[]>`
    select
      s.id,
      s.conversation_id,
      s.status,
      s.created_at,
      s.revoked_at,
      g.id as group_id,
      g.name as group_name,
      g.description as group_description
    from workspace_conversation_shares s
    inner join groups g on g.id = s.shared_group_id
    where s.id = ${input.shareId}
    limit 1
  `;

  if (!shareRow || shareRow.status !== "active") {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace share could not be found.",
    };
  }

  const context = await resolveWorkspaceContext(database, user);

  if (!context.memberGroupIds.includes(shareRow.group_id)) {
    return {
      ok: false,
      statusCode: 403,
      code: "WORKSPACE_FORBIDDEN",
      message: "The current user is not allowed to access this shared artifact.",
    };
  }

  const [artifactRow] = await database<WorkspaceArtifactRow[]>`
    select
      id,
      user_id,
      conversation_id,
      run_id,
      sequence,
      title,
      kind,
      source,
      status,
      summary,
      mime_type,
      size_bytes,
      payload,
      created_at,
      updated_at
    from workspace_artifacts
    where id = ${input.artifactId}
      and conversation_id = ${shareRow.conversation_id}
    limit 1
  `;

  const artifact = artifactRow ? toWorkspaceArtifactFromRow(artifactRow) : null;

  if (!artifact) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace artifact could not be found.",
    };
  }

  return {
    ok: true,
    data: artifact,
  };
}

async function uploadConversationFileForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspaceConversationUploadInput,
  fileStorage?: WorkspaceFileStorage,
): Promise<WorkspaceConversationUploadResult> {
  const conversation = await readConversationForUser(
    database,
    user,
    input.conversationId,
  );

  if (!conversation) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace conversation could not be found.",
    };
  }

  const attachmentId = `file_${randomUUID()}`;
  const contentHash = createHash("sha256").update(input.bytes).digest("hex");
  const uploadedAt = new Date().toISOString();
  const stored = fileStorage
    ? await fileStorage.saveFile({
        tenantId: user.tenantId,
        userId: user.id,
        fileId: attachmentId,
        fileName: input.fileName,
        bytes: input.bytes,
      })
    : {
        provider: "local" as const,
        storageKey: `${user.tenantId}/${user.id}/${attachmentId}`,
      };

  await database`
    insert into workspace_uploaded_files (
      id,
      tenant_id,
      user_id,
      conversation_id,
      storage_provider,
      storage_key,
      file_name,
      content_type,
      size_bytes,
      sha256,
      created_at
    )
    values (
      ${attachmentId},
      ${user.tenantId},
      ${user.id},
      ${input.conversationId},
      ${stored.provider},
      ${stored.storageKey},
      ${input.fileName},
      ${input.contentType},
      ${input.bytes.byteLength},
      ${contentHash},
      ${uploadedAt}::timestamptz
    )
  `;

  return {
    ok: true,
    data: {
      id: attachmentId,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
      uploadedAt,
    },
  };
}

async function listConversationAttachmentsForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspaceConversationAttachmentLookupInput,
): Promise<WorkspaceConversationAttachmentLookupResult> {
  const conversation = await readConversationForUser(
    database,
    user,
    input.conversationId,
  );

  if (!conversation) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace conversation could not be found.",
    };
  }

  if (input.fileIds.length === 0) {
    return {
      ok: true,
      data: [],
    };
  }

  const rows = await database<WorkspaceUploadedFileRow[]>`
    select
      id,
      file_name,
      content_type,
      size_bytes,
      created_at
    from workspace_uploaded_files
    where conversation_id = ${input.conversationId}
      and user_id = ${user.id}
      and id in ${database(input.fileIds)}
  `;
  const attachmentsById = new Map(
    rows.map((row) => [row.id, toWorkspaceConversationAttachment(row)]),
  );

  return {
    ok: true,
    data: input.fileIds.flatMap((fileId) => {
      const attachment = attachmentsById.get(fileId);

      return attachment ? [attachment] : [];
    }),
  };
}

async function listConversationSharesForUser(
  database: DatabaseClient,
  user: AuthUser,
  conversationId: string,
): Promise<WorkspaceConversationSharesResult> {
  const conversation = await readConversationForUser(
    database,
    user,
    conversationId,
  );

  if (!conversation) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace conversation could not be found.",
    };
  }

  const rows = await database<WorkspaceConversationShareRow[]>`
    select
      s.id,
      s.conversation_id,
      s.status,
      s.created_at,
      s.revoked_at,
      g.id as group_id,
      g.name as group_name,
      g.description as group_description
    from workspace_conversation_shares s
    inner join groups g on g.id = s.shared_group_id
    where s.conversation_id = ${conversationId}
    order by s.created_at desc
  `;

  return {
    ok: true,
    data: {
      conversationId,
      shares: rows.map(toWorkspaceConversationShare),
    },
  };
}

async function createConversationShareForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspaceConversationShareCreateInput,
): Promise<WorkspaceConversationShareResult> {
  const conversation = await readConversationForUser(
    database,
    user,
    input.conversationId,
  );

  if (!conversation) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace conversation could not be found.",
    };
  }

  const context = await resolveWorkspaceContext(database, user);
  const targetGroup = context.groups.find(
    (group) => group.id === input.groupId,
  );

  if (!targetGroup) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace group could not be found.",
    };
  }

  const shareId = `share_${randomUUID()}`;

  await database`
    insert into workspace_conversation_shares (
      id,
      tenant_id,
      conversation_id,
      creator_user_id,
      shared_group_id,
      status,
      access,
      created_at,
      revoked_at
    )
    values (
      ${shareId},
      ${user.tenantId},
      ${input.conversationId},
      ${user.id},
      ${input.groupId},
      'active',
      'read_only',
      now(),
      null
    )
    on conflict (conversation_id, shared_group_id) do update
    set status = 'active',
        access = 'read_only',
        revoked_at = null
  `;

  const [row] = await database<WorkspaceConversationShareRow[]>`
    select
      s.id,
      s.conversation_id,
      s.status,
      s.created_at,
      s.revoked_at,
      g.id as group_id,
      g.name as group_name,
      g.description as group_description
    from workspace_conversation_shares s
    inner join groups g on g.id = s.shared_group_id
    where s.conversation_id = ${input.conversationId}
      and s.shared_group_id = ${input.groupId}
    limit 1
  `;

  if (!row) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace share could not be found.",
    };
  }

  return {
    ok: true,
    data: toWorkspaceConversationShare(row),
  };
}

async function revokeConversationShareForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspaceConversationShareRevokeInput,
): Promise<WorkspaceConversationShareResult> {
  const rows = await database<WorkspaceConversationShareRow[]>`
    update workspace_conversation_shares s
    set status = 'revoked',
        revoked_at = now()
    from conversations c, groups g
    where s.id = ${input.shareId}
      and s.conversation_id = ${input.conversationId}
      and c.id = s.conversation_id
      and c.user_id = ${user.id}
      and g.id = s.shared_group_id
    returning
      s.id,
      s.conversation_id,
      s.status,
      s.created_at,
      s.revoked_at,
      g.id as group_id,
      g.name as group_name,
      g.description as group_description
  `;

  const row = rows[0];

  if (!row) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace share could not be found.",
    };
  }

  return {
    ok: true,
    data: toWorkspaceConversationShare(row),
  };
}

async function getSharedConversationForUser(
  database: DatabaseClient,
  user: AuthUser,
  shareId: string,
): Promise<WorkspaceSharedConversationResult> {
  const [shareRow] = await database<WorkspaceConversationShareRow[]>`
    select
      s.id,
      s.conversation_id,
      s.status,
      s.created_at,
      s.revoked_at,
      g.id as group_id,
      g.name as group_name,
      g.description as group_description
    from workspace_conversation_shares s
    inner join groups g on g.id = s.shared_group_id
    where s.id = ${shareId}
    limit 1
  `;

  if (!shareRow || shareRow.status !== "active") {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace share could not be found.",
    };
  }

  const context = await resolveWorkspaceContext(database, user);

  if (!context.memberGroupIds.includes(shareRow.group_id)) {
    return {
      ok: false,
      statusCode: 403,
      code: "WORKSPACE_FORBIDDEN",
      message:
        "The current user is not allowed to access this shared conversation.",
    };
  }

  const conversation = await readConversationById(
    database,
    shareRow.conversation_id,
  );

  if (!conversation) {
    return {
      ok: false,
      statusCode: 404,
      code: "WORKSPACE_NOT_FOUND",
      message: "The target workspace conversation could not be found.",
    };
  }

  return {
    ok: true,
    data: {
      share: toWorkspaceConversationShare(shareRow),
      conversation,
    },
  };
}

async function createConversationRunForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspaceRunCreateInput,
): Promise<WorkspaceConversation | null> {
  const conversation = await readConversationForUser(
    database,
    user,
    input.conversationId,
  );

  if (!conversation) {
    return null;
  }

  const runId = `run_${randomUUID()}`;
  const traceId = buildTraceId();
  const createdAt = new Date().toISOString();

  await database.begin(async (transaction) => {
    const sql = transaction as unknown as DatabaseClient;

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
        ${conversation.id},
        ${conversation.app.id},
        ${user.id},
        ${conversation.activeGroup.id || null},
        ${conversation.run.type},
        ${input.triggeredFrom},
        'pending',
        '{}'::jsonb,
        '{}'::jsonb,
        0,
        0,
        0,
        ${traceId},
        ${createdAt}::timestamptz
      )
    `;

    await insertRunTimelineEvent(sql, {
      tenantId: user.tenantId,
      userId: user.id,
      conversationId: conversation.id,
      runId,
      type: "run_created",
      metadata: {
        triggeredFrom: input.triggeredFrom,
        traceId,
      },
      createdAt,
    });

    await sql`
      update conversations
      set updated_at = ${createdAt}::timestamptz
      where id = ${conversation.id}
        and user_id = ${user.id}
    `;
  });

  return readConversationForUser(database, user, conversation.id);
}

async function syncRunArtifacts(
  database: DatabaseClient,
  user: AuthUser,
  input: {
    artifacts: WorkspaceArtifact[];
    conversationId: string;
    runId: string;
  },
) {
  await database`
    delete from workspace_artifacts
    where run_id = ${input.runId}
      and user_id = ${user.id}
  `;

  for (const [index, artifact] of input.artifacts.entries()) {
    const payload =
      artifact.kind === "link"
        ? {
            href: artifact.href,
            label: artifact.label,
          }
        : artifact.kind === "table"
          ? {
              columns: artifact.columns,
              rows: artifact.rows,
            }
          : {
              content: artifact.content,
            };

    await database`
      insert into workspace_artifacts (
        id,
        tenant_id,
        user_id,
        conversation_id,
        run_id,
        sequence,
        title,
        kind,
        source,
        status,
        summary,
        mime_type,
        size_bytes,
        payload,
        created_at,
        updated_at
      )
      values (
        ${artifact.id},
        ${user.tenantId},
        ${user.id},
        ${input.conversationId},
        ${input.runId},
        ${index},
        ${artifact.title},
        ${artifact.kind},
        ${artifact.source},
        ${artifact.status},
        ${artifact.summary},
        ${artifact.mimeType},
        ${artifact.sizeBytes},
        ${payload}::jsonb,
        ${artifact.createdAt}::timestamptz,
        ${artifact.updatedAt}::timestamptz
      )
    `;
  }
}

async function updateConversationRunForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspaceRunUpdateInput,
): Promise<WorkspaceConversation | null> {
  const finishedAt =
    input.finishedAt ??
    (input.status === "succeeded" ||
    input.status === "failed" ||
    input.status === "stopped"
      ? new Date().toISOString()
      : null);
  const nextInputs = input.inputs ?? {};
  const nextOutputs = input.outputs ?? {};
  const nextUpdatedAt = finishedAt ?? new Date().toISOString();
  const errorMessage = input.error ?? null;
  const nextMessageHistory = input.messageHistory ?? [];
  const shouldUpdateMessageHistory = input.messageHistory !== undefined;
  const shouldSyncArtifacts =
    input.outputs !== undefined &&
    Object.prototype.hasOwnProperty.call(input.outputs, "artifacts");
  const nextArtifacts = shouldSyncArtifacts
    ? toWorkspaceArtifacts((input.outputs as Record<string, unknown>).artifacts)
    : [];

  const updated = await database.begin(async (transaction) => {
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

    if (input.inputs && Object.keys(input.inputs).length > 0) {
      await insertRunTimelineEvent(sql, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId: input.conversationId,
        runId: input.runId,
        type: "input_recorded",
        metadata: {
          keys: Object.keys(input.inputs),
        },
      });
    }

    if (shouldSyncArtifacts) {
      await syncRunArtifacts(sql, user, {
        artifacts: nextArtifacts,
        conversationId: input.conversationId,
        runId: input.runId,
      });
    }

    if (input.status === "running") {
      await insertRunTimelineEvent(sql, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId: input.conversationId,
        runId: input.runId,
        type: "run_started",
        metadata: {
          status: input.status,
        },
      });
    }

    if (input.outputs && Object.keys(input.outputs).length > 0) {
      await insertRunTimelineEvent(sql, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId: input.conversationId,
        runId: input.runId,
        type: "output_recorded",
        metadata: {
          keys: Object.keys(input.outputs),
        },
      });
    }

    if (input.status === "succeeded") {
      await insertRunTimelineEvent(sql, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId: input.conversationId,
        runId: input.runId,
        type: "run_succeeded",
        metadata: {
          status: input.status,
        },
      });
    }

    if (input.status === "failed") {
      await insertRunTimelineEvent(sql, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId: input.conversationId,
        runId: input.runId,
        type: "run_failed",
        metadata: {
          status: input.status,
          error: input.error ?? null,
        },
      });
    }

    if (input.status === "stopped") {
      await insertRunTimelineEvent(sql, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId: input.conversationId,
        runId: input.runId,
        type: "run_stopped",
        metadata: {
          status: input.status,
        },
      });
    }

    return true;
  });

  if (!updated) {
    return null;
  }

  return readConversationForUser(database, user, input.conversationId);
}

async function updateConversationMessageFeedbackForUser(
  database: DatabaseClient,
  user: AuthUser,
  input: WorkspaceConversationMessageFeedbackUpdateInput,
): Promise<{
  conversationId: string;
  message: WorkspaceConversationMessage;
} | null> {
  const conversation = await readConversationForUser(
    database,
    user,
    input.conversationId,
  );

  if (!conversation) {
    return null;
  }

  const messageIndex = conversation.messages.findIndex(
    (message) => message.id === input.messageId && message.role === "assistant",
  );

  if (messageIndex < 0) {
    return null;
  }

  const currentMessage = conversation.messages[messageIndex];

  if (!currentMessage) {
    return null;
  }

  const nextFeedback = buildMessageFeedback(input.rating);
  const nextMessage: WorkspaceConversationMessage = {
    ...currentMessage,
    feedback: nextFeedback,
  };
  const nextMessageHistory = conversation.messages.map((message, index) =>
    index === messageIndex ? nextMessage : message,
  );
  const nextUpdatedAt = nextFeedback?.updatedAt ?? new Date().toISOString();

  await database`
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

  return {
    conversationId: input.conversationId,
    message: nextMessage,
  };
}

export function createPersistentWorkspaceService(
  database: DatabaseClient,
  options: {
    fileStorage?: WorkspaceFileStorage;
  } = {},
): WorkspaceService {
  return {
    async getCatalogForUser(user) {
      const context = await resolveWorkspaceContext(database, user);
      const preferences = await readWorkspacePreferences(
        database,
        user,
        context,
      );
      const quotaSnapshot = await readWorkspaceQuotaSnapshot(
        database,
        user,
        context,
      );

      return buildWorkspaceCatalog(user, {
        groups: context.groups,
        memberGroupIds: context.memberGroupIds,
        apps: context.apps,
        preferences,
        quotaServiceState: quotaSnapshot.quotaServiceState,
        quotaUsagesByGroupId: quotaSnapshot.quotaUsagesByGroupId,
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
      const app = catalog.apps.find(
        (candidate) => candidate.id === input.appId,
      );

      if (!app) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace app could not be found.",
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
          code: "WORKSPACE_LAUNCH_BLOCKED",
          message:
            "The workspace app launch is blocked by the current authorization or quota state.",
          details: guard,
        };
      }

      const attributedGroup = catalog.groups.find(
        (group) => group.id === guard.attributedGroupId,
      );

      if (!attributedGroup) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The attributed workspace group could not be found.",
        };
      }

      const launchId = randomUUID();
      const conversationId = `conv_${randomUUID()}`;
      const runId = `run_${randomUUID()}`;
      const traceId = buildTraceId();
      const runType = resolveRunType(app.kind);
      const launchedAt = new Date().toISOString();
      const launchUrl = buildLaunchUrl(conversationId);

      await database.begin(async (transaction) => {
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

        await insertRunTimelineEvent(sql, {
          tenantId: user.tenantId,
          userId: user.id,
          conversationId,
          runId,
          type: "run_created",
          metadata: {
            triggeredFrom: "app_launch",
            traceId,
          },
          createdAt: launchedAt,
        });

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
          status: "conversation_ready",
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
    async getConversationForUser(
      user,
      conversationId,
    ): Promise<WorkspaceConversationResult> {
      const conversation = await readConversationForUser(
        database,
        user,
        conversationId,
      );

      if (!conversation) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace conversation could not be found.",
        };
      }

      return {
        ok: true,
        data: conversation,
      };
    },
    async listConversationsForUser(
      user,
      input,
    ): Promise<WorkspaceConversationListResult> {
      return {
        ok: true,
        data: {
          items: await readRecentConversationsForUser(database, user, input),
          filters: {
            appId: input.appId ?? null,
            attachment: input.attachment ?? null,
            feedback: input.feedback ?? null,
            groupId: input.groupId ?? null,
            query: input.query?.trim() || null,
            status: input.status ?? null,
            tag: input.tag?.trim() || null,
            limit: Math.min(Math.max(input.limit ?? 12, 1), 50),
          },
        },
      };
    },
    async updateConversationForUser(
      user,
      input,
    ): Promise<WorkspaceConversationResult> {
      const conversation = await updateConversationForUser(database, user, input);

      if (!conversation) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace conversation could not be found.",
        };
      }

      return {
        ok: true,
        data: conversation,
      };
    },
    async listConversationRunsForUser(
      user,
      conversationId,
    ): Promise<WorkspaceConversationRunsResult> {
      const conversation = await readConversationForUser(
        database,
        user,
        conversationId,
      );

      if (!conversation) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace conversation could not be found.",
        };
      }

      return {
        ok: true,
        data: {
          conversationId,
          runs: await readConversationRunsForUser(
            database,
            user,
            conversationId,
          ),
        },
      };
    },
    async getRunForUser(user, runId): Promise<WorkspaceRunResult> {
      const run = await readRunForUser(database, user, runId);

      if (!run) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace run could not be found.",
        };
      }

      return {
        ok: true,
        data: run,
      };
    },
    async appendRunTimelineEventForUser(
      user,
      input,
    ): Promise<WorkspaceRunResult> {
      const run = await readRunForUser(database, user, input.runId);

      if (!run || run.conversationId !== input.conversationId) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace run could not be found.",
        };
      }

      await insertRunTimelineEvent(database, {
        tenantId: user.tenantId,
        userId: user.id,
        conversationId: input.conversationId,
        runId: input.runId,
        type: input.type,
        metadata: input.metadata,
      });

      const refreshed = await readRunForUser(database, user, input.runId);

      if (!refreshed) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace run could not be found.",
        };
      }

      return {
        ok: true,
        data: refreshed,
      };
    },
    async uploadConversationFileForUser(
      user,
      input,
    ): Promise<WorkspaceConversationUploadResult> {
      return uploadConversationFileForUser(
        database,
        user,
        input,
        options.fileStorage,
      );
    },
    async updateMessageFeedbackForUser(
      user,
      input,
    ): Promise<WorkspaceConversationMessageFeedbackResult> {
      const message = await updateConversationMessageFeedbackForUser(
        database,
        user,
        input,
      );

      if (!message) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace message could not be found.",
        };
      }

      return {
        ok: true,
        data: message,
      };
    },
    async listConversationAttachmentsForUser(
      user,
      input,
    ): Promise<WorkspaceConversationAttachmentLookupResult> {
      return listConversationAttachmentsForUser(database, user, input);
    },
    async getArtifactForUser(user, artifactId) {
      const artifact = await readArtifactForUser(database, user, artifactId);

      if (!artifact) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace artifact could not be found.",
        };
      }

      return {
        ok: true,
        data: artifact,
      };
    },
    async listPendingActionsForUser(
      user,
      conversationId,
    ): Promise<WorkspacePendingActionsResult> {
      return listPendingActionsForUser(database, user, conversationId);
    },
    async respondToPendingActionForUser(
      user,
      input,
    ): Promise<WorkspacePendingActionRespondResult> {
      return respondToPendingActionForUser(database, user, input);
    },
    async getSharedArtifactForUser(user, input) {
      return readSharedArtifactForUser(database, user, input);
    },
    async listConversationSharesForUser(
      user,
      conversationId,
    ): Promise<WorkspaceConversationSharesResult> {
      return listConversationSharesForUser(database, user, conversationId);
    },
    async createConversationShareForUser(
      user,
      input,
    ): Promise<WorkspaceConversationShareResult> {
      return createConversationShareForUser(database, user, input);
    },
    async revokeConversationShareForUser(
      user,
      input,
    ): Promise<WorkspaceConversationShareResult> {
      return revokeConversationShareForUser(database, user, input);
    },
    async getSharedConversationForUser(
      user,
      shareId,
    ): Promise<WorkspaceSharedConversationResult> {
      return getSharedConversationForUser(database, user, shareId);
    },
    async createConversationRunForUser(
      user,
      input,
    ): Promise<WorkspaceConversationResult> {
      const conversation = await createConversationRunForUser(
        database,
        user,
        input,
      );

      if (!conversation) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace conversation could not be found.",
        };
      }

      return {
        ok: true,
        data: conversation,
      };
    },
    async updateConversationRunForUser(
      user,
      input,
    ): Promise<WorkspaceConversationResult> {
      const conversation = await updateConversationRunForUser(
        database,
        user,
        input,
      );

      if (!conversation) {
        return {
          ok: false,
          statusCode: 404,
          code: "WORKSPACE_NOT_FOUND",
          message: "The target workspace conversation could not be found.",
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
