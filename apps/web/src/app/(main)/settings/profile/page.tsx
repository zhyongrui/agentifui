import { ProtectedPage } from '../../../../components/protected-page';

export default function ProfileSettingsPage() {
  return (
    <ProtectedPage path="/settings/profile">
      {session => (
        <div className="stack">
          <span className="eyebrow">S1-1</span>
          <h1>Profile</h1>
          <p className="lead">
            这是当前认证切片里唯一允许 `pending` 用户继续访问的主区页面。
          </p>

          <div className="detail-list">
            <div className="detail-row">
              <span className="detail-label">Display name</span>
              <strong>{session.user.displayName}</strong>
            </div>
            <div className="detail-row">
              <span className="detail-label">Email</span>
              <strong>{session.user.email}</strong>
            </div>
            <div className="detail-row">
              <span className="detail-label">Tenant</span>
              <strong>{session.user.tenantId}</strong>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <strong>{session.user.status}</strong>
            </div>
          </div>
        </div>
      )}
    </ProtectedPage>
  );
}
