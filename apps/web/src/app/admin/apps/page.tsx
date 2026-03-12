'use client';

import { fetchAdminApps } from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export default function AdminAppsPage() {
  const { data, error, isLoading } = useAdminPageData(fetchAdminApps);

  if (isLoading) {
    return <p className="lead">Loading admin apps...</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>Apps</h1>
        <p className="lead">
          Read-only registry view for app grants, deny overrides and launch activity.
        </p>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {!data ? null : (
        <>
          <div className="admin-stat-grid">
            <article className="admin-stat-card">
              <span>Total apps</span>
              <strong>{data.apps.length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Direct user grants</span>
              <strong>
                {data.apps.reduce((total, app) => total + app.directUserGrantCount, 0)}
              </strong>
            </article>
            <article className="admin-stat-card">
              <span>Deny overrides</span>
              <strong>{data.apps.reduce((total, app) => total + app.denyGrantCount, 0)}</strong>
            </article>
          </div>

          <div className="workspace-badges">
            <span className="workspace-badge">
              Snapshot: {new Date(data.generatedAt).toLocaleString()}
            </span>
          </div>

          <div className="app-grid">
            {data.apps.map(app => (
              <article className="app-card admin-card" key={app.id}>
                <div className="app-card-header">
                  <div className="app-avatar">{app.shortCode}</div>
                  <div className="app-card-copy">
                    <div className="app-title-row">
                      <h2>{app.name}</h2>
                      <span className={`status-chip status-${app.status}`}>{app.status}</span>
                    </div>
                    <p>{app.summary}</p>
                  </div>
                </div>

                <div className="tag-row">
                  <span className="tag">{app.kind}</span>
                  <span className="tag">Cost {app.launchCost}</span>
                  {app.grantedRoleIds.map(roleId => (
                    <span className="tag tag-muted" key={`${app.id}:${roleId}`}>
                      role:{roleId}
                    </span>
                  ))}
                </div>

                <div className="detail-list">
                  <div className="detail-row">
                    <span className="detail-label">Launch count</span>
                    <strong>{app.launchCount}</strong>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Last launch</span>
                    <strong>{formatTimestamp(app.lastLaunchedAt)}</strong>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Direct user grants</span>
                    <strong>{app.directUserGrantCount}</strong>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Deny overrides</span>
                    <strong>{app.denyGrantCount}</strong>
                  </div>
                </div>

                <div>
                  <strong>Granted groups</strong>
                  <div className="tag-row admin-tag-row">
                    {app.grantedGroups.length === 0 ? (
                      <span className="tag tag-muted">No group grants</span>
                    ) : (
                      app.grantedGroups.map(group => (
                        <span className="tag" key={`${app.id}:${group.id}`}>
                          {group.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
