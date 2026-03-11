'use client';

import type {
  AuthErrorResponse,
  MfaDisableResponse,
  MfaEnableResponse,
  MfaSetupResponse,
  MfaStatusResponse,
} from '@agentifui/shared/auth';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import {
  disableMfa,
  enableMfa,
  getMfaStatus,
  startMfaSetup,
} from '../../../../lib/auth-client';
import { useProtectedSession } from '../../../../lib/use-protected-session';

type SetupState = {
  setupToken: string;
  manualEntryKey: string;
  otpauthUri: string;
  issuer: string;
  accountName: string;
};

function isAuthErrorResponse(
  value:
    | AuthErrorResponse
    | MfaStatusResponse
    | MfaSetupResponse
    | MfaEnableResponse
    | MfaDisableResponse
): value is AuthErrorResponse {
  return value.ok === false;
}

export default function SecuritySettingsPage() {
  const { session, isLoading } = useProtectedSession('/settings/security');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null);
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [enableCode, setEnableCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isFetchingStatus, setIsFetchingStatus] = useState(false);
  const [isSubmittingSetup, setIsSubmittingSetup] = useState(false);
  const [isSubmittingDisable, setIsSubmittingDisable] = useState(false);

  useEffect(() => {
    if (!session) {
      return;
    }

    let isCancelled = false;

    setIsFetchingStatus(true);
    getMfaStatus(session.sessionToken)
      .then(response => {
        if (isCancelled) {
          return;
        }

        if (isAuthErrorResponse(response)) {
          setError(response.error.message);
          return;
        }

        setMfaEnabled(response.data.enabled);
        setEnrolledAt(response.data.enrolledAt);
      })
      .catch(() => {
        if (!isCancelled) {
          setError('Unable to load MFA status right now.');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsFetchingStatus(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [session]);

  if (isLoading) {
    return <p className="lead">Checking your session...</p>;
  }

  if (!session) {
    return null;
  }

  const activeSession = session;

  async function handleStartSetup() {
    setError(null);
    setNotice(null);
    setIsSubmittingSetup(true);

    try {
      const response = await startMfaSetup(activeSession.sessionToken);

      if (isAuthErrorResponse(response)) {
        setError(response.error.message);
        return;
      }

      setSetupState(response.data);
      setNotice('MFA setup started. Add the manual key to your authenticator app and confirm with the current code.');
    } catch {
      setError('Unable to start MFA setup right now.');
    } finally {
      setIsSubmittingSetup(false);
    }
  }

  async function handleEnableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!setupState) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsSubmittingSetup(true);

    try {
      const response = await enableMfa(activeSession.sessionToken, {
        setupToken: setupState.setupToken,
        code: enableCode,
      });

      if (isAuthErrorResponse(response)) {
        setError(response.error.message);
        return;
      }

      setMfaEnabled(true);
      setEnrolledAt(response.data.enrolledAt);
      setSetupState(null);
      setEnableCode('');
      setNotice('MFA is now enabled for this account.');
    } catch {
      setError('Unable to enable MFA right now.');
    } finally {
      setIsSubmittingSetup(false);
    }
  }

  async function handleDisableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setNotice(null);
    setIsSubmittingDisable(true);

    try {
      const response = await disableMfa(activeSession.sessionToken, {
        code: disableCode,
      });

      if (isAuthErrorResponse(response)) {
        setError(response.error.message);
        return;
      }

      setMfaEnabled(false);
      setEnrolledAt(null);
      setDisableCode('');
      setNotice('MFA has been disabled for this account.');
    } catch {
      setError('Unable to disable MFA right now.');
    } finally {
      setIsSubmittingDisable(false);
    }
  }

  return (
    <div className="stack page-narrow">
      <span className="eyebrow">S1-1</span>
      <h1>Security Settings</h1>
      <p className="lead">
        MFA、密码轮换和会话控制会继续落在这里。当前页面只允许已激活用户进入。
      </p>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="detail-list">
        <div className="detail-row">
          <span className="detail-label">Current user</span>
          <strong>{activeSession.user.email}</strong>
        </div>
        <div className="detail-row">
          <span className="detail-label">Status</span>
          <strong>{activeSession.user.status}</strong>
        </div>
        <div className="detail-row">
          <span className="detail-label">MFA</span>
          <strong>
            {isFetchingStatus
              ? 'Loading...'
              : mfaEnabled
                ? `Enabled${enrolledAt ? ` since ${new Date(enrolledAt).toLocaleString()}` : ''}`
                : 'Disabled'}
          </strong>
        </div>
      </div>

      {!mfaEnabled ? (
        <div className="security-card stack">
          <h2>Enable TOTP</h2>
          <p className="helper-text">
            Start MFA setup, add the manual key to an authenticator app, then confirm with the
            current 6-digit code.
          </p>

          {!setupState ? (
            <button
              className="primary"
              type="button"
              onClick={handleStartSetup}
              disabled={isSubmittingSetup}
            >
              {isSubmittingSetup ? 'Starting setup...' : 'Start MFA setup'}
            </button>
          ) : (
            <form className="stack" onSubmit={handleEnableMfa}>
              <div className="security-code-block">
                <strong>Manual entry key</strong>
                <code>{setupState.manualEntryKey}</code>
              </div>
              <div className="security-code-block">
                <strong>OTPAuth URI</strong>
                <code>{setupState.otpauthUri}</code>
              </div>
              <label className="field">
                <span>Current TOTP code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  placeholder="123456"
                  value={enableCode}
                  onChange={event => setEnableCode(event.target.value)}
                  required
                />
              </label>
              <div className="actions">
                <button className="primary" type="submit" disabled={isSubmittingSetup}>
                  {isSubmittingSetup ? 'Enabling...' : 'Confirm enable'}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setSetupState(null);
                    setEnableCode('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <form className="security-card stack" onSubmit={handleDisableMfa}>
          <h2>Disable TOTP</h2>
          <p className="helper-text">
            To disable MFA, enter the current 6-digit code from your authenticator app.
          </p>
          <label className="field">
            <span>Current TOTP code</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              placeholder="123456"
              value={disableCode}
              onChange={event => setDisableCode(event.target.value)}
              required
            />
          </label>
          <button className="secondary" type="submit" disabled={isSubmittingDisable}>
            {isSubmittingDisable ? 'Disabling...' : 'Disable MFA'}
          </button>
        </form>
      )}
    </div>
  );
}
