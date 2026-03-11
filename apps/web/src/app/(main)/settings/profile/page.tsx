'use client';

import { useProtectedSession } from '../../../../lib/use-protected-session';

export default function ProfileSettingsPage() {
  const { session, isLoading } = useProtectedSession('/settings/profile');

  if (isLoading) {
    return <p className="lead">Checking your session...</p>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="stack page-narrow">
      <span className="eyebrow">S1-1</span>
      <h1>Profile</h1>
      <p className="lead">这是当前认证切片里唯一允许 `pending` 用户继续访问的主区页面。</p>

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
  );
}
