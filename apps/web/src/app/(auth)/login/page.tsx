'use client';

import type { AuthErrorResponse, LoginResponse } from '@agentifui/shared/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { loginWithPassword } from '../../../lib/auth-client';

function isAuthErrorResponse(
  value: AuthErrorResponse | LoginResponse
): value is AuthErrorResponse {
  return value.ok === false;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const registered = searchParams.get('registered') === '1';
  const activated = searchParams.get('activated') === '1';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await loginWithPassword({
        email,
        password,
      });

      if (isAuthErrorResponse(response)) {
        if (response.error.code === 'AUTH_ACCOUNT_PENDING') {
          router.push('/auth/pending');
          return;
        }

        setError(response.error.message);
        return;
      }

      window.sessionStorage.setItem(
        'agentifui.session',
        JSON.stringify(response.data)
      );
      router.push('/apps');
    } catch {
      setError('Unable to reach the auth gateway. Check the gateway server and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <span className="eyebrow">S1-1</span>
      <h1>Login</h1>
      <p className="lead">
        从这里开始实现邮箱密码登录、SSO 域名识别、待审核状态和 MFA。
      </p>

      {registered ? (
        <div className="notice success">Registration complete. You can now sign in.</div>
      ) : activated ? (
        <div className="notice success">Invitation accepted. Sign in with your new password.</div>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={event => setPassword(event.target.value)}
            required
          />
        </label>

        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Continue'}
        </button>
      </form>
    </section>
  );
}
