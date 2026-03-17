'use client';

import type { AuthErrorResponse, RegisterResponse } from '@agentifui/shared/auth';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { useI18n } from '../../../components/i18n-provider';
import { registerWithPassword } from '../../../lib/auth-client';

function isAuthErrorResponse(
  value: AuthErrorResponse | RegisterResponse
): value is AuthErrorResponse {
  return value.ok === false;
}

export default function RegisterPage() {
  const { messages } = useI18n();
  const registerMessages = messages.auth.register;
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

      window.location.assign('/login?registered=1');
    } catch {
      setError(registerMessages.networkError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <span className="eyebrow">{registerMessages.eyebrow}</span>
      <h1>{registerMessages.title}</h1>
      <p className="lead">{registerMessages.lead}</p>

      {error ? <div className="notice error" aria-live="polite">{error}</div> : null}

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>{registerMessages.displayName}</span>
          <input
            autoComplete="name"
            type="text"
            placeholder={registerMessages.displayNamePlaceholder}
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
          />
        </label>

        <label className="field">
          <span>{registerMessages.email}</span>
          <input
            autoComplete="email"
            type="email"
            placeholder={registerMessages.emailPlaceholder}
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>{registerMessages.password}</span>
          <input
            autoComplete="new-password"
            type="password"
            placeholder={registerMessages.passwordPlaceholder}
            value={password}
            onChange={event => setPassword(event.target.value)}
            required
          />
        </label>

        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? registerMessages.submitting : registerMessages.submit}
        </button>
      </form>
    </section>
  );
}
