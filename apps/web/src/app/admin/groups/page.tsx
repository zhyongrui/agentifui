'use client';

import { useI18n } from '../../../components/i18n-provider';
import { fetchAdminGroups } from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

export default function AdminGroupsPage() {
  const { messages, formatDateTime } = useI18n();
  const groupsCopy = messages.adminGroups;
  const { data, error, isLoading } = useAdminPageData(fetchAdminGroups);

  if (isLoading) {
    return <p className="lead">{groupsCopy.loading}</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>{groupsCopy.title}</h1>
        <p className="lead">{groupsCopy.lead}</p>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {!data ? null : (
        <>
          <div className="admin-stat-grid">
            <article className="admin-stat-card">
              <span>{groupsCopy.totalGroups}</span>
              <strong>{data.groups.length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{groupsCopy.totalManagers}</span>
              <strong>
                {data.groups.reduce((total, group) => total + group.managerCount, 0)}
              </strong>
            </article>
            <article className="admin-stat-card">
              <span>{groupsCopy.totalAppGrants}</span>
              <strong>
                {data.groups.reduce((total, group) => total + group.appGrants.length, 0)}
              </strong>
            </article>
          </div>

          <div className="workspace-badges">
            <span className="workspace-badge">
              {groupsCopy.snapshot}: {formatDateTime(data.generatedAt)}
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
                    <span className="detail-label">{groupsCopy.members}</span>
                    <strong>{group.memberCount}</strong>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{groupsCopy.managers}</span>
                    <strong>{group.managerCount}</strong>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{groupsCopy.primaryMembers}</span>
                    <strong>{group.primaryMemberCount}</strong>
                  </div>
                </div>

                <div>
                  <strong>{groupsCopy.grantedApps}</strong>
                  <div className="tag-row admin-tag-row">
                    {group.appGrants.length === 0 ? (
                      <span className="tag tag-muted">{groupsCopy.noAppGrants}</span>
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
