'use client';

import { useI18n } from '../../../components/i18n-provider';
import { fetchAdminUsers } from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

export default function AdminUsersPage() {
  const { messages, formatDateTime } = useI18n();
  const usersCopy = messages.adminUsers;
  const { data, error, isLoading } = useAdminPageData(fetchAdminUsers);

  if (isLoading) {
    return <p className="lead">{usersCopy.loading}</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>{usersCopy.title}</h1>
        <p className="lead">{usersCopy.lead}</p>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {!data ? null : (
        <>
          <div className="admin-stat-grid">
            <article className="admin-stat-card">
              <span>{usersCopy.totalUsers}</span>
              <strong>{data.users.length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{usersCopy.mfaEnabled}</span>
              <strong>{data.users.filter(user => user.mfaEnabled).length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{usersCopy.pendingReview}</span>
              <strong>{data.users.filter(user => user.status === 'pending').length}</strong>
            </article>
          </div>

          <div className="workspace-badges">
            <span className="workspace-badge">
              {usersCopy.snapshot}: {formatDateTime(data.generatedAt)}
            </span>
          </div>

          <div className="admin-grid">
            {data.users.map(user => (
              <article className="admin-card" key={user.id}>
                <div className="section-header">
                  <div>
                    <h2>{user.displayName}</h2>
                    <p>{user.email}</p>
                  </div>
                  <span className={`status-chip status-${user.status}`}>{user.status}</span>
                </div>

                <div className="detail-list">
                  <div className="detail-row">
                    <span className="detail-label">{usersCopy.lastLogin}</span>
                    <strong>{formatDateTime(user.lastLoginAt, usersCopy.never)}</strong>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{usersCopy.mfa}</span>
                    <strong>{user.mfaEnabled ? usersCopy.enabled : usersCopy.disabled}</strong>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{usersCopy.created}</span>
                    <strong>{formatDateTime(user.createdAt)}</strong>
                  </div>
                </div>

                <div className="stack">
                  <div>
                    <strong>{usersCopy.roles}</strong>
                    <div className="tag-row admin-tag-row">
                      {user.roleIds.length === 0 ? (
                        <span className="tag tag-muted">{usersCopy.noRoles}</span>
                      ) : (
                        user.roleIds.map(roleId => (
                          <span className="tag" key={roleId}>
                            {roleId}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <strong>{usersCopy.groupMemberships}</strong>
                    <div className="tag-row admin-tag-row">
                      {user.groupMemberships.length === 0 ? (
                        <span className="tag tag-muted">{usersCopy.noMemberships}</span>
                      ) : (
                        user.groupMemberships.map(membership => (
                          <span className="tag" key={`${user.id}:${membership.groupId}`}>
                            {membership.groupName}
                            {membership.isPrimary ? ` · ${usersCopy.primary}` : ''}
                            {membership.role === 'manager' ? ` · ${usersCopy.manager}` : ''}
                          </span>
                        ))
                      )}
                    </div>
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
