import type {
  AuthUserStatus,
  LoginResponse,
  MfaVerifyResponse,
  SsoCallbackResponse,
} from '@agentifui/shared/auth';

export const AUTH_SESSION_KEY = 'agentifui.session';
export const AUTH_MFA_TICKET_KEY = 'agentifui.mfa.ticket';

export type AuthSession = {
  sessionToken: string;
  user: LoginResponse['data']['user'];
};

export type AuthMfaTicket = {
  ticket: string;
  email: string;
  createdAt: string;
};

export type ProtectedPath = '/apps' | '/settings/profile' | '/settings/security';

type SessionPayload =
  | LoginResponse['data']
  | MfaVerifyResponse['data']
  | SsoCallbackResponse['data']
  | AuthSession;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function toAuthSession(payload: SessionPayload): AuthSession {
  return {
    sessionToken: payload.sessionToken,
    user: payload.user,
  };
}

export function getPostAuthRedirect(
  status: AuthUserStatus
): '/apps' | '/auth/pending' | '/login' {
  if (status === 'active') {
    return '/apps';
  }

  if (status === 'pending') {
    return '/auth/pending';
  }

  return '/login';
}

export function canAccessProtectedPath(path: ProtectedPath, status: AuthUserStatus): boolean {
  if (status === 'active') {
    return true;
  }

  if (status === 'pending') {
    return path === '/settings/profile';
  }

  return false;
}

export function getProtectedRedirect(
  path: ProtectedPath,
  session: AuthSession | null
): string | null {
  if (!session) {
    return '/login';
  }

  if (canAccessProtectedPath(path, session.user.status)) {
    return null;
  }

  if (session.user.status === 'pending') {
    return '/auth/pending';
  }

  return '/login';
}

export function parseAuthSession(raw: string | null): AuthSession | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    const sessionToken = parsed.sessionToken;
    const user = parsed.user;

    if (typeof sessionToken !== 'string' || !isRecord(user)) {
      return null;
    }

    if (
      typeof user.id !== 'string' ||
      typeof user.tenantId !== 'string' ||
      typeof user.email !== 'string' ||
      typeof user.displayName !== 'string' ||
      typeof user.status !== 'string' ||
      typeof user.createdAt !== 'string'
    ) {
      return null;
    }

    return {
      sessionToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        displayName: user.displayName,
        status: user.status as AuthUserStatus,
        createdAt: user.createdAt,
        lastLoginAt: typeof user.lastLoginAt === 'string' ? user.lastLoginAt : null,
      },
    };
  } catch {
    return null;
  }
}

export function readAuthSession(storage: Pick<Storage, 'getItem'>): AuthSession | null {
  return parseAuthSession(storage.getItem(AUTH_SESSION_KEY));
}

export function writeAuthSession(
  storage: Pick<Storage, 'setItem'>,
  payload: SessionPayload
) {
  storage.setItem(AUTH_SESSION_KEY, JSON.stringify(toAuthSession(payload)));
}

export function clearAuthSession(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(AUTH_SESSION_KEY);
}

export function parseAuthMfaTicket(raw: string | null): AuthMfaTicket | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    if (
      typeof parsed.ticket !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.createdAt !== 'string'
    ) {
      return null;
    }

    return {
      ticket: parsed.ticket,
      email: parsed.email,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function readAuthMfaTicket(storage: Pick<Storage, 'getItem'>): AuthMfaTicket | null {
  return parseAuthMfaTicket(storage.getItem(AUTH_MFA_TICKET_KEY));
}

export function writeAuthMfaTicket(
  storage: Pick<Storage, 'setItem'>,
  payload: AuthMfaTicket
) {
  storage.setItem(AUTH_MFA_TICKET_KEY, JSON.stringify(payload));
}

export function clearAuthMfaTicket(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(AUTH_MFA_TICKET_KEY);
}
