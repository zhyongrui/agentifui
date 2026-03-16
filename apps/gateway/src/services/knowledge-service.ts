import { randomUUID } from 'node:crypto';

import type { AdminErrorCode } from '@agentifui/shared/admin';
import type { AuthUser } from '@agentifui/shared/auth';
import type {
  KnowledgeIngestionStatus,
  KnowledgeRetrievalResult,
  KnowledgeSource,
  KnowledgeSourceChunk,
  KnowledgeSourceCreateRequest,
  KnowledgeSourceListFilters,
  KnowledgeSourceStatusCount,
  KnowledgeSourceStatusUpdateRequest,
} from '@agentifui/shared';

import { buildKnowledgeChunkPlan } from './knowledge-chunking.js';
import {
  buildKnowledgeRetrievalQuery,
  isKnowledgeSourceAccessibleToGroup,
  rankKnowledgeMatches,
} from './knowledge-retrieval.js';
import { WORKSPACE_GROUPS } from './workspace-catalog-fixtures.js';

type KnowledgeMutationErrorResult = {
  ok: false;
  statusCode: 400 | 404 | 409;
  code: Extract<AdminErrorCode, 'ADMIN_CONFLICT' | 'ADMIN_INVALID_PAYLOAD' | 'ADMIN_NOT_FOUND'>;
  message: string;
  details?: unknown;
};

type KnowledgeMutationResult<TData> =
  | {
      ok: true;
      data: TData;
    }
  | KnowledgeMutationErrorResult;

type KnowledgeService = {
  listSourcesForUser(
    user: AuthUser,
    filters?: KnowledgeSourceListFilters
  ): Promise<{
    filters: KnowledgeSourceListFilters;
    sources: KnowledgeSource[];
    statusCounts: KnowledgeSourceStatusCount[];
  }> | {
    filters: KnowledgeSourceListFilters;
    sources: KnowledgeSource[];
    statusCounts: KnowledgeSourceStatusCount[];
  };
  createSourceForUser(
    user: AuthUser,
    input: KnowledgeSourceCreateRequest
  ): Promise<KnowledgeMutationResult<KnowledgeSource>> | KnowledgeMutationResult<KnowledgeSource>;
  updateSourceStatusForUser(
    user: AuthUser,
    sourceId: string,
    input: KnowledgeSourceStatusUpdateRequest
  ): Promise<KnowledgeMutationResult<KnowledgeSource>> | KnowledgeMutationResult<KnowledgeSource>;
  buildRetrievalForUser(
    user: AuthUser,
    input: {
      appId: string;
      conversationId: string | null;
      groupId: string | null;
      latestPrompt: string;
      limit?: number | null;
    }
  ): Promise<KnowledgeRetrievalResult> | KnowledgeRetrievalResult;
};

const STATUSES: KnowledgeIngestionStatus[] = ['queued', 'processing', 'succeeded', 'failed'];

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeLabels(labels: string[]) {
  return [...new Set(labels.map(label => label.trim().toLowerCase()).filter(Boolean))];
}

function normalizeUpdatedSourceAt(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function normalizeSourceUri(sourceKind: KnowledgeSourceCreateRequest['sourceKind'], value: string | null) {
  const normalized = value?.trim() || null;

  if (!normalized) {
    return null;
  }

  if (sourceKind !== 'url') {
    return normalized;
  }

  return new URL(normalized).toString();
}

function buildStatusCounts(sources: KnowledgeSource[]): KnowledgeSourceStatusCount[] {
  return STATUSES.map(status => ({
    status,
    count: sources.filter(source => source.status === status).length,
  }));
}

function matchesFilters(source: KnowledgeSource, filters: KnowledgeSourceListFilters) {
  if (filters.status && source.status !== filters.status) {
    return false;
  }

  if (filters.scope && source.scope !== filters.scope) {
    return false;
  }

  if (filters.groupId && source.groupId !== filters.groupId) {
    return false;
  }

  if (!filters.q) {
    return true;
  }

  const query = filters.q.trim().toLowerCase();

  return [source.title, source.sourceUri ?? '', ...source.labels]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

function validateGroupScope(scope: KnowledgeSourceCreateRequest['scope'], groupId: string | null) {
  if (scope === 'tenant') {
    return null;
  }

  if (!groupId) {
    return '__missing__';
  }

  return WORKSPACE_GROUPS.some(group => group.id === groupId) ? groupId : '__invalid__';
}

function materializeKnowledgeChunks(input: {
  sourceId: string;
  createdAt: string;
  chunks: ReturnType<typeof buildKnowledgeChunkPlan>['chunks'];
}): KnowledgeSourceChunk[] {
  return input.chunks.map(chunk => ({
    id: `chunk_${randomUUID()}`,
    sourceId: input.sourceId,
    sequence: chunk.sequence,
    strategy: chunk.strategy,
    headingPath: chunk.headingPath,
    preview: chunk.preview,
    content: chunk.content,
    charCount: chunk.charCount,
    tokenEstimate: chunk.tokenEstimate,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  }));
}

export function createKnowledgeService(): KnowledgeService {
  const sourceContent = new Map<string, string | null>();
  const sourceChunks = new Map<string, KnowledgeSourceChunk[]>();
  const sources: KnowledgeSource[] = [
    {
      id: 'src_policy_watch_handbook',
      tenantId: 'tenant-dev',
      scope: 'group',
      groupId: 'grp_research',
      title: 'Policy Watch handbook',
      sourceKind: 'url',
      sourceUri: 'https://example.com/policy-watch-handbook',
      labels: ['policy', 'handbook'],
      owner: {
        userId: 'user-admin',
        email: 'admin@iflabx.com',
        displayName: 'Admin User',
      },
      status: 'succeeded',
      hasContent: true,
      chunkCount: 24,
      chunking: {
        strategy: 'markdown_sections',
        targetChunkChars: 1200,
        overlapChars: 160,
        lastChunkedAt: '2026-03-15T00:30:00.000Z',
      },
      lastError: null,
      updatedSourceAt: '2026-03-15T00:00:00.000Z',
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:30:00.000Z',
    },
  ];
  sourceContent.set(
    'src_policy_watch_handbook',
    '# Policy Watch handbook\n\nUse section-aware ingestion for governance updates.\n\n## Operations\n\nSummarize deltas and supporting evidence.',
  );
  sourceChunks.set(
    'src_policy_watch_handbook',
    materializeKnowledgeChunks({
      sourceId: 'src_policy_watch_handbook',
      createdAt: '2026-03-15T00:30:00.000Z',
      chunks: buildKnowledgeChunkPlan({
        sourceKind: 'markdown',
        content:
          sourceContent.get('src_policy_watch_handbook') ??
          '',
      }).chunks,
    }),
  );

  return {
    listSourcesForUser(user, filters = {}) {
      const tenantSources = sources
        .filter(source => source.tenantId === user.tenantId)
        .filter(source => matchesFilters(source, filters))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

      return {
        filters,
        sources: tenantSources,
        statusCounts: buildStatusCounts(sources.filter(source => source.tenantId === user.tenantId)),
      };
    },
    createSourceForUser(user, input) {
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

      const now = new Date().toISOString();
      const content = typeof input.content === 'string' ? input.content : null;
      const plan = buildKnowledgeChunkPlan({
        sourceKind: input.sourceKind,
        content: content ?? '',
      });
      const source: KnowledgeSource = {
        id: `src_${randomUUID()}`,
        tenantId: user.tenantId,
        scope: input.scope,
        groupId,
        title,
        sourceKind: input.sourceKind,
        sourceUri,
        labels: normalizeLabels(input.labels),
        owner: {
          userId: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        status: 'queued',
        hasContent: Boolean(content?.trim()),
        chunkCount: plan.chunks.length,
        chunking: {
          strategy: plan.strategy,
          targetChunkChars: plan.targetChunkChars,
          overlapChars: plan.overlapChars,
          lastChunkedAt: content?.trim() ? now : null,
        },
        lastError: null,
        updatedSourceAt: normalizeUpdatedSourceAt(input.updatedSourceAt),
        createdAt: now,
        updatedAt: now,
      };

      sources.unshift(source);
      sourceContent.set(source.id, content?.trim() ? content : null);
      sourceChunks.set(
        source.id,
        materializeKnowledgeChunks({
          sourceId: source.id,
          createdAt: now,
          chunks: plan.chunks,
        }),
      );

      return {
        ok: true,
        data: source,
      };
    },
    updateSourceStatusForUser(user, sourceId, input) {
      const source = sources.find(candidate => candidate.id === sourceId && candidate.tenantId === user.tenantId);

      if (!source) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'The target knowledge source could not be found.',
        };
      }

      const nextContent =
        typeof input.content === 'string' ? input.content : sourceContent.get(source.id) ?? null;
      const plan =
        typeof input.content === 'string'
          ? buildKnowledgeChunkPlan({
              sourceKind: source.sourceKind,
              content: nextContent ?? '',
            })
          : null;
      const nextSource: KnowledgeSource = {
        ...source,
        status: input.status,
        hasContent: Boolean(nextContent?.trim()),
        chunkCount: plan?.chunks.length ?? input.chunkCount ?? source.chunkCount,
        chunking: plan
          ? {
              strategy: plan.strategy,
              targetChunkChars: plan.targetChunkChars,
              overlapChars: plan.overlapChars,
              lastChunkedAt: nextContent?.trim() ? new Date().toISOString() : source.chunking.lastChunkedAt,
            }
          : source.chunking,
        lastError: input.status === 'failed' ? input.lastError?.trim() || 'Ingestion failed.' : null,
        updatedAt: new Date().toISOString(),
      };
      const index = sources.findIndex(candidate => candidate.id === source.id);

      sources.splice(index, 1, nextSource);
      if (typeof input.content === 'string') {
        sourceContent.set(source.id, nextContent?.trim() ? nextContent : null);
        sourceChunks.set(
          source.id,
          materializeKnowledgeChunks({
            sourceId: source.id,
            createdAt: nextSource.updatedAt,
            chunks: plan?.chunks ?? [],
          }),
        );
      }

      return {
        ok: true,
        data: nextSource,
      };
    },
    buildRetrievalForUser(user, input) {
      const query = buildKnowledgeRetrievalQuery({
        appId: input.appId,
        conversationId: input.conversationId,
        groupId: input.groupId,
        latestPrompt: input.latestPrompt,
        limit: input.limit,
      });
      const matches = rankKnowledgeMatches(
        query,
        sources
          .filter(source => source.tenantId === user.tenantId)
          .filter(source => source.status === 'succeeded')
          .filter(source => isKnowledgeSourceAccessibleToGroup(source, query.groupId))
          .flatMap(source =>
            (sourceChunks.get(source.id) ?? []).map(chunk => ({
              sourceId: source.id,
              chunkId: chunk.id,
              title: source.title,
              sourceKind: source.sourceKind,
              sourceUri: source.sourceUri,
              scope: source.scope,
              groupId: source.groupId,
              labels: source.labels,
              headingPath: chunk.headingPath,
              preview: chunk.preview,
              content: chunk.content,
              score: 0,
            })),
          ),
      );

      return {
        query,
        matches,
      };
    },
  };
}

export {
  STATUSES,
  buildStatusCounts,
  normalizeLabels,
  normalizeSourceUri,
  normalizeTitle,
  normalizeUpdatedSourceAt,
  validateGroupScope,
};
export type { KnowledgeMutationResult, KnowledgeService };
