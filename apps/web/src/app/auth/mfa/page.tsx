'use client';

import type { AuthErrorResponse, MfaVerifyResponse } from '@agentifui/shared/auth';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { verifyMfa } from '../../../lib/auth-client';
import {
  clearAuthMfaTicket,
  getPostAuthRedirect,
  readAuthMfaTicket,
  readAuthSession,
  writeAuthSession,
} from '../../../lib/auth-session';

function isAuthErrorResponse(
  value: AuthErrorResponse | MfaVerifyResponse
): value is AuthErrorResponse {
  return value.ok === false;
}

export default function MfaVerifyPage() {
  const router = useRouter();
  const [ticket, setTicket] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const existingSession = readAuthSession(window.sessionStorage);

    if (existingSession) {
      router.replace(getPostAuthRedirect(existingSession.user.status));
      return;
    }

    const pendingTicket = readAuthMfaTicket(window.sessionStorage);

    if (!pendingTicket) {
      router.replace('/login');
      return;
    }

    setTicket(pendingTicket.ticket);
    setEmail(pendingTicket.email);
    setIsReady(true);
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!ticket) {
      router.replace('/login');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await verifyMfa({
        ticket,
        code,
      });

      if (isAuthErrorResponse(response)) {
        setError(response.error.message);
        return;
      }

      clearAuthMfaTicket(window.sessionStorage);
      writeAuthSession(window.sessionStorage, response.data);
      router.push(getPostAuthRedirect(response.data.user.status));
    } catch {
      setError('Unable to reach the auth gateway. Check the gateway server and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isReady) {
    return (
      <main className="shell">
        <section className="panel">
          <span className="eyebrow">S1-1</span>
          <h1>MFA Verification</h1>
          <p className="lead">Checking your MFA challenge...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="panel">
        <span className="eyebrow">S1-1</span>
        <h1>MFA Verification</h1>
        <p className="lead">
          {email ? `账户 ${email} 已启用 TOTP。` : '当前账户已启用 TOTP。'}
          请输入认证器中的 6 位动态验证码完成登录。
        </p>

        {error ? <div className="notice error">{error}</div> : null}

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>TOTP Code</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              placeholder="123456"
              value={code}
              onChange={event => setCode(event.target.value)}
              required
            />
          </label>

          <button className="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Verifying...' : 'Complete sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
