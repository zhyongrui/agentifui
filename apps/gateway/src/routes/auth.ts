import type {
  AuthAuditListResponse,
  AuthErrorResponse,
  AuthUser,
  InvitationAcceptRequest,
  InvitationAcceptResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
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
  SsoCallbackRequest,
  SsoCallbackResponse,
  SsoDiscoveryRequest,
  SsoDiscoveryResponse,
} from '@agentifui/shared/auth';
import { validatePassword } from '@agentifui/shared/auth';
import type { FastifyInstance } from 'fastify';

import type { GatewayEnv } from '../config/env.js';
import type { AuditService } from '../services/audit-service.js';
import type { AuthService } from '../services/auth-service.js';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildErrorResponse(
  code: AuthErrorResponse['error']['code'],
  message: string,
  details?: unknown
): AuthErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}

function getEmailDomain(email: string): string {
  return email.split('@')[1]!.toLowerCase();
}

function readBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function requireActiveSession(
  authService: AuthService,
  authorization: string | undefined,
  messages: {
    unauthorized: string;
    forbidden: string;
  }
):
  | {
      ok: true;
      user: AuthUser;
      sessionToken: string;
    }
  | {
      ok: false;
      statusCode: 401 | 403;
      response: AuthErrorResponse;
    } {
  const sessionToken = readBearerToken(authorization);

  if (!sessionToken) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse('AUTH_UNAUTHORIZED', messages.unauthorized),
    };
  }

  const user = authService.getUserBySessionToken(sessionToken);

  if (!user) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse('AUTH_UNAUTHORIZED', 'The current session is missing or has expired.'),
    };
  }

  if (user.status !== 'active') {
    return {
      ok: false,
      statusCode: 403,
      response: buildErrorResponse('AUTH_FORBIDDEN', messages.forbidden, {
        status: user.status,
      }),
    };
  }

  return {
    ok: true,
    user,
    sessionToken,
  };
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  env: GatewayEnv,
  authService: AuthService,
  auditService: AuditService
) {
  app.post('/auth/sso/discovery', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<SsoDiscoveryRequest>;
    const email = body.email?.trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      reply.code(400);
      return buildErrorResponse(
        'AUTH_INVALID_EMAIL',
        'A valid email address is required for SSO discovery.'
      );
    }

    const domain = getEmailDomain(email);
    const providerId = env.ssoDomainMap[domain] ?? null;

    const response: SsoDiscoveryResponse = {
      ok: true,
      data: {
        domain,
        hasSso: providerId !== null,
        providerId,
      },
    };

    return response;
  });

  app.post('/auth/sso/callback', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<SsoCallbackRequest>;

    if (!body.email || !body.providerId || !isValidEmail(body.email)) {
      reply.code(400);
      return buildErrorResponse(
        'AUTH_INVALID_PAYLOAD',
        'SSO callback requires a valid email and provider identifier.'
      );
    }

    const domain = getEmailDomain(body.email);
    const configuredProviderId = env.ssoDomainMap[domain];

    if (!configuredProviderId || configuredProviderId !== body.providerId) {
      reply.code(404);
      return buildErrorResponse(
        'AUTH_SSO_NOT_CONFIGURED',
        'No SSO provider is configured for this email domain.'
      );
    }

    const result = authService.loginWithSso({
      email: body.email,
      providerId: body.providerId,
      displayName: body.displayName,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    if (result.data.user.status === 'active') {
      auditService.recordEvent({
        tenantId: result.data.user.tenantId,
        actorUserId: result.data.user.id,
        action: 'auth.login.succeeded',
        entityType: 'session',
        entityId: result.data.sessionToken,
        ipAddress: request.ip,
        payload: {
          email: result.data.user.email,
          authMethod: 'sso',
          providerId: result.data.providerId,
        },
      });
    }

    const response: SsoCallbackResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.post('/auth/register', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<RegisterRequest>;

    if (!body.email || !body.password || !isValidEmail(body.email)) {
      reply.code(400);
      return buildErrorResponse(
        'AUTH_INVALID_PAYLOAD',
        'Register requires a valid email and password.'
      );
    }

    const validation = validatePassword(body.password);

    if (!validation.isValid) {
      reply.code(400);
      return buildErrorResponse(
        'AUTH_PASSWORD_TOO_WEAK',
        'Password does not satisfy the current password policy.',
        validation
      );
    }

    const result = authService.register({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: RegisterResponse = {
      ok: true,
      data: result.data,
    };

    reply.code(201);
    return response;
  });

  app.post('/auth/login', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<LoginRequest>;

    if (!body.email || !body.password || !isValidEmail(body.email)) {
      reply.code(400);
      return buildErrorResponse(
        'AUTH_INVALID_PAYLOAD',
        'Login requires a valid email and password.'
      );
    }

    const result = authService.login({
      email: body.email,
      password: body.password,
    });

    if (!result.ok) {
      reply.code(result.statusCode);

      if (result.code !== 'AUTH_MFA_REQUIRED') {
        const actor = authService.getUserByEmail(body.email);

        auditService.recordEvent({
          tenantId: actor?.tenantId ?? null,
          actorUserId: actor?.id ?? null,
          action: 'auth.login.failed',
          level: 'warning',
          entityType: 'user',
          entityId: actor?.id ?? null,
          ipAddress: request.ip,
          payload: {
            email: body.email.trim().toLowerCase(),
            code: result.code,
          },
        });
      }

      return buildErrorResponse(result.code, result.message, result.details);
    }

    auditService.recordEvent({
      tenantId: result.data.user.tenantId,
      actorUserId: result.data.user.id,
      action: 'auth.login.succeeded',
      entityType: 'session',
      entityId: result.data.sessionToken,
      ipAddress: request.ip,
      payload: {
        email: result.data.user.email,
        authMethod: 'password',
      },
    });

    const response: LoginResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.post('/auth/logout', async request => {
    const sessionToken = readBearerToken(request.headers.authorization);
    const actor = sessionToken ? authService.getUserBySessionToken(sessionToken) : null;

    if (sessionToken && actor) {
      auditService.recordEvent({
        tenantId: actor.tenantId,
        actorUserId: actor.id,
        action: 'auth.logout.succeeded',
        entityType: 'session',
        entityId: sessionToken,
        ipAddress: request.ip,
        payload: {
          email: actor.email,
        },
      });
    }

    const response: LogoutResponse = {
      ok: true,
      data: {
        loggedOut: true,
      },
    };

    return response;
  });

  app.get('/auth/mfa/status', async (request, reply) => {
    const access = requireActiveSession(authService, request.headers.authorization, {
      unauthorized: 'A valid session token is required to access MFA settings.',
      forbidden: 'Only active users can access MFA settings.',
    });

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const status = authService.getMfaStatus(access.user.id);

    if (!status) {
      reply.code(404);
      return buildErrorResponse('AUTH_INVALID_PAYLOAD', 'The target user could not be found.');
    }

    const response: MfaStatusResponse = {
      ok: true,
      data: status,
    };

    return response;
  });

  app.post('/auth/mfa/setup', async (request, reply) => {
    const access = requireActiveSession(authService, request.headers.authorization, {
      unauthorized: 'A valid session token is required to start MFA setup.',
      forbidden: 'Only active users can start MFA setup.',
    });

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const result = authService.startMfaSetup(access.user.id);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: MfaSetupResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.post('/auth/mfa/enable', async (request, reply) => {
    const access = requireActiveSession(authService, request.headers.authorization, {
      unauthorized: 'A valid session token is required to enable MFA.',
      forbidden: 'Only active users can enable MFA.',
    });

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const body = (request.body ?? {}) as Partial<MfaEnableRequest>;

    if (!body.setupToken || !body.code) {
      reply.code(400);
      return buildErrorResponse(
        'AUTH_INVALID_PAYLOAD',
        'MFA enable requires a setup token and a TOTP code.'
      );
    }

    const result = authService.enableMfa(access.user.id, {
      setupToken: body.setupToken,
      code: body.code,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: 'auth.mfa.enabled',
      entityType: 'user',
      entityId: access.user.id,
      ipAddress: request.ip,
      payload: {
        email: access.user.email,
      },
    });

    const response: MfaEnableResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.post('/auth/mfa/disable', async (request, reply) => {
    const access = requireActiveSession(authService, request.headers.authorization, {
      unauthorized: 'A valid session token is required to disable MFA.',
      forbidden: 'Only active users can disable MFA.',
    });

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const body = (request.body ?? {}) as Partial<MfaDisableRequest>;

    if (!body.code) {
      reply.code(400);
      return buildErrorResponse(
        'AUTH_INVALID_PAYLOAD',
        'MFA disable requires the current TOTP code.'
      );
    }

    const result = authService.disableMfa(access.user.id, {
      code: body.code,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    auditService.recordEvent({
      tenantId: access.user.tenantId,
      actorUserId: access.user.id,
      action: 'auth.mfa.disabled',
      entityType: 'user',
      entityId: access.user.id,
      ipAddress: request.ip,
      payload: {
        email: access.user.email,
      },
    });

    const response: MfaDisableResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.post('/auth/mfa/verify', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<MfaVerifyRequest>;

    if (!body.ticket || !body.code) {
      reply.code(400);
      return buildErrorResponse(
        'AUTH_INVALID_PAYLOAD',
        'MFA verification requires a ticket and a TOTP code.'
      );
    }

    const result = authService.verifyMfa({
      ticket: body.ticket,
      code: body.code,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    auditService.recordEvent({
      tenantId: result.data.user.tenantId,
      actorUserId: result.data.user.id,
      action: 'auth.login.succeeded',
      entityType: 'session',
      entityId: result.data.sessionToken,
      ipAddress: request.ip,
      payload: {
        email: result.data.user.email,
        authMethod: 'mfa',
      },
    });

    const response: MfaVerifyResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.post('/auth/invitations/accept', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<InvitationAcceptRequest>;

    if (!body.token || !body.password) {
      reply.code(400);
      return buildErrorResponse(
        'AUTH_INVALID_PAYLOAD',
        'Invitation activation requires a token and password.'
      );
    }

    const validation = validatePassword(body.password);

    if (!validation.isValid) {
      reply.code(400);
      return buildErrorResponse(
        'AUTH_PASSWORD_TOO_WEAK',
        'Password does not satisfy the current password policy.',
        validation
      );
    }

    const result = authService.acceptInvitation({
      token: body.token,
      password: body.password,
      displayName: body.displayName,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    const response: InvitationAcceptResponse = {
      ok: true,
      data: result.data,
    };

    return response;
  });

  app.get('/auth/audit-events', async (request, reply) => {
    const access = requireActiveSession(authService, request.headers.authorization, {
      unauthorized: 'A valid session token is required to query audit events.',
      forbidden: 'Only active users can query audit events.',
    });

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const query = (request.query ?? {}) as { limit?: string };
    const parsedLimit = query.limit ? Number.parseInt(query.limit, 10) : Number.NaN;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;

    const response: AuthAuditListResponse = {
      ok: true,
      data: {
        events: auditService.listEvents({
          tenantId: access.user.tenantId,
          limit,
        }),
      },
    };

    return response;
  });
}
