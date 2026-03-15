import { randomUUID } from 'node:crypto';

import type { AdminErrorCode } from '@agentifui/shared/admin';
import type { AuthUser } from '@agentifui/shared/auth';
import type {
  KnowledgeIngestionStatus,
  KnowledgeSource,
  KnowledgeSourceCreateRequest,
  KnowledgeSourceListFilters,
  KnowledgeSourceStatusCount,
  KnowledgeSourceStatusUpdateRequest,
} from '@agentifui/shared';

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

export function createKnowledgeService(): KnowledgeService {
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
      chunkCount: 24,
      lastError: null,
      updatedSourceAt: '2026-03-15T00:00:00.000Z',
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:30:00.000Z',
    },
  ];

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
        chunkCount: 0,
        lastError: null,
        updatedSourceAt: normalizeUpdatedSourceAt(input.updatedSourceAt),
        createdAt: now,
        updatedAt: now,
      };

      sources.unshift(source);

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

      const nextSource: KnowledgeSource = {
        ...source,
        status: input.status,
        chunkCount: input.chunkCount ?? source.chunkCount,
        lastError: input.status === 'failed' ? input.lastError?.trim() || 'Ingestion failed.' : null,
        updatedAt: new Date().toISOString(),
      };
      const index = sources.findIndex(candidate => candidate.id === source.id);

      sources.splice(index, 1, nextSource);

      return {
        ok: true,
        data: nextSource,
      };
    },
  };
}

export {
  buildStatusCounts,
  normalizeLabels,
  normalizeSourceUri,
  normalizeTitle,
  normalizeUpdatedSourceAt,
  validateGroupScope,
};
export type { KnowledgeMutationResult, KnowledgeService };
