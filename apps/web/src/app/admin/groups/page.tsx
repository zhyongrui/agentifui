'use client';

import { fetchAdminGroups } from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

export default function AdminGroupsPage() {
  const { data, error, isLoading } = useAdminPageData(fetchAdminGroups);

  if (isLoading) {
    return <p className="lead">Loading admin groups...</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>Groups</h1>
        <p className="lead">
          Review persisted group membership volume, manager coverage and app grants before enabling
          write controls.
        </p>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {!data ? null : (
        <>
          <div className="admin-stat-grid">
            <article className="admin-stat-card">
              <span>Total groups</span>
              <strong>{data.groups.length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Total managers</span>
              <strong>
                {data.groups.reduce((total, group) => total + group.managerCount, 0)}
              </strong>
            </article>
            <article className="admin-stat-card">
              <span>Total app grants</span>
              <strong>
                {data.groups.reduce((total, group) => total + group.appGrants.length, 0)}
              </strong>
            </article>
          </div>

          <div className="workspace-badges">
            <span className="workspace-badge">
              Snapshot: {new Date(data.generatedAt).toLocaleString()}
            </span>
          </div>

          <div className="admin-grid">
            {data.groups.map(group => (
              <article className="admin-card" key={group.id}>
                <div className="section-header">
                  <div>
                    <h2>{group.name}</h2>
                    <p>{group.description}</p>
                  </div>
                  <span className="workspace-count">{group.memberCount}</span>
                </div>

                <div className="detail-list">
                  <div className="detail-row">
                    <span className="detail-label">Members</span>
                    <strong>{group.memberCount}</strong>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Managers</span>
                    <strong>{group.managerCount}</strong>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Primary members</span>
                    <strong>{group.primaryMemberCount}</strong>
                  </div>
                </div>

                <div>
                  <strong>Granted apps</strong>
                  <div className="tag-row admin-tag-row">
                    {group.appGrants.length === 0 ? (
                      <span className="tag tag-muted">No app grants</span>
                    ) : (
                      group.appGrants.map(app => (
                        <span className="tag" key={`${group.id}:${app.id}`}>
                          {app.name} · {app.shortCode}
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
