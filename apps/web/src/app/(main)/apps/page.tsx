'use client';

import { useProtectedSession } from '../../../lib/use-protected-session';

export default function AppsPage() {
  const { session, isLoading } = useProtectedSession('/apps');

  if (isLoading) {
    return <p className="lead">Checking your session...</p>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="stack">
      <span className="eyebrow">S1-3 placeholder</span>
      <h1>Apps workspace</h1>
      <p className="lead">
        欢迎回来，{session.user.displayName}。这里会在 `S1-3` 接入真正的应用目录。
      </p>
      <div className="detail-list">
        <div className="detail-row">
          <span className="detail-label">Current user</span>
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
