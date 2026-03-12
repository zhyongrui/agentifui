'use client';

import type {
  AdminAuditFilters,
  AdminAuditPayloadMode,
  AdminAuditResponse,
} from '@agentifui/shared/admin';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { clearAuthSession } from '../../../lib/auth-session';
import { exportAdminAudit, fetchAdminAudit } from '../../../lib/admin-client';
import { useProtectedSession } from '../../../lib/use-protected-session';

type AuditFilterFormState = {
  action: string;
  level: '' | 'critical' | 'info' | 'warning';
  actorUserId: string;
  entityType: '' | 'conversation' | 'run' | 'session' | 'user' | 'workspace_app';
  traceId: string;
  runId: string;
  conversationId: string;
  payloadMode: AdminAuditPayloadMode;
  limit: string;
};

const EMPTY_FILTERS: AuditFilterFormState = {
  action: '',
  level: '',
  actorUserId: '',
  entityType: '',
  traceId: '',
  runId: '',
  conversationId: '',
  payloadMode: 'masked',
  limit: '',
};

function normalizeFilters(filters: AuditFilterFormState): AdminAuditFilters {
  const limit = filters.limit.trim();

  return {
    action: filters.action.trim() || null,
    level: filters.level || null,
    actorUserId: filters.actorUserId.trim() || null,
    entityType: filters.entityType || null,
    traceId: filters.traceId.trim() || null,
    runId: filters.runId.trim() || null,
    conversationId: filters.conversationId.trim() || null,
    payloadMode: filters.payloadMode,
    limit: limit ? Number.parseInt(limit, 10) : null,
  };
}

function hasAppliedFilters(filters: AdminAuditFilters) {
  return Object.entries(filters).some(([key, value]) => {
    if (key === 'payloadMode') {
      return value === 'raw';
    }

    return value !== null && value !== undefined && value !== '';
  });
}

function buildFilterTags(filters: AdminAuditFilters) {
  return [
    filters.action ? `Action: ${filters.action}` : null,
    filters.level ? `Level: ${filters.level}` : null,
    filters.actorUserId ? `Actor: ${filters.actorUserId}` : null,
    filters.entityType ? `Entity: ${filters.entityType}` : null,
    filters.traceId ? `Trace: ${filters.traceId}` : null,
    filters.runId ? `Run: ${filters.runId}` : null,
    filters.conversationId ? `Conversation: ${filters.conversationId}` : null,
    filters.payloadMode === 'raw' ? 'Payload: raw' : null,
    typeof filters.limit === 'number' ? `Limit: ${filters.limit}` : null,
  ].filter((value): value is string => Boolean(value));
}

export default function AdminAuditPage() {
  const router = useRouter();
  const { session, isLoading: isSessionLoading } = useProtectedSession('/admin');
  const [data, setData] = useState<AdminAuditResponse['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<null | 'csv' | 'json'>(null);
  const [draftFilters, setDraftFilters] = useState<AuditFilterFormState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilterFormState>(EMPTY_FILTERS);

  useEffect(() => {
    if (!session) {
      setData(null);
      setError(null);
      setIsDataLoading(false);
      setExportNotice(null);
      setExportError(null);
      setExportingFormat(null);
      return;
    }

    let isCancelled = false;

    setIsDataLoading(true);
    setError(null);

    fetchAdminAudit(session.sessionToken, normalizeFilters(appliedFilters))
      .then(result => {
        if (isCancelled) {
          return;
        }

        if (!result.ok) {
          setData(null);

          if (result.error.code === 'ADMIN_UNAUTHORIZED') {
            clearAuthSession(window.sessionStorage);
            router.replace('/login');
            return;
          }

          setError(result.error.message);
          return;
        }

        setData(result.data);
      })
      .catch(() => {
        if (!isCancelled) {
          setData(null);
          setError('Admin audit 加载失败，请稍后重试。');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsDataLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [appliedFilters, router, session]);

  if (isSessionLoading || (isDataLoading && !data)) {
    return <p className="lead">Loading admin audit...</p>;
  }

  async function handleExport(format: 'csv' | 'json') {
    if (!session) {
      return;
    }

    setExportNotice(null);
    setExportError(null);
    setExportingFormat(format);

    try {
      const result = await exportAdminAudit(
        session.sessionToken,
        format,
        normalizeFilters(appliedFilters)
      );

      if ('ok' in result) {
        if (result.error.code === 'ADMIN_UNAUTHORIZED') {
          clearAuthSession(window.sessionStorage);
          router.replace('/login');
          return;
        }

        setExportError(result.error.message);
        return;
      }

      setExportNotice(`${format.toUpperCase()} export ready: ${result.metadata.filename}`);

      try {
        const objectUrl = URL.createObjectURL(result.blob);
        const anchor = document.createElement('a');

        anchor.href = objectUrl;
        anchor.download = result.metadata.filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
        }, 0);

        setExportNotice(`${format.toUpperCase()} export downloaded: ${result.metadata.filename}`);
      } catch {
        setExportError(
          'Audit export is ready, but this browser could not start the download automatically.'
        );
      }
    } catch {
      setExportError('Audit export failed. Please retry in a moment.');
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>Audit</h1>
        <p className="lead">
          Tenant-level audit visibility with action, actor and trace filters for persisted run-aware
          governance review.
        </p>
      </div>

      <section className="admin-card stack">
        <div className="section-header">
          <div>
            <h2>Filters</h2>
            <p>Narrow audit events by action, actor or workspace execution trace.</p>
          </div>
          <span className="workspace-count">{data?.events.length ?? 0}</span>
        </div>

        <form
          className="stack"
          onSubmit={event => {
            event.preventDefault();
            setAppliedFilters({ ...draftFilters });
          }}
        >
          <div className="workspace-toolbar">
            <label className="field">
              <span>Action</span>
              <input
                aria-label="Audit action filter"
                value={draftFilters.action}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    action: event.target.value,
                  }));
                }}
              />
            </label>
            <label className="field">
              <span>Level</span>
              <select
                aria-label="Audit level filter"
                value={draftFilters.level}
                onChange={event => {
                  const level = event.target.value as AuditFilterFormState['level'];

                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    level,
                  }));
                }}
              >
                <option value="">All levels</option>
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="critical">critical</option>
              </select>
            </label>
            <label className="field">
              <span>Entity Type</span>
              <select
                aria-label="Audit entity type filter"
                value={draftFilters.entityType}
                onChange={event => {
                  const entityType = event.target.value as AuditFilterFormState['entityType'];

                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    entityType,
                  }));
                }}
              >
                <option value="">All entity types</option>
                <option value="user">user</option>
                <option value="session">session</option>
                <option value="workspace_app">workspace_app</option>
                <option value="conversation">conversation</option>
                <option value="run">run</option>
              </select>
            </label>
          </div>

          <div className="workspace-toolbar">
            <label className="field">
              <span>Actor User ID</span>
              <input
                aria-label="Audit actor filter"
                value={draftFilters.actorUserId}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    actorUserId: event.target.value,
                  }));
                }}
              />
            </label>
            <label className="field">
              <span>Trace ID</span>
              <input
                aria-label="Audit trace filter"
                value={draftFilters.traceId}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    traceId: event.target.value,
                  }));
                }}
              />
            </label>
            <label className="field">
              <span>Run ID</span>
              <input
                aria-label="Audit run filter"
                value={draftFilters.runId}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    runId: event.target.value,
                  }));
                }}
              />
            </label>
          </div>

          <div className="workspace-toolbar">
            <label className="field">
              <span>Conversation ID</span>
              <input
                aria-label="Audit conversation filter"
                value={draftFilters.conversationId}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    conversationId: event.target.value,
                  }));
                }}
              />
            </label>
            <label className="field">
              <span>Payload</span>
              <select
                aria-label="Audit payload mode"
                value={draftFilters.payloadMode}
                onChange={event => {
                  const payloadMode = event.target.value as AdminAuditPayloadMode;

                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    payloadMode,
                  }));
                }}
              >
                <option value="masked">masked</option>
                <option value="raw">raw</option>
              </select>
            </label>
            <label className="field">
              <span>Limit</span>
              <input
                aria-label="Audit limit filter"
                inputMode="numeric"
                placeholder="40"
                value={draftFilters.limit}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    limit: event.target.value,
                  }));
                }}
              />
            </label>
            <div className="field">
              <span>Actions</span>
              <div className="actions">
                <button className="primary" type="submit" disabled={isDataLoading}>
                  Apply filters
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setDraftFilters(EMPTY_FILTERS);
                    setAppliedFilters(EMPTY_FILTERS);
                  }}
                  disabled={isDataLoading}
                >
                  Clear
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    void handleExport('json');
                  }}
                  disabled={isDataLoading || exportingFormat !== null}
                >
                  {exportingFormat === 'json' ? 'Exporting JSON...' : 'Export JSON'}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    void handleExport('csv');
                  }}
                  disabled={isDataLoading || exportingFormat !== null}
                >
                  {exportingFormat === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
                </button>
              </div>
            </div>
          </div>
        </form>

        {data && hasAppliedFilters(data.appliedFilters) ? (
          <div className="tag-row admin-tag-row">
            {buildFilterTags(data.appliedFilters).map(tag => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="helper-text">No filters applied. Showing the latest tenant audit window.</p>
        )}
      </section>

      {error ? <div className="notice error">{error}</div> : null}
      {exportError ? <div className="notice error">{exportError}</div> : null}
      {exportNotice ? <div className="notice success">{exportNotice}</div> : null}

      {!data ? null : (
        <>
          <div className="workspace-badges">
            <span className="workspace-badge">
              Snapshot: {new Date(data.generatedAt).toLocaleString()}
            </span>
            <span className="workspace-badge">{data.events.length} matching events</span>
          </div>

          <section className="admin-card stack">
            <div className="section-header">
              <div>
                <h2>Top actions</h2>
                <p>Filtered tenant-wide audit volume grouped by action.</p>
              </div>
            </div>
            <div className="tag-row admin-tag-row">
              {data.countsByAction.length === 0 ? (
                <span className="tag tag-muted">No audit events</span>
              ) : (
                data.countsByAction.map(actionCount => (
                  <span className="tag" key={actionCount.action}>
                    {actionCount.action} · {actionCount.count}
                  </span>
                ))
              )}
            </div>
          </section>

          {data.events.length === 0 ? (
            <div className="workspace-empty">No audit events matched the current filter set.</div>
          ) : (
            <div className="admin-grid">
              {data.events.map(event => (
                <article className="admin-card" key={event.id}>
                  <div className="section-header">
                    <div>
                      <h2>{event.action}</h2>
                      <p>
                        {event.entityType}
                        {event.entityId ? ` · ${event.entityId}` : ''}
                      </p>
                    </div>
                    <span className={`status-chip status-${event.level}`}>{event.level}</span>
                  </div>

                  <div className="detail-list">
                    <div className="detail-row">
                      <span className="detail-label">Occurred</span>
                      <strong>{new Date(event.occurredAt).toLocaleString()}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Actor</span>
                      <strong>{event.actorUserId ?? 'System'}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">IP</span>
                      <strong>{event.ipAddress ?? 'N/A'}</strong>
                    </div>
                    {event.context.traceId ? (
                      <div className="detail-row">
                        <span className="detail-label">Trace</span>
                        <strong>{event.context.traceId}</strong>
                      </div>
                    ) : null}
                    {event.context.runId ? (
                      <div className="detail-row">
                        <span className="detail-label">Run</span>
                        <strong>{event.context.runId}</strong>
                      </div>
                    ) : null}
                    {event.context.conversationId ? (
                      <div className="detail-row">
                        <span className="detail-label">Conversation</span>
                        <strong>{event.context.conversationId}</strong>
                      </div>
                    ) : null}
                    {event.context.appName || event.context.appId ? (
                      <div className="detail-row">
                        <span className="detail-label">App</span>
                        <strong>{event.context.appName ?? event.context.appId}</strong>
                      </div>
                    ) : null}
                    {event.context.activeGroupName || event.context.activeGroupId ? (
                      <div className="detail-row">
                        <span className="detail-label">Group</span>
                        <strong>{event.context.activeGroupName ?? event.context.activeGroupId}</strong>
                      </div>
                    ) : null}
                  </div>

                  <div className="admin-code-block">
                    <strong>Payload</strong>
                    {event.payloadInspection.containsSensitiveData ? (
                      <>
                        <div className="tag-row admin-tag-row">
                          <span className="tag">
                            {event.payloadInspection.highRiskMatchCount > 0
                              ? 'Sensitive payload'
                              : 'PII detected'}
                          </span>
                          <span className="tag tag-muted">
                            {event.payloadInspection.matches.length} matches
                          </span>
                          <span className="tag tag-muted">
                            mode:{event.payloadInspection.mode}
                          </span>
                        </div>
                        <p className="helper-text">
                          {event.payloadInspection.mode === 'masked'
                            ? 'Sensitive fields are masked by default. Switch Payload mode to raw to inspect the original values.'
                            : 'Raw payload mode is active. Sensitive values are visible in the payload block below.'}
                        </p>
                        <div className="actions">
                          <button
                            className="secondary"
                            type="button"
                            disabled={isDataLoading}
                            onClick={() => {
                              const nextPayloadMode: AdminAuditPayloadMode =
                                data.appliedFilters.payloadMode === 'raw' ? 'masked' : 'raw';

                              setDraftFilters(currentValue => ({
                                ...currentValue,
                                payloadMode: nextPayloadMode,
                              }));
                              setAppliedFilters(currentValue => ({
                                ...currentValue,
                                payloadMode: nextPayloadMode,
                              }));
                            }}
                          >
                            {data.appliedFilters.payloadMode === 'raw'
                              ? 'Hide raw payloads'
                              : 'Show raw payloads'}
                          </button>
                        </div>
                        <div className="detail-list">
                          {event.payloadInspection.matches.map(match => (
                            <div className="detail-row" key={`${event.id}:${match.path}`}>
                              <span className="detail-label">{match.path}</span>
                              <strong>
                                {match.detector} · {match.risk} · {match.valuePreview}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                    <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
