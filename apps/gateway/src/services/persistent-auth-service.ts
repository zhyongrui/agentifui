import { ensureTenant, type DatabaseClient } from '@agentifui/db';
import type {
  AuthUser,
  InvitationAcceptRequest,
  InvitationAcceptResponse,
  LoginRequest,
  LoginResponse,
  MfaDisableRequest,
  MfaDisableResponse,
  MfaEnableRequest,
  MfaEnableResponse,
  MfaSetupResponse,
  MfaStatusResponse,
  MfaVerifyRequest,
  MfaVerifyResponse,
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

import type {
  AuthFailure,
  AuthResult,
  AuthService,
  AuthServiceOptions,
  SeedInvitationResult,
} from './auth-service.js';
import { createOtpAuthUri, generateTotpSecret, verifyTotpCode } from './totp-service.js';

const MFA_ISSUER = 'AgentifUI';
const MFA_SETUP_TTL_MS = 10 * 60 * 1000;
const MFA_TICKET_TTL_MS = 10 * 60 * 1000;

type UserRow = {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  status: AuthUser['status'];
  password_hash: string | null;
  failed_login_count: number;
  locked_until: Date | string | null;
  last_login_at: Date | string | null;
  created_at: Date | string;
};

type InvitationRow = {
  id: string;
  tenant_id: string;
  email: string;
  token_hash: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: Date | string;
  accepted_at: Date | string | null;
  created_at: Date | string;
};

type MfaFactorRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  secret_encrypted: string;
  enabled_at: Date | string | null;
  disabled_at: Date | string | null;
  created_at: Date | string;
};

type AuthChallengeRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  email: string | null;
  kind: 'mfa_setup' | 'mfa_login';
  token_hash: string;
  secret_encrypted: string | null;
  payload: Record<string, unknown>;
  expires_at: Date | string;
  consumed_at: Date | string | null;
  created_at: Date | string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function toIso(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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

function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isExpired(value: Date | string) {
  return Date.now() > Date.parse(value instanceof Date ? value.toISOString() : value);
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    createdAt: toIso(row.created_at)!,
    lastLoginAt: toIso(row.last_login_at),
  };
}

function asDatabaseClient(value: unknown) {
  return value as DatabaseClient;
}

function fail<T>(
  statusCode: number,
  code: AuthFailure['code'],
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

async function findUserByEmail(database: DatabaseClient, email: string) {
  const [user] = await database<UserRow[]>`
    select
      id,
      tenant_id,
      email,
      display_name,
      status,
      password_hash,
      failed_login_count,
      locked_until,
      last_login_at,
      created_at
    from users
    where email = ${email}
    order by created_at asc
    limit 1
  `;

  return user ?? null;
}

async function findUserById(database: DatabaseClient, userId: string) {
  const [user] = await database<UserRow[]>`
    select
      id,
      tenant_id,
      email,
      display_name,
      status,
      password_hash,
      failed_login_count,
      locked_until,
      last_login_at,
      created_at
    from users
    where id = ${userId}
    limit 1
  `;

  return user ?? null;
}

async function findInvitationByToken(database: DatabaseClient, token: string) {
  const [invitation] = await database<InvitationRow[]>`
    select
      id,
      tenant_id,
      email,
      token_hash,
      status,
      expires_at,
      accepted_at,
      created_at
    from invitations
    where token_hash = ${hashToken(token)}
    limit 1
  `;

  return invitation ?? null;
}

async function findActiveMfaFactor(database: DatabaseClient, userId: string) {
  const [factor] = await database<MfaFactorRow[]>`
    select
      id,
      tenant_id,
      user_id,
      secret_encrypted,
      enabled_at,
      disabled_at,
      created_at
    from mfa_factors
    where user_id = ${userId}
      and disabled_at is null
    order by created_at desc
    limit 1
  `;

  return factor ?? null;
}

async function findChallenge(
  database: DatabaseClient,
  input: {
    token: string;
    kind: 'mfa_setup' | 'mfa_login';
  }
) {
  const [challenge] = await database<AuthChallengeRow[]>`
    select
      id,
      tenant_id,
      user_id,
      email,
      kind,
      token_hash,
      secret_encrypted,
      payload,
      expires_at,
      consumed_at,
      created_at
    from auth_challenges
    where token_hash = ${hashToken(input.token)}
      and kind = ${input.kind}
      and consumed_at is null
    limit 1
  `;

  return challenge ?? null;
}

async function markChallengeConsumed(database: DatabaseClient, challengeId: string) {
  await database`
    update auth_challenges
    set consumed_at = now()
    where id = ${challengeId}
      and consumed_at is null
  `;
}

async function insertAuthIdentity(
  database: DatabaseClient,
  input: {
    tenantId: string;
    userId: string;
    provider: 'password' | 'sso';
    providerUserId: string;
    email: string;
  }
) {
  await database`
    insert into auth_identities (
      id,
      tenant_id,
      user_id,
      provider,
      provider_user_id,
      email,
      created_at,
      last_used_at
    )
    values (
      ${randomUUID()},
      ${input.tenantId},
      ${input.userId},
      ${input.provider},
      ${input.providerUserId},
      ${input.email},
      now(),
      now()
    )
    on conflict (provider, provider_user_id) do update
    set user_id = excluded.user_id,
        email = excluded.email,
        last_used_at = excluded.last_used_at
  `;
}

async function issueSession(database: DatabaseClient, user: UserRow) {
  const sessionToken = randomUUID();

  await database`
    insert into auth_sessions (
      id,
      tenant_id,
      user_id,
      session_token_hash,
      status,
      created_at,
      last_used_at
    )
    values (
      ${randomUUID()},
      ${user.tenant_id},
      ${user.id},
      ${hashToken(sessionToken)},
      'active',
      now(),
      now()
    )
  `;

  return {
    sessionToken,
    user: toAuthUser(user),
  };
}

async function finalizeSuccessfulLogin(database: DatabaseClient, userId: string) {
  const [user] = await database<UserRow[]>`
    update users
    set failed_login_count = 0,
        locked_until = null,
        last_login_at = now(),
        updated_at = now()
    where id = ${userId}
    returning
      id,
      tenant_id,
      email,
      display_name,
      status,
      password_hash,
      failed_login_count,
      locked_until,
      last_login_at,
      created_at
  `;

  if (!user) {
    throw new Error(`Unable to finalize login for missing user ${userId}.`);
  }

  return issueSession(database, user);
}

async function createChallenge(
  database: DatabaseClient,
  input: {
    tenantId: string;
    userId: string | null;
    email: string | null;
    kind: 'mfa_setup' | 'mfa_login';
    secret?: string | null;
    payload?: Record<string, unknown>;
    ttlMs: number;
  }
) {
  const token = randomUUID();

  await database`
    insert into auth_challenges (
      id,
      tenant_id,
      user_id,
      email,
      kind,
      token_hash,
      secret_encrypted,
      payload,
      expires_at,
      created_at
    )
    values (
      ${randomUUID()},
      ${input.tenantId},
      ${input.userId},
      ${input.email},
      ${input.kind},
      ${hashToken(token)},
      ${input.secret ?? null},
      ${JSON.stringify(input.payload ?? {})}::jsonb,
      ${new Date(Date.now() + input.ttlMs).toISOString()}::timestamptz,
      now()
    )
  `;

  return token;
}

export function createPersistentAuthService(
  database: DatabaseClient,
  options: AuthServiceOptions
): AuthService {
  return {
    async register(input: RegisterRequest) {
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

      await ensureTenant(database, {
        tenantId: options.defaultTenantId,
      });

      const existingUser = await findUserByEmail(database, email);

      if (existingUser) {
        return fail(
          409,
          'AUTH_EMAIL_ALREADY_EXISTS',
          'An account already exists for this email address.'
        );
      }

      const userId = randomUUID();
      const displayName =
        input.displayName?.trim() || email.split('@')[0] || 'AgentifUI User';

      const [user] = await database<UserRow[]>`
        insert into users (
          id,
          tenant_id,
          email,
          display_name,
          status,
          password_hash,
          failed_login_count,
          locked_until,
          is_email_verified,
          last_login_at,
          created_at,
          updated_at
        )
        values (
          ${userId},
          ${options.defaultTenantId},
          ${email},
          ${displayName},
          'active',
          ${hashPassword(input.password)},
          0,
          null,
          false,
          null,
          now(),
          now()
        )
        returning
          id,
          tenant_id,
          email,
          display_name,
          status,
          password_hash,
          failed_login_count,
          locked_until,
          last_login_at,
          created_at
      `;

      if (!user) {
        throw new Error('User registration did not return a persisted record.');
      }

      await insertAuthIdentity(database, {
        tenantId: user.tenant_id,
        userId: user.id,
        provider: 'password',
        providerUserId: user.email,
        email: user.email,
      });

      return {
        ok: true,
        data: {
          user: toAuthUser(user),
          nextStep: 'login',
        },
      };
    },

    async acceptInvitation(input: InvitationAcceptRequest) {
      const validation = validatePassword(input.password);

      if (!validation.isValid) {
        return fail(
          400,
          'AUTH_PASSWORD_TOO_WEAK',
          'Password does not satisfy the current password policy.',
          validation
        );
      }

      const invitation = await findInvitationByToken(database, input.token);

      if (!invitation || invitation.status !== 'pending') {
        return fail(
          404,
          'AUTH_INVITE_TOKEN_INVALID',
          'The invitation token is invalid or has already been used.'
        );
      }

      if (isExpired(invitation.expires_at)) {
        await database`
          update invitations
          set status = 'expired'
          where id = ${invitation.id}
        `;

        return fail(
          410,
          'AUTH_INVITE_LINK_EXPIRED',
          'This invitation link has expired. Ask your administrator to send a new one.'
        );
      }

      const email = normalizeEmail(invitation.email);
      const existingUser = await findUserByEmail(database, email);

      if (existingUser) {
        return fail(
          409,
          'AUTH_EMAIL_ALREADY_EXISTS',
          'An account already exists for this email address.'
        );
      }

      await ensureTenant(database, {
        tenantId: invitation.tenant_id,
      });

      const userId = randomUUID();
      const displayName =
        input.displayName?.trim() || email.split('@')[0] || 'AgentifUI User';

      const [user] = await database.begin(async transaction => {
        const tx = asDatabaseClient(transaction);
        const [createdUser] = await tx<UserRow[]>`
          insert into users (
            id,
            tenant_id,
            email,
            display_name,
            status,
            password_hash,
            failed_login_count,
            locked_until,
            is_email_verified,
            last_login_at,
            created_at,
            updated_at
          )
          values (
            ${userId},
            ${invitation.tenant_id},
            ${email},
            ${displayName},
            'active',
            ${hashPassword(input.password)},
            0,
            null,
            false,
            null,
            now(),
            now()
          )
          returning
            id,
            tenant_id,
            email,
            display_name,
            status,
            password_hash,
            failed_login_count,
            locked_until,
            last_login_at,
            created_at
        `;

        if (!createdUser) {
          throw new Error('Invitation activation did not return a persisted user.');
        }

        await tx`
          update invitations
          set status = 'accepted',
              accepted_at = now()
          where id = ${invitation.id}
        `;

        await insertAuthIdentity(tx, {
          tenantId: createdUser.tenant_id,
          userId: createdUser.id,
          provider: 'password',
          providerUserId: createdUser.email,
          email: createdUser.email,
        });

        return [createdUser];
      });

      return {
        ok: true,
        data: {
          activated: true,
          userStatus: 'active',
          user: toAuthUser(user),
          nextStep: 'login',
        },
      };
    },

    async login(input: LoginRequest) {
      const email = normalizeEmail(input.email);
      const user = await findUserByEmail(database, email);

      if (!user || !user.password_hash) {
        return fail(
          401,
          'AUTH_INVALID_CREDENTIALS',
          'The provided credentials are invalid.'
        );
      }

      if (user.locked_until && Date.now() < Date.parse(toIso(user.locked_until)!)) {
        return fail(
          423,
          'AUTH_ACCOUNT_LOCKED',
          'This account is temporarily locked due to repeated failed login attempts.'
        );
      }

      if (!verifyPassword(input.password, user.password_hash)) {
        const nextFailureCount = user.failed_login_count + 1;

        if (nextFailureCount >= options.lockoutThreshold) {
          await database`
            update users
            set failed_login_count = 0,
                locked_until = ${new Date(Date.now() + options.lockoutDurationMs).toISOString()}::timestamptz,
                updated_at = now()
            where id = ${user.id}
          `;

          return fail(
            423,
            'AUTH_ACCOUNT_LOCKED',
            'This account is temporarily locked due to repeated failed login attempts.'
          );
        }

        await database`
          update users
          set failed_login_count = ${nextFailureCount},
              updated_at = now()
          where id = ${user.id}
        `;

        return fail(
          401,
          'AUTH_INVALID_CREDENTIALS',
          'The provided credentials are invalid.',
          {
            attemptsRemaining: options.lockoutThreshold - nextFailureCount,
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

      const mfaFactor = await findActiveMfaFactor(database, user.id);

      if (mfaFactor) {
        return fail(
          401,
          'AUTH_MFA_REQUIRED',
          'This account requires a TOTP verification code to finish signing in.',
          {
            ticket: await createChallenge(database, {
              tenantId: user.tenant_id,
              userId: user.id,
              email: user.email,
              kind: 'mfa_login',
              ttlMs: MFA_TICKET_TTL_MS,
            }),
          }
        );
      }

      const data = await database.begin(async transaction => {
        const tx = asDatabaseClient(transaction);
        return finalizeSuccessfulLogin(tx, user.id);
      });

      return {
        ok: true,
        data,
      };
    },

    async loginWithSso(input: {
      email: string;
      providerId: string;
      displayName?: string;
    }) {
      const email = normalizeEmail(input.email);
      const existingUser = await findUserByEmail(database, email);

      if (existingUser) {
        const mfaFactor =
          existingUser.status === 'active'
            ? await findActiveMfaFactor(database, existingUser.id)
            : null;

        if (mfaFactor) {
          return fail(
            401,
            'AUTH_MFA_REQUIRED',
            'This account requires a TOTP verification code to finish signing in.',
            {
              ticket: await createChallenge(database, {
                tenantId: existingUser.tenant_id,
                userId: existingUser.id,
                email: existingUser.email,
                kind: 'mfa_login',
                ttlMs: MFA_TICKET_TTL_MS,
              }),
            }
          );
        }

        const data = await database.begin(async transaction => {
          const tx = asDatabaseClient(transaction);

          await insertAuthIdentity(tx, {
            tenantId: existingUser.tenant_id,
            userId: existingUser.id,
            provider: 'sso',
            providerUserId: `${input.providerId}:${email}`,
            email,
          });

          const session = await finalizeSuccessfulLogin(tx, existingUser.id);

          return {
            ...session,
            providerId: input.providerId,
            createdViaJit: false,
          };
        });

        return {
          ok: true,
          data,
        };
      }

      await ensureTenant(database, {
        tenantId: options.defaultTenantId,
      });

      const displayName =
        input.displayName?.trim() || email.split('@')[0] || 'AgentifUI User';

      const data = await database.begin(async transaction => {
        const tx = asDatabaseClient(transaction);
        const userId = randomUUID();
        const [user] = await tx<UserRow[]>`
          insert into users (
            id,
            tenant_id,
            email,
            display_name,
            status,
            password_hash,
            failed_login_count,
            locked_until,
            is_email_verified,
            last_login_at,
            created_at,
            updated_at
          )
          values (
            ${userId},
            ${options.defaultTenantId},
            ${email},
            ${displayName},
            ${options.defaultSsoUserStatus},
            ${hashPassword(randomUUID())},
            0,
            null,
            true,
            now(),
            now(),
            now()
          )
          returning
            id,
            tenant_id,
            email,
            display_name,
            status,
            password_hash,
            failed_login_count,
            locked_until,
            last_login_at,
            created_at
        `;

        if (!user) {
          throw new Error('SSO JIT provisioning did not return a persisted user.');
        }

        await insertAuthIdentity(tx, {
          tenantId: user.tenant_id,
          userId: user.id,
          provider: 'sso',
          providerUserId: `${input.providerId}:${email}`,
          email,
        });

        const session = await issueSession(tx, user);

        return {
          ...session,
          providerId: input.providerId,
          createdViaJit: true,
        };
      });

      return {
        ok: true,
        data,
      };
    },

    async revokeSession(sessionToken: string) {
      const rows = await database<{ id: string }[]>`
        update auth_sessions
        set status = 'revoked',
            revoked_at = now()
        where session_token_hash = ${hashToken(sessionToken)}
          and status = 'active'
        returning id
      `;

      return rows.length > 0;
    },

    async getUserBySessionToken(sessionToken: string) {
      const sessionTokenHash = hashToken(sessionToken);
      const [user] = await database<UserRow[]>`
        select
          u.id,
          u.tenant_id,
          u.email,
          u.display_name,
          u.status,
          u.password_hash,
          u.failed_login_count,
          u.locked_until,
          u.last_login_at,
          u.created_at
        from auth_sessions s
        inner join users u on u.id = s.user_id
        where s.session_token_hash = ${sessionTokenHash}
          and s.status = 'active'
        limit 1
      `;

      if (!user) {
        return null;
      }

      await database`
        update auth_sessions
        set last_used_at = now()
        where session_token_hash = ${sessionTokenHash}
          and status = 'active'
      `;

      return toAuthUser(user);
    },

    async getUserByEmail(email: string) {
      const user = await findUserByEmail(database, normalizeEmail(email));

      return user ? toAuthUser(user) : null;
    },

    async getMfaStatus(userId: string) {
      const user = await findUserById(database, userId);

      if (!user) {
        return null;
      }

      const factor = await findActiveMfaFactor(database, userId);

      return {
        enabled: factor !== null,
        enrolledAt: factor?.enabled_at ? toIso(factor.enabled_at) : null,
      };
    },

    async startMfaSetup(userId: string) {
      const user = await findUserById(database, userId);

      if (!user) {
        return fail(404, 'AUTH_INVALID_PAYLOAD', 'The target user could not be found.');
      }

      const existingFactor = await findActiveMfaFactor(database, userId);

      if (existingFactor) {
        return fail(409, 'AUTH_INVALID_PAYLOAD', 'MFA is already enabled for this account.');
      }

      const secret = generateTotpSecret();
      const setupToken = await createChallenge(database, {
        tenantId: user.tenant_id,
        userId: user.id,
        email: user.email,
        kind: 'mfa_setup',
        secret,
        ttlMs: MFA_SETUP_TTL_MS,
      });

      return {
        ok: true,
        data: {
          setupToken,
          manualEntryKey: secret,
          otpauthUri: createOtpAuthUri({
            issuer: MFA_ISSUER,
            accountName: user.email,
            secret,
          }),
          issuer: MFA_ISSUER,
          accountName: user.email,
        },
      };
    },

    async enableMfa(userId: string, input: MfaEnableRequest) {
      const user = await findUserById(database, userId);

      if (!user) {
        return fail(404, 'AUTH_INVALID_PAYLOAD', 'The target user could not be found.');
      }

      const challenge = await findChallenge(database, {
        token: input.setupToken,
        kind: 'mfa_setup',
      });

      if (!challenge || challenge.user_id !== user.id || !challenge.secret_encrypted) {
        return fail(
          400,
          'AUTH_INVALID_PAYLOAD',
          'The MFA setup token is invalid or belongs to another account.'
        );
      }

      if (isExpired(challenge.expires_at)) {
        await markChallengeConsumed(database, challenge.id);
        return fail(400, 'AUTH_INVALID_PAYLOAD', 'The MFA setup token has expired.');
      }

      if (!verifyTotpCode(challenge.secret_encrypted, input.code)) {
        return fail(401, 'AUTH_MFA_INVALID_CODE', 'The provided MFA code is invalid.');
      }

      const enrolledAt = new Date().toISOString();

      await database.begin(async transaction => {
        const tx = asDatabaseClient(transaction);

        await tx`
          update mfa_factors
          set disabled_at = now()
          where user_id = ${user.id}
            and disabled_at is null
        `;

        await tx`
          insert into mfa_factors (
            id,
            tenant_id,
            user_id,
            type,
            secret_encrypted,
            enabled_at,
            disabled_at,
            created_at
          )
          values (
            ${randomUUID()},
            ${user.tenant_id},
            ${user.id},
            'totp',
            ${challenge.secret_encrypted},
            ${enrolledAt}::timestamptz,
            null,
            now()
          )
        `;

        await markChallengeConsumed(tx, challenge.id);
      });

      return {
        ok: true,
        data: {
          enabled: true,
          enrolledAt,
        },
      };
    },

    async disableMfa(userId: string, input: MfaDisableRequest) {
      const factor = await findActiveMfaFactor(database, userId);

      if (!factor) {
        return fail(400, 'AUTH_INVALID_PAYLOAD', 'MFA is not enabled for this account.');
      }

      if (!verifyTotpCode(factor.secret_encrypted, input.code)) {
        return fail(401, 'AUTH_MFA_INVALID_CODE', 'The provided MFA code is invalid.');
      }

      await database.begin(async transaction => {
        const tx = asDatabaseClient(transaction);

        await tx`
          update mfa_factors
          set disabled_at = now()
          where id = ${factor.id}
        `;

        await tx`
          update auth_challenges
          set consumed_at = now()
          where user_id = ${userId}
            and kind = 'mfa_login'
            and consumed_at is null
        `;
      });

      return {
        ok: true,
        data: {
          enabled: false,
        },
      };
    },

    async verifyMfa(input: MfaVerifyRequest) {
      const challenge = await findChallenge(database, {
        token: input.ticket,
        kind: 'mfa_login',
      });

      if (!challenge) {
        return fail(400, 'AUTH_INVALID_PAYLOAD', 'The MFA verification ticket is invalid.');
      }

      if (isExpired(challenge.expires_at)) {
        await markChallengeConsumed(database, challenge.id);
        return fail(400, 'AUTH_INVALID_PAYLOAD', 'The MFA verification ticket has expired.');
      }

      const user = challenge.user_id
        ? await findUserById(database, challenge.user_id)
        : challenge.email
          ? await findUserByEmail(database, challenge.email)
          : null;

      if (!user) {
        await markChallengeConsumed(database, challenge.id);
        return fail(400, 'AUTH_INVALID_PAYLOAD', 'MFA is not enabled for this account.');
      }

      const factor = await findActiveMfaFactor(database, user.id);

      if (!factor) {
        await markChallengeConsumed(database, challenge.id);
        return fail(400, 'AUTH_INVALID_PAYLOAD', 'MFA is not enabled for this account.');
      }

      if (!verifyTotpCode(factor.secret_encrypted, input.code)) {
        return fail(401, 'AUTH_MFA_INVALID_CODE', 'The provided MFA code is invalid.');
      }

      const data = await database.begin(async transaction => {
        const tx = asDatabaseClient(transaction);

        await markChallengeConsumed(tx, challenge.id);
        return finalizeSuccessfulLogin(tx, user.id);
      });

      return {
        ok: true,
        data,
      };
    },

    async clear() {
      await database.unsafe(`
        truncate table
          auth_challenges,
          auth_sessions,
          audit_events,
          mfa_factors,
          invitations,
          auth_identities,
          group_members,
          groups,
          users,
          tenants
        restart identity
        cascade
      `);
    },

    async seedPendingUser(input: RegisterRequest) {
      const result = await this.register(input);

      if (!result.ok) {
        return result;
      }

      await database`
        update users
        set status = 'pending',
            updated_at = now()
        where id = ${result.data.user.id}
      `;

      return {
        ok: true,
        data: {
          user: {
            ...result.data.user,
            status: 'pending',
          },
          nextStep: 'login',
        },
      };
    },

    async seedInvitation(input: {
      email: string;
      tenantId?: string;
      expiresAt?: string;
    }): Promise<SeedInvitationResult> {
      const email = normalizeEmail(input.email);
      const tenantId = input.tenantId ?? options.defaultTenantId;
      const token = randomUUID();

      await ensureTenant(database, {
        tenantId,
      });

      const invitationId = randomUUID();
      const expiresAt =
        input.expiresAt ??
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await database`
        insert into invitations (
          id,
          tenant_id,
          invited_by_user_id,
          email,
          token_hash,
          status,
          expires_at,
          accepted_at,
          created_at
        )
        values (
          ${invitationId},
          ${tenantId},
          null,
          ${email},
          ${hashToken(token)},
          'pending',
          ${expiresAt}::timestamptz,
          null,
          now()
        )
      `;

      return {
        ok: true,
        data: {
          invitationId,
          token,
          email,
          expiresAt,
        },
      };
    },
  };
}
