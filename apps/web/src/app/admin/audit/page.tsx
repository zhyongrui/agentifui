'use client';

import { fetchAdminAudit } from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

export default function AdminAuditPage() {
  const { data, error, isLoading } = useAdminPageData(fetchAdminAudit);

  if (isLoading) {
    return <p className="lead">Loading admin audit...</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>Audit</h1>
        <p className="lead">
          Tenant-level auth audit visibility for manual governance review and future export flows.
        </p>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {!data ? null : (
        <>
          <div className="workspace-badges">
            <span className="workspace-badge">
              Snapshot: {new Date(data.generatedAt).toLocaleString()}
            </span>
            <span className="workspace-badge">{data.events.length} recent events</span>
          </div>

          <section className="admin-card stack">
            <div className="section-header">
              <div>
                <h2>Top actions</h2>
                <p>Recent tenant-wide audit volume grouped by action.</p>
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
                </div>

                <div className="admin-code-block">
                  <strong>Payload</strong>
                  <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
