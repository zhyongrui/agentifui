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
    setNotice(`Queued ${result.data.title} for ingestion.`);
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
      lastError: status === 'failed' ? 'Ingestion needs operator review.' : null,
    });

    if (!result.ok) {
      setPendingActionId(null);
      setMutationError(result.error.message);
      return;
    }

    setPendingActionId(null);
    setNotice(`${result.data.title} is now ${result.data.status}.`);
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
    return <p className="lead">Loading knowledge sources...</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>Sources</h1>
        <p className="lead">
          Queue knowledge sources, track ingestion status and keep normalized source metadata visible
          from the admin boundary.
        </p>
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
          <span>Title</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft('title', event.target.value)}
            required
            type="text"
            value={draft.title}
          />
        </label>
        <label className="field">
          <span>Source kind</span>
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
          <span>Source URI</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateDraft('sourceUri', event.target.value)
            }
            placeholder={draft.sourceKind === 'url' ? 'https://example.com/policy' : 'Optional'}
            type="text"
            value={draft.sourceUri ?? ''}
          />
        </label>
        <label className="stack">
          <span>Scope</span>
          <select
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              updateDraft('scope', event.target.value as KnowledgeSourceCreateRequest['scope'])
            }
            value={draft.scope}
          >
            <option value="tenant">Tenant</option>
            <option value="group">Group</option>
          </select>
        </label>
        {draft.scope === 'group' ? (
          <label className="field">
            <span>Group ID</span>
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
          <span>Labels</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) => setLabelInput(event.target.value)}
            placeholder="policy, handbook, external"
            type="text"
            value={labelInput}
          />
        </label>
        <label className="field">
          <span>Source updated at</span>
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
          {pendingActionId === 'create' ? 'Queueing...' : 'Queue source'}
        </button>
      </form>

      <div className="stack">
        <h2>Source inventory</h2>
        <label className="field">
          <span>Search</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            placeholder="Filter by title, label or URI"
            type="text"
            value={query}
          />
        </label>
        <label className="field">
          <span>Status filter</span>
          <select
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setStatusFilter(event.target.value as 'all' | KnowledgeIngestionStatus)
            }
            value={statusFilter}
          >
            <option value="all">All</option>
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
                {source.sourceKind} · {source.scope}
                {source.groupId ? ` · ${source.groupId}` : ''}
              </p>
            </div>
            <p>
              Status <strong>{source.status}</strong> · chunks {source.chunkCount}
            </p>
            <p>URI: {source.sourceUri ?? 'Not provided'}</p>
            <p>Labels: {source.labels.length > 0 ? source.labels.join(', ') : 'None'}</p>
            <p>
              Owner: {source.owner.email}
              {source.owner.displayName ? ` (${source.owner.displayName})` : ''}
            </p>
            <p>Source updated: {formatTimestamp(source.updatedSourceAt)}</p>
            <p>Ingestion updated: {formatTimestamp(source.updatedAt)}</p>
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
                  {pendingActionId === `${source.id}:${status}` ? 'Saving...' : `Mark ${status}`}
                </button>
              ))}
            </div>
          </article>
        ))}

        {filteredSources.length === 0 ? <p>No knowledge sources match the current filters.</p> : null}
      </div>
    </div>
  );
}
