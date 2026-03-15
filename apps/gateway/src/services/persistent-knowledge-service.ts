import type { DatabaseClient } from '@agentifui/db';
import type { AuthUser } from '@agentifui/shared/auth';
import type {
  KnowledgeIngestionStatus,
  KnowledgeSource,
  KnowledgeSourceListFilters,
  KnowledgeSourceStatusCount,
} from '@agentifui/shared';
import { randomUUID } from 'node:crypto';

import {
  buildStatusCounts,
  normalizeLabels,
  normalizeSourceUri,
  normalizeTitle,
  normalizeUpdatedSourceAt,
  validateGroupScope,
  type KnowledgeMutationResult,
  type KnowledgeService,
} from './knowledge-service.js';

type KnowledgeSourceRow = {
  id: string;
  tenant_id: string;
  group_id: string | null;
  owner_user_id: string;
  owner_email: string;
  owner_display_name: string | null;
  title: string;
  source_kind: KnowledgeSource['sourceKind'];
  source_uri: string | null;
  scope: KnowledgeSource['scope'];
  labels: string[] | string;
  status: KnowledgeSource['status'];
  chunk_count: number;
  last_error: string | null;
  updated_source_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function normalizeLabelArray(value: string[] | string) {
  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed) ? parsed.filter(entry => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function toIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toKnowledgeSource(row: KnowledgeSourceRow): KnowledgeSource {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    scope: row.scope,
    groupId: row.group_id,
    title: row.title,
    sourceKind: row.source_kind,
    sourceUri: row.source_uri,
    labels: normalizeLabelArray(row.labels),
    owner: {
      userId: row.owner_user_id,
      email: row.owner_email,
      displayName: row.owner_display_name,
    },
    status: row.status,
    chunkCount: row.chunk_count,
    lastError: row.last_error,
    updatedSourceAt: toIsoString(row.updated_source_at),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

async function getSourceById(database: DatabaseClient, tenantId: string, sourceId: string) {
  const [row] = await database<KnowledgeSourceRow[]>`
    select
      ks.id,
      ks.tenant_id,
      ks.group_id,
      ks.owner_user_id,
      u.email as owner_email,
      u.display_name as owner_display_name,
      ks.title,
      ks.source_kind,
      ks.source_uri,
      ks.scope,
      ks.labels,
      ks.status,
      ks.chunk_count,
      ks.last_error,
      ks.updated_source_at,
      ks.created_at,
      ks.updated_at
    from knowledge_sources ks
    join users u on u.id = ks.owner_user_id
    where ks.tenant_id = ${tenantId}
      and ks.id = ${sourceId}
    limit 1
  `;

  return row ? toKnowledgeSource(row) : null;
}

export function createPersistentKnowledgeService(database: DatabaseClient): KnowledgeService {
  return {
    async listSourcesForUser(user, filters = {}) {
      const query = filters.q?.trim() ?? '';
      const queryPattern = query ? `%${query.toLowerCase()}%` : null;
      const rows = await database<KnowledgeSourceRow[]>`
        select
          ks.id,
          ks.tenant_id,
          ks.group_id,
          ks.owner_user_id,
          u.email as owner_email,
          u.display_name as owner_display_name,
          ks.title,
          ks.source_kind,
          ks.source_uri,
          ks.scope,
          ks.labels,
          ks.status,
          ks.chunk_count,
          ks.last_error,
          ks.updated_source_at,
          ks.created_at,
          ks.updated_at
        from knowledge_sources ks
        join users u on u.id = ks.owner_user_id
        where ks.tenant_id = ${user.tenantId}
          and (${filters.status ?? null}::knowledge_ingestion_status is null or ks.status = ${filters.status ?? null})
          and (${filters.scope ?? null}::knowledge_source_scope is null or ks.scope = ${filters.scope ?? null})
          and (${filters.groupId ?? null}::varchar is null or ks.group_id = ${filters.groupId ?? null})
          and (
            ${queryPattern}::varchar is null
            or lower(ks.title) like ${queryPattern}
            or lower(coalesce(ks.source_uri, '')) like ${queryPattern}
            or lower(cast(ks.labels as text)) like ${queryPattern}
          )
        order by ks.updated_at desc
      `;
      const sources = rows.map(toKnowledgeSource);
      const statusCounts = buildStatusCounts(
        (
          await database<{ status: KnowledgeIngestionStatus; count: number }[]>`
            select
              status,
              count(*)::int as count
            from knowledge_sources
            where tenant_id = ${user.tenantId}
            group by status
          `
        ).flatMap(entry =>
          Array.from({ length: entry.count }, () => ({
            id: '',
            tenantId: user.tenantId,
            scope: 'tenant',
            groupId: null,
            title: '',
            sourceKind: 'url',
            sourceUri: null,
            labels: [],
            owner: {
              userId: user.id,
              email: user.email,
              displayName: user.displayName,
            },
            status: entry.status,
            chunkCount: 0,
            lastError: null,
            updatedSourceAt: null,
            createdAt: '',
            updatedAt: '',
          }))
        )
      );

      return {
        filters,
        sources,
        statusCounts,
      };
    },
    async createSourceForUser(user, input) {
      const title = normalizeTitle(input.title);
      const groupId = validateGroupScope(input.scope, input.groupId);

      if (!title) {
        return {
          ok: false,
          statusCode: 400,
          code: 'ADMIN_INVALID_PAYLOAD',
          message: 'Knowledge source creation requires a title.',
        };
      }

      if (groupId === '__missing__') {
        return {
          ok: false,
          statusCode: 400,
          code: 'ADMIN_INVALID_PAYLOAD',
          message: 'Group-scoped knowledge sources require a target group.',
        };
      }

      if (groupId === '__invalid__') {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The selected group could not be found.',
        };
      }

      let sourceUri: string | null;

      try {
        sourceUri = normalizeSourceUri(input.sourceKind, input.sourceUri);
      } catch {
        return {
          ok: false,
          statusCode: 400,
          code: 'ADMIN_INVALID_PAYLOAD',
          message: 'URL knowledge sources require a valid absolute URL.',
        };
      }

      const sourceId = `src_${randomUUID()}`;

      await database`
        insert into knowledge_sources (
          id,
          tenant_id,
          group_id,
          owner_user_id,
          title,
          source_kind,
          source_uri,
          scope,
          labels,
          status,
          chunk_count,
          last_error,
          updated_source_at,
          created_at,
          updated_at
        )
        values (
          ${sourceId},
          ${user.tenantId},
          ${groupId},
          ${user.id},
          ${title},
          ${input.sourceKind},
          ${sourceUri},
          ${input.scope},
          ${normalizeLabels(input.labels)}::jsonb,
          'queued',
          0,
          null,
          ${normalizeUpdatedSourceAt(input.updatedSourceAt)}::timestamptz,
          now(),
          now()
        )
      `;

      return {
        ok: true,
        data: (await getSourceById(database, user.tenantId, sourceId))!,
      };
    },
    async updateSourceStatusForUser(user, sourceId, input) {
      const existingSource = await getSourceById(database, user.tenantId, sourceId);

      if (!existingSource) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The target knowledge source could not be found.',
        };
      }

      await database`
        update knowledge_sources
        set
          status = ${input.status},
          chunk_count = ${input.chunkCount ?? existingSource.chunkCount},
          last_error = ${
            input.status === 'failed' ? input.lastError?.trim() || 'Ingestion failed.' : null
          },
          updated_at = now()
        where tenant_id = ${user.tenantId}
          and id = ${sourceId}
      `;

      return {
        ok: true,
        data: (await getSourceById(database, user.tenantId, sourceId))!,
      };
    },
  };
}
