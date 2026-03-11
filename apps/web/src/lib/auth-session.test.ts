import { describe, expect, it } from 'vitest';

import {
  AUTH_SESSION_KEY,
  canAccessProtectedPath,
  getPostAuthRedirect,
  getProtectedRedirect,
  parseAuthSession,
  readAuthSession,
  writeAuthSession,
} from './auth-session.js';

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

const activeSession = {
  sessionToken: 'session-active',
  user: {
    id: 'usr_active',
    tenantId: 'tenant-dev',
    email: 'active@iflabx.com',
    displayName: 'Active User',
    status: 'active' as const,
    createdAt: '2026-03-11T00:00:00.000Z',
    lastLoginAt: '2026-03-11T00:00:00.000Z',
  },
};

const pendingSession = {
  sessionToken: 'session-pending',
  user: {
    id: 'usr_pending',
    tenantId: 'tenant-dev',
    email: 'pending@iflabx.com',
    displayName: 'Pending User',
    status: 'pending' as const,
    createdAt: '2026-03-11T00:00:00.000Z',
    lastLoginAt: '2026-03-11T00:00:00.000Z',
  },
};

describe('auth session helpers', () => {
  it('maps post-auth redirects by user status', () => {
    expect(getPostAuthRedirect('active')).toBe('/apps');
    expect(getPostAuthRedirect('pending')).toBe('/auth/pending');
    expect(getPostAuthRedirect('suspended')).toBe('/login');
  });

  it('allows pending users to access only the profile page', () => {
    expect(canAccessProtectedPath('/settings/profile', 'pending')).toBe(true);
    expect(canAccessProtectedPath('/apps', 'pending')).toBe(false);
    expect(canAccessProtectedPath('/settings/security', 'pending')).toBe(false);
  });

  it('returns the correct redirects for protected routes', () => {
    expect(getProtectedRedirect('/apps', null)).toBe('/login');
    expect(getProtectedRedirect('/apps', pendingSession)).toBe('/auth/pending');
    expect(getProtectedRedirect('/settings/profile', pendingSession)).toBeNull();
    expect(getProtectedRedirect('/apps', activeSession)).toBeNull();
  });

  it('reads and writes auth sessions from storage', () => {
    const storage = createStorage();

    writeAuthSession(storage, activeSession);

    expect(storage.getItem(AUTH_SESSION_KEY)).toContain('session-active');
    expect(readAuthSession(storage)).toEqual(activeSession);
  });

  it('rejects malformed session payloads', () => {
    expect(parseAuthSession('{"invalid":true}')).toBeNull();
    expect(parseAuthSession('not-json')).toBeNull();
  });
});
