'use client';

import type {
  AuthErrorResponse,
  LoginResponse,
  SsoCallbackResponse,
  SsoDiscoveryResponse,
} from '@agentifui/shared/auth';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { Suspense, useEffect, useState } from 'react';

import { useI18n } from '../../../components/i18n-provider';
import { continueWithSso, discoverSso, loginWithPassword } from '../../../lib/auth-client';
import {
  clearAuthMfaTicket,
  getPostAuthRedirect,
  writeAuthMfaTicket,
  writeAuthSession,
} from '../../../lib/auth-session';

type SsoState =
  | {
      status: 'idle' | 'checking' | 'unavailable' | 'error';
      providerId: null;
      domain: null;
    }
  | {
      status: 'available';
      providerId: string;
      domain: string;
    };

function isAuthErrorResponse(
  value:
    | AuthErrorResponse
    | LoginResponse
    | SsoDiscoveryResponse
    | SsoCallbackResponse
): value is AuthErrorResponse {
  return value.ok === false;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getMfaTicketFromError(response: AuthErrorResponse): string | null {
  if (response.error.code !== 'AUTH_MFA_REQUIRED' || !isRecord(response.error.details)) {
    return null;
  }

  return typeof response.error.details.ticket === 'string' ? response.error.details.ticket : null;
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const { messages } = useI18n();
  const loginMessages = messages.auth.login;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSsoSubmitting, setIsSsoSubmitting] = useState(false);
  const [ssoState, setSsoState] = useState<SsoState>({
    status: 'idle',
    providerId: null,
    domain: null,
  });
  const registered = searchParams.get('registered') === '1';
  const activated = searchParams.get('activated') === '1';

  function navigateTo(path: string) {
    window.location.assign(path);
  }

  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !isValidEmail(normalizedEmail) || password.trim().length > 0) {
      setSsoState({
        status: 'idle',
        providerId: null,
        domain: null,
      });
      return;
    }

    let isCancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setSsoState({
        status: 'checking',
        providerId: null,
        domain: null,
      });

      try {
        const response = await discoverSso({
          email: normalizedEmail,
        });

        if (isCancelled) {
          return;
        }

        if (isAuthErrorResponse(response)) {
          setSsoState({
            status: 'error',
            providerId: null,
            domain: null,
          });
          return;
        }

        if (response.data.hasSso && response.data.providerId) {
          setSsoState({
            status: 'available',
            providerId: response.data.providerId,
            domain: response.data.domain,
          });
          return;
        }

        setSsoState({
          status: 'unavailable',
          providerId: null,
          domain: null,
        });
      } catch {
        if (!isCancelled) {
          setSsoState({
            status: 'error',
            providerId: null,
            domain: null,
          });
        }
      }
    }, 300);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [email, password]);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await loginWithPassword({
        email,
        password,
      });

      if (isAuthErrorResponse(response)) {
        const mfaTicket = getMfaTicketFromError(response);

        if (mfaTicket) {
          writeAuthMfaTicket(window.sessionStorage, {
            ticket: mfaTicket,
            email: email.trim().toLowerCase(),
            createdAt: new Date().toISOString(),
          });
          navigateTo('/auth/mfa');
          return;
        }

        if (response.error.code === 'AUTH_ACCOUNT_PENDING') {
          navigateTo('/auth/pending');
          return;
        }

        setError(response.error.message);
        return;
      }

      clearAuthMfaTicket(window.sessionStorage);
      writeAuthSession(window.sessionStorage, response.data);
      navigateTo(getPostAuthRedirect(response.data.user.status));
    } catch {
      setError(loginMessages.networkError);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSsoSubmit() {
    if (ssoState.status !== 'available') {
      return;
    }

    setError(null);
    setIsSsoSubmitting(true);

    try {
      const response = await continueWithSso({
        email,
        providerId: ssoState.providerId,
      });

      if (isAuthErrorResponse(response)) {
        const mfaTicket = getMfaTicketFromError(response);

        if (mfaTicket) {
          writeAuthMfaTicket(window.sessionStorage, {
            ticket: mfaTicket,
            email: email.trim().toLowerCase(),
            createdAt: new Date().toISOString(),
          });
          navigateTo('/auth/mfa');
          return;
        }

        setError(response.error.message);
        return;
      }

      clearAuthMfaTicket(window.sessionStorage);
      writeAuthSession(window.sessionStorage, response.data);
      navigateTo(getPostAuthRedirect(response.data.user.status));
    } catch {
      setError(loginMessages.networkError);
    } finally {
      setIsSsoSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <span className="eyebrow">{loginMessages.eyebrow}</span>
      <h1>{loginMessages.title}</h1>
      <p className="lead">{loginMessages.lead}</p>

      {registered ? (
        <div className="notice success">{loginMessages.registered}</div>
      ) : activated ? (
        <div className="notice success">{loginMessages.activated}</div>
      ) : null}

      {ssoState.status === 'checking' ? (
        <div className="notice info">{loginMessages.ssoChecking}</div>
      ) : null}

      {ssoState.status === 'available' ? (
        <div className="notice info">
          {loginMessages.ssoAvailablePrefix} <strong>{ssoState.domain}</strong>
          {loginMessages.ssoAvailableSuffix}
        </div>
      ) : null}

      {error ? <div className="notice error" aria-live="polite">{error}</div> : null}

      <form className="stack" onSubmit={handlePasswordSubmit}>
        <label className="field">
          <span>{loginMessages.email}</span>
          <input
            autoComplete="email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
          />
        </label>

        {ssoState.status === 'available' ? (
          <button
            className="secondary"
            type="button"
            disabled={isSsoSubmitting}
            onClick={handleSsoSubmit}
          >
            {isSsoSubmitting
              ? loginMessages.redirectingToSso
              : `${loginMessages.continueWithPrefix} ${ssoState.providerId}`}
          </button>
        ) : (
          <>
            <label className="field">
              <span>{loginMessages.password}</span>
              <input
                autoComplete="current-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
              />
            </label>

            <button
              className="primary"
              type="submit"
              disabled={isSubmitting || ssoState.status === 'checking'}
            >
              {isSubmitting ? loginMessages.continuing : loginMessages.continue}
            </button>
          </>
        )}
      </form>

      <p className="helper-text">
        {loginMessages.noAccountPrefix} <Link href="/register">{loginMessages.noAccountLink}</Link>.
      </p>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <section className="panel">
          <span className="eyebrow">S1-1</span>
          <h1>登录</h1>
          <p className="lead">正在加载登录选项...</p>
        </section>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
