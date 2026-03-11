'use client';

import type { AuthErrorResponse, RegisterResponse } from '@agentifui/shared/auth';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { registerWithPassword } from '../../../lib/auth-client';

function isAuthErrorResponse(
  value: AuthErrorResponse | RegisterResponse
): value is AuthErrorResponse {
  return value.ok === false;
}

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await registerWithPassword({
        displayName,
        email,
        password,
      });

      if (isAuthErrorResponse(response)) {
        setError(response.error.message);
        return;
      }

      router.push('/login?registered=1');
    } catch {
      setError('Unable to reach the auth gateway. Check the gateway server and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <span className="eyebrow">S1-1</span>
      <h1>Register</h1>
      <p className="lead">这里作为租户内注册、邀请激活和密码策略校验的起点。</p>

      {error ? <div className="notice error">{error}</div> : null}

      <form className="stack" onSubmit={handleSubmit}>
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
            placeholder="Create a strong password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            required
          />
        </label>

        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </section>
  );
}
