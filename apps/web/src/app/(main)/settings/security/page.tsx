'use client';

import { useProtectedSession } from '../../../../lib/use-protected-session';

export default function SecuritySettingsPage() {
  const { session, isLoading } = useProtectedSession('/settings/security');

  if (isLoading) {
    return <p className="lead">Checking your session...</p>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="stack">
      <span className="eyebrow">S1-1</span>
      <h1>Security Settings</h1>
      <p className="lead">
        MFA、密码轮换和会话控制会继续落在这里。当前页面只允许已激活用户进入。
      </p>
      <div className="detail-list">
        <div className="detail-row">
          <span className="detail-label">Current user</span>
          <strong>{session.user.email}</strong>
        </div>
        <div className="detail-row">
          <span className="detail-label">Status</span>
          <strong>{session.user.status}</strong>
        </div>
      </div>
    </div>
  );
}
