import type {
  AuthErrorCode,
  AuthUser,
  AuthUserStatus,
  InvitationAcceptRequest,
  InvitationAcceptResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  SsoCallbackResponse,
} from '@agentifui/shared/auth';
import { validatePassword } from '@agentifui/shared/auth';
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

type SsoJitUserStatus = Extract<AuthUserStatus, 'pending' | 'active'>;

type StoredUser = AuthUser & {
  passwordHash: string;
  failedLoginCount: number;
  lockedUntil: string | null;
};

type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

type StoredInvitation = {
  id: string;
  tenantId: string;
  email: string;
  tokenHash: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

type AuthServiceOptions = {
  defaultTenantId: string;
  defaultSsoUserStatus: SsoJitUserStatus;
  lockoutThreshold: number;
  lockoutDurationMs: number;
};

type AuthSuccess<T> = {
  ok: true;
  data: T;
};

type AuthFailure = {
  ok: false;
  statusCode: number;
  code: AuthErrorCode;
  message: string;
  details?: unknown;
};

type AuthResult<T> = AuthSuccess<T> | AuthFailure;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');

  return `${salt}:${digest}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, digest] = storedHash.split(':');

  if (!salt || !digest) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toAuthUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function createAuthService(options: AuthServiceOptions) {
  const users = new Map<string, StoredUser>();
  const invitations = new Map<string, StoredInvitation>();
  const sessions = new Map<string, string>();

  function fail<T>(
    statusCode: number,
    code: AuthErrorCode,
    message: string,
    details?: unknown
  ): AuthResult<T> {
    return {
      ok: false,
      statusCode,
      code,
      message,
      details,
    };
  }

  function issueSession(user: StoredUser) {
    const sessionToken = randomUUID();
    sessions.set(sessionToken, user.email);

    return {
      sessionToken,
      user: toAuthUser(user),
    };
  }

  function register(input: RegisterRequest): AuthResult<RegisterResponse['data']> {
    const email = normalizeEmail(input.email);
    const validation = validatePassword(input.password);

    if (!validation.isValid) {
      return fail(
        400,
        'AUTH_PASSWORD_TOO_WEAK',
        'Password does not satisfy the current password policy.',
        validation
      );
    }

    if (users.has(email)) {
      return fail(
        409,
        'AUTH_EMAIL_ALREADY_EXISTS',
        'An account already exists for this email address.'
      );
    }

    const now = new Date().toISOString();
    const displayName =
      input.displayName?.trim() || email.split('@')[0] || 'AgentifUI User';

    const user: StoredUser = {
      id: randomUUID(),
      tenantId: options.defaultTenantId,
      email,
      displayName,
      status: 'active',
      createdAt: now,
      lastLoginAt: null,
      passwordHash: hashPassword(input.password),
      failedLoginCount: 0,
      lockedUntil: null,
    };

    users.set(email, user);

    return {
      ok: true,
      data: {
        user: toAuthUser(user),
        nextStep: 'login',
      },
    };
  }

  function acceptInvitation(
    input: InvitationAcceptRequest
  ): AuthResult<InvitationAcceptResponse['data']> {
    const validation = validatePassword(input.password);

    if (!validation.isValid) {
      return fail(
        400,
        'AUTH_PASSWORD_TOO_WEAK',
        'Password does not satisfy the current password policy.',
        validation
      );
    }

    const invitation = invitations.get(hashInvitationToken(input.token));

    if (!invitation || invitation.status !== 'pending') {
      return fail(
        404,
        'AUTH_INVITE_TOKEN_INVALID',
        'The invitation token is invalid or has already been used.'
      );
    }

    if (Date.now() > Date.parse(invitation.expiresAt)) {
      invitation.status = 'expired';

      return fail(
        410,
        'AUTH_INVITE_LINK_EXPIRED',
        'This invitation link has expired. Ask your administrator to send a new one.'
      );
    }

    const email = normalizeEmail(invitation.email);

    if (users.has(email)) {
      return fail(
        409,
        'AUTH_EMAIL_ALREADY_EXISTS',
        'An account already exists for this email address.'
      );
    }

    const now = new Date().toISOString();
    const displayName =
      input.displayName?.trim() || email.split('@')[0] || 'AgentifUI User';

    const user: StoredUser = {
      id: randomUUID(),
      tenantId: invitation.tenantId,
      email,
      displayName,
      status: 'active',
      createdAt: now,
      lastLoginAt: null,
      passwordHash: hashPassword(input.password),
      failedLoginCount: 0,
      lockedUntil: null,
    };

    users.set(email, user);
    invitation.status = 'accepted';
    invitation.acceptedAt = now;

    return {
      ok: true,
      data: {
        activated: true,
        userStatus: 'active',
        user: toAuthUser(user),
        nextStep: 'login',
      },
    };
  }

  function login(input: LoginRequest): AuthResult<LoginResponse['data']> {
    const email = normalizeEmail(input.email);
    const user = users.get(email);

    if (!user) {
      return fail(
        401,
        'AUTH_INVALID_CREDENTIALS',
        'The provided credentials are invalid.'
      );
    }

    if (user.lockedUntil && Date.now() < Date.parse(user.lockedUntil)) {
      return fail(
        423,
        'AUTH_ACCOUNT_LOCKED',
        'This account is temporarily locked due to repeated failed login attempts.'
      );
    }

    if (!verifyPassword(input.password, user.passwordHash)) {
      user.failedLoginCount += 1;

      if (user.failedLoginCount >= options.lockoutThreshold) {
        user.lockedUntil = new Date(Date.now() + options.lockoutDurationMs).toISOString();
        user.failedLoginCount = 0;

        return fail(
          423,
          'AUTH_ACCOUNT_LOCKED',
          'This account is temporarily locked due to repeated failed login attempts.'
        );
      }

      return fail(
        401,
        'AUTH_INVALID_CREDENTIALS',
        'The provided credentials are invalid.',
        {
          attemptsRemaining: options.lockoutThreshold - user.failedLoginCount,
        }
      );
    }

    if (user.status === 'pending') {
      return fail(
        403,
        'AUTH_ACCOUNT_PENDING',
        'This account is pending tenant approval.'
      );
    }

    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date().toISOString();

    return {
      ok: true,
      data: {
        ...issueSession(user),
      },
    };
  }

  function loginWithSso(input: {
    email: string;
    providerId: string;
    displayName?: string;
  }): AuthResult<SsoCallbackResponse['data']> {
    const email = normalizeEmail(input.email);
    const now = new Date().toISOString();
    const existingUser = users.get(email);

    if (existingUser) {
      existingUser.lastLoginAt = now;

      return {
        ok: true,
        data: {
          ...issueSession(existingUser),
          providerId: input.providerId,
          createdViaJit: false,
        },
      };
    }

    const user: StoredUser = {
      id: randomUUID(),
      tenantId: options.defaultTenantId,
      email,
      displayName:
        input.displayName?.trim() || email.split('@')[0] || 'AgentifUI User',
      status: options.defaultSsoUserStatus,
      createdAt: now,
      lastLoginAt: now,
      passwordHash: hashPassword(randomUUID()),
      failedLoginCount: 0,
      lockedUntil: null,
    };

    users.set(email, user);

    return {
      ok: true,
      data: {
        ...issueSession(user),
        providerId: input.providerId,
        createdViaJit: true,
      },
    };
  }

  function getUserBySessionToken(sessionToken: string): AuthUser | null {
    const email = sessions.get(sessionToken);

    if (!email) {
      return null;
    }

    const user = users.get(email);

    return user ? toAuthUser(user) : null;
  }

  function getUserByEmail(email: string): AuthUser | null {
    const user = users.get(normalizeEmail(email));

    return user ? toAuthUser(user) : null;
  }

  function clear() {
    users.clear();
    invitations.clear();
    sessions.clear();
  }

  function seedPendingUser(input: RegisterRequest) {
    const result = register(input);

    if (!result.ok) {
      return result;
    }

    const user = users.get(normalizeEmail(input.email));

    if (!user) {
      return fail(500, 'AUTH_NOT_IMPLEMENTED', 'Unable to seed pending user.');
    }

    user.status = 'pending';

    return {
      ok: true,
      data: {
        user: toAuthUser(user),
        nextStep: 'login' as const,
      },
    };
  }

  function seedInvitation(input: {
    email: string;
    tenantId?: string;
    expiresAt?: string;
  }) {
    const token = randomUUID();
    const invitation: StoredInvitation = {
      id: randomUUID(),
      tenantId: input.tenantId ?? options.defaultTenantId,
      email: normalizeEmail(input.email),
      tokenHash: hashInvitationToken(token),
      status: 'pending',
      expiresAt:
        input.expiresAt ??
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      acceptedAt: null,
      createdAt: new Date().toISOString(),
    };

    invitations.set(invitation.tokenHash, invitation);

    return {
      ok: true as const,
      data: {
        invitationId: invitation.id,
        token,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
      },
    };
  }

  return {
    register,
    acceptInvitation,
    login,
    loginWithSso,
    getUserBySessionToken,
    getUserByEmail,
    clear,
    seedPendingUser,
    seedInvitation,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
