'use client';

import { fetchAdminUsers } from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export default function AdminUsersPage() {
  const { data, error, isLoading } = useAdminPageData(fetchAdminUsers);

  if (isLoading) {
    return <p className="lead">Loading admin users...</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>Users</h1>
        <p className="lead">
          Read-only tenant user inventory with status, MFA, roles and persisted group membership.
        </p>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {!data ? null : (
        <>
          <div className="admin-stat-grid">
            <article className="admin-stat-card">
              <span>Total users</span>
              <strong>{data.users.length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>MFA enabled</span>
              <strong>{data.users.filter(user => user.mfaEnabled).length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Pending review</span>
              <strong>{data.users.filter(user => user.status === 'pending').length}</strong>
            </article>
          </div>

          <div className="workspace-badges">
            <span className="workspace-badge">
              Snapshot: {new Date(data.generatedAt).toLocaleString()}
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
                    <span className="detail-label">Last login</span>
                    <strong>{formatTimestamp(user.lastLoginAt)}</strong>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">MFA</span>
                    <strong>{user.mfaEnabled ? 'Enabled' : 'Disabled'}</strong>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Created</span>
                    <strong>{formatTimestamp(user.createdAt)}</strong>
                  </div>
                </div>

                <div className="stack">
                  <div>
                    <strong>Roles</strong>
                    <div className="tag-row admin-tag-row">
                      {user.roleIds.length === 0 ? (
                        <span className="tag tag-muted">No persisted roles</span>
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
                    <strong>Group memberships</strong>
                    <div className="tag-row admin-tag-row">
                      {user.groupMemberships.length === 0 ? (
                        <span className="tag tag-muted">No persisted memberships</span>
                      ) : (
                        user.groupMemberships.map(membership => (
                          <span className="tag" key={`${user.id}:${membership.groupId}`}>
                            {membership.groupName}
                            {membership.isPrimary ? ' · primary' : ''}
                            {membership.role === 'manager' ? ' · manager' : ''}
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
