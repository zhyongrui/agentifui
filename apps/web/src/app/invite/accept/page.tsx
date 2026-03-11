'use client';

import type {
  AuthErrorResponse,
  InvitationAcceptResponse,
} from '@agentifui/shared/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { acceptInvitation } from '../../../lib/auth-client';

function isAuthErrorResponse(
  value: AuthErrorResponse | InvitationAcceptResponse
): value is AuthErrorResponse {
  return value.ok === false;
}

export default function InviteAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tokenFromQuery = searchParams.get('token') ?? '';

  useEffect(() => {
    if (tokenFromQuery) {
      setToken(currentToken => currentToken || tokenFromQuery);
    }
  }, [tokenFromQuery]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token.trim()) {
      setError('Invitation token is required.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await acceptInvitation({
        token: token.trim(),
        password,
        displayName,
      });

      if (isAuthErrorResponse(response)) {
        setError(response.error.message);
        return;
      }

      router.push('/login?activated=1');
    } catch {
      setError('Unable to reach the auth gateway. Check the gateway server and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <section className="panel">
        <span className="eyebrow">S1-1</span>
        <h1>Accept Invitation</h1>
        <p className="lead">
          使用邀请链接设置初始密码。激活成功后，账户会直接转为可登录状态。
        </p>

        {error ? <div className="notice error">{error}</div> : null}

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Invitation Token</span>
            <input
              type="text"
              placeholder="Paste the invitation token"
              value={token}
              onChange={event => setToken(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Display Name</span>
            <input
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              placeholder="Create a strong password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
            />
          </label>

          <button className="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Activating...' : 'Activate account'}
          </button>
        </form>
      </section>
    </main>
  );
}
