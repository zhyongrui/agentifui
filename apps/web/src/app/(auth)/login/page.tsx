'use client';

import type {
  AuthErrorResponse,
  LoginResponse,
  SsoCallbackResponse,
  SsoDiscoveryResponse,
} from '@agentifui/shared/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { continueWithSso, discoverSso, loginWithPassword } from '../../../lib/auth-client';
import { getPostAuthRedirect, writeAuthSession } from '../../../lib/auth-session';

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

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
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
  }, [email]);

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
        if (response.error.code === 'AUTH_ACCOUNT_PENDING') {
          router.push('/auth/pending');
          return;
        }

        setError(response.error.message);
        return;
      }

      writeAuthSession(window.sessionStorage, response.data);
      router.push(getPostAuthRedirect(response.data.user.status));
    } catch {
      setError('Unable to reach the auth gateway. Check the gateway server and try again.');
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
        setError(response.error.message);
        return;
      }

      writeAuthSession(window.sessionStorage, response.data);
      router.push(getPostAuthRedirect(response.data.user.status));
    } catch {
      setError('Unable to reach the auth gateway. Check the gateway server and try again.');
    } finally {
      setIsSsoSubmitting(false);
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

      {ssoState.status === 'checking' ? (
        <div className="notice info">Checking whether this email should use enterprise SSO.</div>
      ) : null}

      {ssoState.status === 'available' ? (
        <div className="notice info">
          Enterprise SSO detected for <strong>{ssoState.domain}</strong>. Continue without a
          password.
        </div>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}

      <form className="stack" onSubmit={handlePasswordSubmit}>
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

        {ssoState.status === 'available' ? (
          <button
            className="secondary"
            type="button"
            disabled={isSsoSubmitting}
            onClick={handleSsoSubmit}
          >
            {isSsoSubmitting ? 'Redirecting to SSO...' : `Continue with ${ssoState.providerId}`}
          </button>
        ) : (
          <>
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

            <button
              className="primary"
              type="submit"
              disabled={isSubmitting || ssoState.status === 'checking'}
            >
              {isSubmitting ? 'Signing in...' : 'Continue'}
            </button>
          </>
        )}
      </form>
    </section>
  );
}
