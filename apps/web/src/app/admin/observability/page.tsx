'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { useI18n } from '../../../components/i18n-provider';
import { SectionSkeleton } from '../../../components/section-state';
import {
  createAdminObservabilityAnnotation,
  fetchAdminObservability,
  fetchAdminTenants,
} from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

type Notice = {
  tone: 'error' | 'success';
  message: string;
};

export default function AdminObservabilityPage() {
  const { locale, formatDateTime } = useI18n();
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenantOptions, setTenantOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState({
    traceId: '',
    runId: '',
    note: '',
  });
  const { data, error, isLoading, reload, session } = useAdminPageData(sessionToken =>
    fetchAdminObservability(sessionToken, {
      tenantId: selectedTenantId || undefined,
    })
  );

  useEffect(() => {
    if (!session || selectedTenantId) {
      return;
    }

    setSelectedTenantId(session.user.tenantId);
  }, [selectedTenantId, session]);

  useEffect(() => {
    if (!session) {
      setTenantOptions([]);
      return;
    }

    let cancelled = false;

    void fetchAdminTenants(session.sessionToken)
      .then(result => {
        if (cancelled || !result.ok) {
          return;
        }

        setTenantOptions(result.data.tenants.map(tenant => ({ id: tenant.id, name: tenant.name })));
      })
      .catch(() => {
        if (!cancelled) {
          setTenantOptions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const copy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            loading: '正在加载可观测性概览...',
            title: '可观测性',
            lead: '查看核心 SLI、告警、事件时间线和人工标注，快速定位运行时与治理故障。',
            tenant: '租户范围',
            generatedAt: '生成时间',
            sli: '服务指标',
            routes: '路由指标',
            alerts: '当前告警',
            timeline: '事件时间线',
            annotations: '操作员标注',
            noAlerts: '当前没有触发中的告警。',
            noTimeline: '当前没有高风险事件时间线。',
            noAnnotations: '还没有人工标注。',
            noRoutes: '还没有采样到路由指标。',
            target: '目标',
            runbook: '运行手册',
            note: '标注内容',
            traceId: 'Trace ID',
            runId: 'Run ID',
            save: '保存标注',
            saving: '保存中...',
            requestFailed: '请求失败，请稍后重试。',
            annotationSaved: '已保存操作员标注。',
            count: '次数',
            average: '平均耗时',
            maximum: '最大耗时',
          }
        : {
            loading: 'Loading observability overview...',
            title: 'Observability',
            lead: 'Inspect core SLIs, alerts, incident timelines and operator annotations for runtime and governance triage.',
            tenant: 'Tenant scope',
            generatedAt: 'Generated at',
            sli: 'Service indicators',
            routes: 'Route metrics',
            alerts: 'Active alerts',
            timeline: 'Incident timeline',
            annotations: 'Operator annotations',
            noAlerts: 'No active alerts right now.',
            noTimeline: 'No high-risk timeline entries yet.',
            noAnnotations: 'No operator annotations yet.',
            noRoutes: 'No route metrics sampled yet.',
            target: 'Target',
            runbook: 'Runbook',
            note: 'Note',
            traceId: 'Trace ID',
            runId: 'Run ID',
            save: 'Save annotation',
            saving: 'Saving...',
            requestFailed: 'Request failed. Please retry.',
            annotationSaved: 'Operator annotation saved.',
            count: 'Count',
            average: 'Average',
            maximum: 'Max',
          },
    [locale]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setPendingActionId('annotation');
    setNotice(null);

    try {
      const result = await createAdminObservabilityAnnotation(session.sessionToken, {
        tenantId: selectedTenantId || undefined,
        traceId: annotationDraft.traceId.trim() || null,
        runId: annotationDraft.runId.trim() || null,
        note: annotationDraft.note,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      setAnnotationDraft({
        traceId: '',
        runId: '',
        note: '',
      });
      setNotice({
        tone: 'success',
        message: copy.annotationSaved,
      });
      reload();
    } catch {
      setNotice({
        tone: 'error',
        message: copy.requestFailed,
      });
    } finally {
      setPendingActionId(null);
    }
  }

  if (isLoading) {
    return <SectionSkeleton blocks={6} lead={copy.loading} title={copy.title} />;
  }

  return (
    <div className="stack">
      <div>
        <h1>{copy.title}</h1>
        <p className="lead">{copy.lead}</p>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className={`notice ${notice.tone}`}>{notice.message}</div> : null}

      <section className="admin-card stack">
        <div className="workspace-toolbar">
          <label className="field">
            <span>{copy.tenant}</span>
            <select value={selectedTenantId} onChange={event => setSelectedTenantId(event.target.value)}>
              {selectedTenantId ? <option value={selectedTenantId}>{selectedTenantId}</option> : null}
              {tenantOptions
                .filter(tenant => tenant.id !== selectedTenantId)
                .map(tenant => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="workspace-metadata">
            <span>{copy.generatedAt}</span>
            <strong>{data ? formatDateTime(data.generatedAt) : '—'}</strong>
          </div>
        </div>
      </section>

      <section className="admin-card stack">
        <div className="section-header">
          <div>
            <h2>{copy.sli}</h2>
          </div>
        </div>
        <div className="metrics-grid">
          {data?.sli.map(item => (
            <article className="metric-card" key={item.key}>
              <span>{item.label}</span>
              <strong>{item.observed}</strong>
              <small>
                {copy.target}: {item.target}
              </small>
              <span className={`status-chip status-${item.status}`}>{item.status}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-card stack">
        <div className="section-header">
          <div>
            <h2>{copy.alerts}</h2>
          </div>
        </div>
        {data?.alerts.length ? (
          <div className="stack">
            {data.alerts.map(alert => (
              <article className="audit-event-card" key={alert.id}>
                <div className="section-header">
                  <div>
                    <h2>{alert.summary}</h2>
                    <p>{alert.detail ?? '—'}</p>
                  </div>
                  <span className={`status-chip status-${alert.severity}`}>{alert.severity}</span>
                </div>
                {alert.runbookHref ? (
                  <p>
                    {copy.runbook}: <code>{alert.runbookHref}</code>
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="lead">{copy.noAlerts}</p>
        )}
      </section>

      <section className="admin-card stack">
        <div className="section-header">
          <div>
            <h2>{copy.timeline}</h2>
          </div>
        </div>
        {data?.incidentTimeline.length ? (
          <div className="stack">
            {data.incidentTimeline.map(entry => (
              <article className="audit-event-card" key={entry.id}>
                <div className="section-header">
                  <div>
                    <h2>{entry.summary}</h2>
                    <p>{formatDateTime(entry.occurredAt)}</p>
                  </div>
                  <span className="status-chip status-warning">{entry.source}</span>
                </div>
                <p>
                  {copy.traceId}: {entry.traceId ?? '—'} · {copy.runId}: {entry.runId ?? '—'}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="lead">{copy.noTimeline}</p>
        )}
      </section>

      <section className="admin-card stack">
        <div className="section-header">
          <div>
            <h2>{copy.annotations}</h2>
          </div>
        </div>
        <form className="stack" onSubmit={handleSubmit}>
          <div className="workspace-toolbar">
            <label className="field">
              <span>{copy.traceId}</span>
              <input
                value={annotationDraft.traceId}
                onChange={event =>
                  setAnnotationDraft(current => ({ ...current, traceId: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>{copy.runId}</span>
              <input
                value={annotationDraft.runId}
                onChange={event =>
                  setAnnotationDraft(current => ({ ...current, runId: event.target.value }))
                }
              />
            </label>
          </div>
          <label className="field">
            <span>{copy.note}</span>
            <textarea
              rows={4}
              value={annotationDraft.note}
              onChange={event =>
                setAnnotationDraft(current => ({ ...current, note: event.target.value }))
              }
            />
          </label>
          <div className="actions">
            <button
              className="button-primary"
              disabled={pendingActionId === 'annotation' || !annotationDraft.note.trim()}
              type="submit"
            >
              {pendingActionId === 'annotation' ? copy.saving : copy.save}
            </button>
          </div>
        </form>
        {data?.annotations.length ? (
          <div className="stack">
            {data.annotations.map(annotation => (
              <article className="audit-event-card" key={annotation.id}>
                <div className="section-header">
                  <div>
                    <h2>{annotation.note}</h2>
                    <p>{formatDateTime(annotation.createdAt)}</p>
                  </div>
                  <span className="status-chip status-info">{annotation.createdByUserId ?? 'system'}</span>
                </div>
                <p>
                  {copy.traceId}: {annotation.traceId ?? '—'} · {copy.runId}: {annotation.runId ?? '—'}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="lead">{copy.noAnnotations}</p>
        )}
      </section>

      <section className="admin-card stack">
        <div className="section-header">
          <div>
            <h2>{copy.routes}</h2>
          </div>
        </div>
        {data?.routes.length ? (
          <div className="stack">
            {data.routes.slice(0, 12).map(route => (
              <article className="audit-event-card" key={`${route.method}:${route.route}:${route.statusCode}`}>
                <div className="section-header">
                  <div>
                    <h2>
                      {route.method} {route.route}
                    </h2>
                    <p>
                      {copy.count}: {route.count} · {copy.average}: {route.avgDurationMs.toFixed(1)} ms ·{' '}
                      {copy.maximum}: {route.maxDurationMs.toFixed(1)} ms
                    </p>
                  </div>
                  <span className="status-chip status-info">{route.statusCode}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="lead">{copy.noRoutes}</p>
        )}
      </section>
    </div>
  );
}
