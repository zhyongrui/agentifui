'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  clearAuthSession,
  readAuthSession,
  type AuthSession,
} from '../../../lib/auth-session';

export default function PendingApprovalPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    const nextSession = readAuthSession(window.sessionStorage);

    if (nextSession?.user.status === 'active') {
      router.replace('/apps');
      return;
    }

    setSession(nextSession);
  }, [router]);

  function handleSignOut() {
    clearAuthSession(window.sessionStorage);
    router.push('/login');
  }

  return (
    <main className="shell">
      <section className="panel stack">
        <span className="eyebrow">S1-1</span>
        <h1>Pending Approval</h1>
        <p className="lead">
          账号已经进入租户，但当前仍处于待审核状态。审核通过前，只保留个人资料入口。
        </p>

        {session === undefined ? (
          <div className="notice info">Checking your current session.</div>
        ) : session?.user.status === 'pending' ? (
          <>
            <div className="notice info">
              Signed in as <strong>{session.user.email}</strong>. Until approval completes, access
              is limited to your profile.
            </div>

            <div className="actions">
              <Link className="primary link-button" href="/settings/profile">
                Open profile
              </Link>
              <button className="secondary" type="button" onClick={handleSignOut}>
                Back to login
              </button>
            </div>
          </>
        ) : (
          <div className="actions">
            <Link className="primary link-button" href="/login">
              Go to login
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
