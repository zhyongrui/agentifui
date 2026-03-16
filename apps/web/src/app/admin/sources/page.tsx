'use client';

import type {
  KnowledgeIngestionStatus,
  KnowledgeSource,
  KnowledgeSourceCreateRequest,
  KnowledgeSourceListResponse,
} from '@agentifui/shared';
import {
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';

import {
  createAdminSource,
  fetchAdminSources,
  updateAdminSourceStatus,
} from '../../../lib/admin-client';
import { useI18n } from '../../../components/i18n-provider';
import { useAdminPageData } from '../../../lib/use-admin-page';

const STATUS_OPTIONS: KnowledgeIngestionStatus[] = [
  'queued',
  'processing',
  'succeeded',
  'failed',
];

function buildInitialDraft(): KnowledgeSourceCreateRequest {
  return {
    title: '',
    sourceKind: 'url',
    sourceUri: '',
    content: '',
    scope: 'tenant',
    groupId: null,
    labels: [],
    updatedSourceAt: null,
  };
}

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not set';
}

export default function AdminSourcesPage() {
  const { locale } = useI18n();
  const loadSources = useCallback((sessionToken: string) => fetchAdminSources(sessionToken), []);
  const { data, error, isLoading, reload, session } =
    useAdminPageData<KnowledgeSourceListResponse['data']>(loadSources);
  const [draft, setDraft] = useState<KnowledgeSourceCreateRequest>(buildInitialDraft);
  const [labelInput, setLabelInput] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | KnowledgeIngestionStatus>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const copy =
    locale === 'zh-CN'
      ? {
          loading: '正在加载知识源...',
          title: '知识源',
          lead: '从管理边界排队知识源、跟踪摄取状态，并查看规范化后的来源元数据。',
          queuedNotice: (title: string) => `已将 ${title} 加入摄取队列。`,
          reviewNeeded: '摄取需要人工复核。',
          statusNotice: (title: string, status: string) => `${title} 当前状态为 ${status}。`,
          queueSource: '加入来源',
          titleLabel: '标题',
          sourceKind: '来源类型',
          sourceUri: '来源地址',
          optional: '可选',
          sourceContent: '来源内容',
          markdownPlaceholder: '# 政策摘要\n\n写入将按章节切分的 Markdown 内容。',
          contentPlaceholder: '粘贴来源文本以预览切分和索引元数据。',
          scope: '范围',
          tenant: '租户',
          group: '群组',
          groupId: '群组 ID',
          labels: '标签',
          sourceUpdatedAt: '来源更新时间',
          queueing: '排队中...',
          inventory: '来源清单',
          search: '搜索',
          searchPlaceholder: '按标题、标签或 URI 过滤',
          statusFilter: '状态筛选',
          all: '全部',
          status: '状态',
          chunks: '分块',
          strategy: '策略',
          uri: '地址',
          notProvided: '未提供',
          contentStored: '已保存用于索引',
          metadataOnly: '仅元数据来源',
          owner: '所有者',
          chunkProfile: '分块配置',
          target: '目标',
          overlap: '重叠',
          chars: '字符',
          lastChunked: '上次切分',
          sourceUpdated: '来源更新',
          ingestionUpdated: '摄取更新',
          saving: '保存中...',
          mark: (status: string) => `标记为 ${status}`,
          noMatches: '当前筛选条件下没有匹配的知识源。',
        }
      : {
          loading: 'Loading knowledge sources...',
          title: 'Sources',
          lead: 'Queue knowledge sources, track ingestion status and keep normalized source metadata visible from the admin boundary.',
          queuedNotice: (title: string) => `Queued ${title} for ingestion.`,
          reviewNeeded: 'Ingestion needs operator review.',
          statusNotice: (title: string, status: string) => `${title} is now ${status}.`,
          queueSource: 'Queue source',
          titleLabel: 'Title',
          sourceKind: 'Source kind',
          sourceUri: 'Source URI',
          optional: 'Optional',
          sourceContent: 'Source content',
          markdownPlaceholder: '# Policy digest\n\nWrite markdown content that will be chunked by sections.',
          contentPlaceholder: 'Paste source text to preview chunking and indexing metadata.',
          scope: 'Scope',
          tenant: 'Tenant',
          group: 'Group',
          groupId: 'Group ID',
          labels: 'Labels',
          sourceUpdatedAt: 'Source updated at',
          queueing: 'Queueing...',
          inventory: 'Source inventory',
          search: 'Search',
          searchPlaceholder: 'Filter by title, label or URI',
          statusFilter: 'Status filter',
          all: 'All',
          status: 'Status',
          chunks: 'chunks',
          strategy: 'strategy',
          uri: 'URI',
          notProvided: 'Not provided',
          contentStored: 'Stored for indexing',
          metadataOnly: 'Metadata-only source',
          owner: 'Owner',
          chunkProfile: 'Chunk profile',
          target: 'target',
          overlap: 'overlap',
          chars: 'chars',
          lastChunked: 'Last chunked',
          sourceUpdated: 'Source updated',
          ingestionUpdated: 'Ingestion updated',
          saving: 'Saving...',
          mark: (status: string) => `Mark ${status}`,
          noMatches: 'No knowledge sources match the current filters.',
        };

  function updateDraft(
    field: keyof KnowledgeSourceCreateRequest,
    value: KnowledgeSourceCreateRequest[keyof KnowledgeSourceCreateRequest]
  ) {
    setDraft((currentDraft: KnowledgeSourceCreateRequest) => ({
      ...currentDraft,
      [field]: value,
    }));
  }

  async function handleCreateSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setPendingActionId('create');
    setMutationError(null);
    setNotice(null);

    const result = await createAdminSource(session.sessionToken, {
      ...draft,
      sourceUri: draft.sourceUri?.trim() || null,
      content: draft.content?.trim() || null,
      groupId: draft.scope === 'group' ? draft.groupId?.trim() || null : null,
      labels: labelInput
        .split(',')
        .map(label => label.trim())
        .filter(Boolean),
      updatedSourceAt: draft.updatedSourceAt?.trim() || null,
    });

    if (!result.ok) {
      setPendingActionId(null);
      setMutationError(result.error.message);
      return;
    }

    setPendingActionId(null);
    setDraft(buildInitialDraft());
    setLabelInput('');
    setNotice(copy.queuedNotice(result.data.title));
    reload();
  }

  async function handleStatusUpdate(source: KnowledgeSource, status: KnowledgeIngestionStatus) {
    if (!session) {
      return;
    }

    setPendingActionId(`${source.id}:${status}`);
    setMutationError(null);
    setNotice(null);

    const result = await updateAdminSourceStatus(session.sessionToken, source.id, {
      status,
      chunkCount: status === 'succeeded' ? Math.max(source.chunkCount, 12) : source.chunkCount,
      lastError: status === 'failed' ? copy.reviewNeeded : null,
    });

    if (!result.ok) {
      setPendingActionId(null);
      setMutationError(result.error.message);
      return;
    }

    setPendingActionId(null);
    setNotice(copy.statusNotice(result.data.title, result.data.status));
    reload();
  }

  const filteredSources = useMemo(() => {
    return (data?.sources ?? []).filter(source => {
      if (statusFilter !== 'all' && source.status !== statusFilter) {
        return false;
      }

      if (!deferredQuery) {
        return true;
      }

      return [source.title, source.sourceUri ?? '', ...source.labels]
        .join(' ')
        .toLowerCase()
        .includes(deferredQuery);
    });
  }, [data?.sources, deferredQuery, statusFilter]);

  if (isLoading) {
    return <p className="lead">{copy.loading}</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>{copy.title}</h1>
        <p className="lead">{copy.lead}</p>
      </div>

      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {mutationError ? <div className="notice error">{mutationError}</div> : null}

      <div className="admin-stat-grid">
        {(data?.statusCounts ?? []).map(statusCount => (
          <article className="admin-stat-card" key={statusCount.status}>
            <span>{statusCount.status}</span>
            <strong>{statusCount.count}</strong>
          </article>
        ))}
      </div>

      <form className="stack" onSubmit={handleCreateSource}>
        <h2>Queue source</h2>
        <label className="field">
          <span>{copy.titleLabel}</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft('title', event.target.value)}
            required
            type="text"
            value={draft.title}
          />
        </label>
        <label className="field">
          <span>{copy.sourceKind}</span>
          <select
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              updateDraft('sourceKind', event.target.value as KnowledgeSourceCreateRequest['sourceKind'])
            }
            value={draft.sourceKind}
          >
            <option value="url">URL</option>
            <option value="markdown">Markdown</option>
            <option value="file">File</option>
          </select>
        </label>
        <label className="field">
          <span>{copy.sourceUri}</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateDraft('sourceUri', event.target.value)
            }
            placeholder={draft.sourceKind === 'url' ? 'https://example.com/policy' : copy.optional}
            type="text"
            value={draft.sourceUri ?? ''}
          />
        </label>
        <label className="field">
          <span>{copy.sourceContent}</span>
          <textarea
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              updateDraft('content', event.target.value)
            }
            placeholder={
              draft.sourceKind === 'markdown'
                ? copy.markdownPlaceholder
                : copy.contentPlaceholder
            }
            rows={8}
            value={draft.content ?? ''}
          />
        </label>
        <label className="stack">
          <span>{copy.scope}</span>
          <select
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              updateDraft('scope', event.target.value as KnowledgeSourceCreateRequest['scope'])
            }
            value={draft.scope}
          >
            <option value="tenant">{copy.tenant}</option>
            <option value="group">{copy.group}</option>
          </select>
        </label>
        {draft.scope === 'group' ? (
          <label className="field">
            <span>{copy.groupId}</span>
            <input
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateDraft('groupId', event.target.value)
              }
              placeholder="grp_research"
              required
              type="text"
              value={draft.groupId ?? ''}
            />
          </label>
        ) : null}
        <label className="field">
          <span>{copy.labels}</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) => setLabelInput(event.target.value)}
            placeholder="policy, handbook, external"
            type="text"
            value={labelInput}
          />
        </label>
        <label className="field">
          <span>{copy.sourceUpdatedAt}</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateDraft('updatedSourceAt', event.target.value)
            }
            placeholder="2026-03-15T00:00:00.000Z"
            type="text"
            value={draft.updatedSourceAt ?? ''}
          />
        </label>
        <button className="primary" disabled={pendingActionId === 'create'} type="submit">
          {pendingActionId === 'create' ? copy.queueing : copy.queueSource}
        </button>
      </form>

      <div className="stack">
        <h2>{copy.inventory}</h2>
        <label className="field">
          <span>{copy.search}</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            type="text"
            value={query}
          />
        </label>
        <label className="field">
          <span>{copy.statusFilter}</span>
          <select
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setStatusFilter(event.target.value as 'all' | KnowledgeIngestionStatus)
            }
            value={statusFilter}
          >
            <option value="all">{copy.all}</option>
            {STATUS_OPTIONS.map(status => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        {filteredSources.map(source => (
          <article className="admin-app-card stack" key={source.id}>
            <div>
              <h3>{source.title}</h3>
            <p className="lead">
                {source.sourceKind} · {source.scope === 'tenant' ? copy.tenant : copy.group}
                {source.groupId ? ` · ${source.groupId}` : ''}
              </p>
            </div>
            <p>
              {copy.status} <strong>{source.status}</strong> · {copy.chunks} {source.chunkCount} · {copy.strategy}{' '}
              {source.chunking.strategy}
            </p>
            <p>{copy.uri}: {source.sourceUri ?? copy.notProvided}</p>
            <p>{copy.sourceContent}: {source.hasContent ? copy.contentStored : copy.metadataOnly}</p>
            <p>{copy.labels}: {source.labels.length > 0 ? source.labels.join(', ') : copy.notProvided}</p>
            <p>
              {copy.owner}: {source.owner.email}
              {source.owner.displayName ? ` (${source.owner.displayName})` : ''}
            </p>
            <p>
              {copy.chunkProfile}: {copy.target} {source.chunking.targetChunkChars} {copy.chars} · {copy.overlap}{' '}
              {source.chunking.overlapChars} {copy.chars}
            </p>
            <p>{copy.lastChunked}: {formatTimestamp(source.chunking.lastChunkedAt)}</p>
            <p>{copy.sourceUpdated}: {formatTimestamp(source.updatedSourceAt)}</p>
            <p>{copy.ingestionUpdated}: {formatTimestamp(source.updatedAt)}</p>
            {source.lastError ? <div className="notice error">{source.lastError}</div> : null}
            <div className="actions">
              {STATUS_OPTIONS.map(status => (
                <button
                  className="secondary"
                  disabled={pendingActionId === `${source.id}:${status}` || source.status === status}
                  key={status}
                  onClick={() => void handleStatusUpdate(source, status)}
                  type="button"
                >
                  {pendingActionId === `${source.id}:${status}` ? copy.saving : copy.mark(status)}
                </button>
              ))}
            </div>
          </article>
        ))}

        {filteredSources.length === 0 ? <p>{copy.noMatches}</p> : null}
      </div>
    </div>
  );
}
