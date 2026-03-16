import type { DatabaseClient } from "@agentifui/db";

import type { AuditService } from "./audit-service.js";

export type WorkspaceCleanupMode = "dry_run" | "execute";

export type WorkspaceCleanupPolicy = {
  archivedConversationRetentionDays: number;
  shareExpiryDays: number;
  timelineRetentionDays: number;
  staleKnowledgeSourceRetentionDays: number;
};

export type WorkspaceCleanupCutoffs = {
  archivedConversationBefore: string;
  shareCreatedBefore: string;
  timelineCreatedBefore: string;
  staleKnowledgeSourceBefore: string;
};

export type WorkspaceCleanupPreview = {
  archivedConversations: number;
  expiredShares: number;
  orphanedArtifacts: number;
  coldTimelineEvents: number;
  staleKnowledgeSources: number;
  totalCandidates: number;
  cutoffs: WorkspaceCleanupCutoffs;
};

export type WorkspaceCleanupExecutionSummary = WorkspaceCleanupPreview & {
  mode: WorkspaceCleanupMode;
  executedAt: string;
  actorUserId: string | null;
  archivedConversationsDeleted: number;
  expiredSharesRevoked: number;
  orphanedArtifactsDeleted: number;
  coldTimelineEventsDeleted: number;
  staleKnowledgeSourcesDeleted: number;
};

type LatestCleanupExecution = {
  occurredAt: string;
  actorUserId: string | null;
  summary: WorkspaceCleanupExecutionSummary;
} | null;

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildWorkspaceCleanupPolicy(): WorkspaceCleanupPolicy {
  return {
    archivedConversationRetentionDays: 30,
    shareExpiryDays: 14,
    timelineRetentionDays: 14,
    staleKnowledgeSourceRetentionDays: 30,
  };
}

export function buildWorkspaceCleanupCutoffs(
  now: Date,
  policy: WorkspaceCleanupPolicy = buildWorkspaceCleanupPolicy(),
): WorkspaceCleanupCutoffs {
  return {
    archivedConversationBefore: new Date(
      now.getTime() - policy.archivedConversationRetentionDays * DAY_MS,
    ).toISOString(),
    shareCreatedBefore: new Date(
      now.getTime() - policy.shareExpiryDays * DAY_MS,
    ).toISOString(),
    timelineCreatedBefore: new Date(
      now.getTime() - policy.timelineRetentionDays * DAY_MS,
    ).toISOString(),
    staleKnowledgeSourceBefore: new Date(
      now.getTime() - policy.staleKnowledgeSourceRetentionDays * DAY_MS,
    ).toISOString(),
  };
}

export function countWorkspaceCleanupCandidates(
  preview: Pick<
    WorkspaceCleanupPreview,
    "archivedConversations" | "coldTimelineEvents" | "expiredShares" | "orphanedArtifacts"
    | "staleKnowledgeSources"
  >,
) {
  return (
    preview.archivedConversations +
    preview.expiredShares +
    preview.orphanedArtifacts +
    preview.coldTimelineEvents +
    preview.staleKnowledgeSources
  );
}

function toCount(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function normalizeJsonRecord(
  value: Record<string, unknown> | string | null,
): Record<string, unknown> {
  if (!value || typeof value !== "string") {
    return (value ?? {}) as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function previewWorkspaceCleanup(
  database: DatabaseClient,
  tenantId: string,
  now = new Date(),
): Promise<WorkspaceCleanupPreview> {
  const cutoffs = buildWorkspaceCleanupCutoffs(now);

  const [
    archivedConversationRow,
    expiredShareRow,
    orphanedArtifactRow,
    coldTimelineRow,
    staleKnowledgeSourceRow,
  ] = await Promise.all([
    database<{ count: number | string }[]>`
      select count(*)::int as count
      from conversations
      where tenant_id = ${tenantId}
        and status in ('archived', 'deleted')
        and updated_at < ${cutoffs.archivedConversationBefore}::timestamptz
    `,
    database<{ count: number | string }[]>`
      select count(*)::int as count
      from workspace_conversation_shares
      where tenant_id = ${tenantId}
        and status = 'active'
        and created_at < ${cutoffs.shareCreatedBefore}::timestamptz
    `,
    database<{ count: number | string }[]>`
      select count(*)::int as count
      from workspace_artifacts wa
      left join conversations c on c.id = wa.conversation_id
      left join runs r on r.id = wa.run_id
      where wa.tenant_id = ${tenantId}
        and (c.id is null or r.id is null or c.status = 'deleted')
    `,
    database<{ count: number | string }[]>`
      select count(*)::int as count
      from run_timeline_events rte
      inner join runs r on r.id = rte.run_id
      inner join conversations c on c.id = r.conversation_id
      where rte.tenant_id = ${tenantId}
        and c.status = 'active'
        and r.finished_at is not null
        and r.finished_at < ${cutoffs.timelineCreatedBefore}::timestamptz
        and rte.created_at < ${cutoffs.timelineCreatedBefore}::timestamptz
    `,
    database<{ count: number | string }[]>`
      select count(*)::int as count
      from knowledge_sources
      where tenant_id = ${tenantId}
        and updated_at < ${cutoffs.staleKnowledgeSourceBefore}::timestamptz
        and (
          status in ('queued', 'processing', 'failed')
          or (status = 'succeeded' and (coalesce(chunk_count, 0) = 0 or source_content is null))
        )
    `,
  ]);

  const preview = {
    archivedConversations: toCount(archivedConversationRow[0]?.count),
    expiredShares: toCount(expiredShareRow[0]?.count),
    orphanedArtifacts: toCount(orphanedArtifactRow[0]?.count),
    coldTimelineEvents: toCount(coldTimelineRow[0]?.count),
    staleKnowledgeSources: toCount(staleKnowledgeSourceRow[0]?.count),
    cutoffs,
  };

  return {
    ...preview,
    totalCandidates: countWorkspaceCleanupCandidates(preview),
  };
}

export async function getLatestWorkspaceCleanupExecution(
  database: DatabaseClient,
  tenantId: string,
): Promise<LatestCleanupExecution> {
  const [row] = await database<{
    actor_user_id: string | null;
    occurred_at: Date | string;
    payload: Record<string, unknown> | string;
  }[]>`
    select actor_user_id, occurred_at, payload
    from audit_events
    where tenant_id = ${tenantId}
      and action = 'workspace.cleanup.executed'
    order by occurred_at desc
    limit 1
  `;

  if (!row) {
    return null;
  }

  const payload = normalizeJsonRecord(row.payload);
  const summary =
    typeof payload.summary === "object" && payload.summary !== null
      ? (payload.summary as WorkspaceCleanupExecutionSummary)
      : null;

  if (!summary) {
    return null;
  }

  return {
    actorUserId: row.actor_user_id,
    occurredAt:
      row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : new Date(row.occurred_at).toISOString(),
    summary,
  };
}

export async function runWorkspaceCleanup(input: {
  auditService: AuditService;
  database: DatabaseClient;
  mode: WorkspaceCleanupMode;
  tenantId: string;
  actorUserId?: string | null;
  now?: Date;
}) {
  const executedAt = (input.now ?? new Date()).toISOString();
  const preview = await previewWorkspaceCleanup(
    input.database,
    input.tenantId,
    input.now,
  );

  const summary: WorkspaceCleanupExecutionSummary = {
    ...preview,
    mode: input.mode,
    executedAt,
    actorUserId: input.actorUserId ?? null,
    archivedConversationsDeleted: 0,
    expiredSharesRevoked: 0,
    orphanedArtifactsDeleted: 0,
    coldTimelineEventsDeleted: 0,
    staleKnowledgeSourcesDeleted: 0,
  };

  if (input.mode === "dry_run") {
    return summary;
  }

  const expiredShareIds = await input.database.begin(async (transaction) => {
    const sql = transaction as unknown as DatabaseClient;

    const expiredShareRows = await sql<{ id: string }[]>`
      update workspace_conversation_shares
      set status = 'revoked',
          revoked_at = ${executedAt}::timestamptz
      where tenant_id = ${input.tenantId}
        and status = 'active'
        and created_at < ${preview.cutoffs.shareCreatedBefore}::timestamptz
      returning id
    `;

    const orphanedArtifactRows = await sql<{ id: string }[]>`
      delete from workspace_artifacts wa
      where wa.id in (
        select wa_inner.id
        from workspace_artifacts wa_inner
        left join conversations c on c.id = wa_inner.conversation_id
        left join runs r on r.id = wa_inner.run_id
        where wa_inner.tenant_id = ${input.tenantId}
          and (c.id is null or r.id is null or c.status = 'deleted')
      )
      returning wa.id
    `;

    const coldTimelineRows = await sql<{ id: string }[]>`
      delete from run_timeline_events rte
      using runs r, conversations c
      where rte.tenant_id = ${input.tenantId}
        and rte.run_id = r.id
        and r.conversation_id = c.id
        and c.status = 'active'
        and r.finished_at is not null
        and r.finished_at < ${preview.cutoffs.timelineCreatedBefore}::timestamptz
        and rte.created_at < ${preview.cutoffs.timelineCreatedBefore}::timestamptz
      returning rte.id
    `;

    const staleKnowledgeRows = await sql<{ id: string }[]>`
      delete from knowledge_sources
      where tenant_id = ${input.tenantId}
        and updated_at < ${preview.cutoffs.staleKnowledgeSourceBefore}::timestamptz
        and (
          status in ('queued', 'processing', 'failed')
          or (status = 'succeeded' and (coalesce(chunk_count, 0) = 0 or source_content is null))
        )
      returning id
    `;

    const archivedConversationRows = await sql<{ id: string }[]>`
      delete from conversations
      where tenant_id = ${input.tenantId}
        and status in ('archived', 'deleted')
        and updated_at < ${preview.cutoffs.archivedConversationBefore}::timestamptz
      returning id
    `;

    summary.expiredSharesRevoked = expiredShareRows.length;
    summary.orphanedArtifactsDeleted = orphanedArtifactRows.length;
    summary.coldTimelineEventsDeleted = coldTimelineRows.length;
    summary.staleKnowledgeSourcesDeleted = staleKnowledgeRows.length;
    summary.archivedConversationsDeleted = archivedConversationRows.length;

    return expiredShareRows.map((row) => row.id);
  });

  for (const shareId of expiredShareIds) {
    await input.auditService.recordEvent({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId ?? null,
      action: "workspace.conversation_share.expired",
      entityType: "conversation_share",
      entityId: shareId,
      payload: {
        shareId,
        cleanupExecutedAt: executedAt,
      },
      occurredAt: executedAt,
    });
  }

  await input.auditService.recordEvent({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId ?? null,
    action: "workspace.cleanup.executed",
    entityType: "tenant",
    entityId: input.tenantId,
    level: summary.totalCandidates > 0 ? "warning" : "info",
    payload: {
      summary,
    },
    occurredAt: executedAt,
  });

  return summary;
}
