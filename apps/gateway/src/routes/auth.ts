import type {
  AuthAuditListResponse,
  AuthErrorResponse,
  InvitationAcceptRequest,
  InvitationAcceptResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
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

  app.get('/auth/audit-events', async (request, reply) => {
    const sessionToken = readBearerToken(request.headers.authorization);

    if (!sessionToken) {
      reply.code(401);
      return buildErrorResponse(
        'AUTH_UNAUTHORIZED',
        'A valid session token is required to query audit events.'
      );
    }

    const user = authService.getUserBySessionToken(sessionToken);

    if (!user) {
      reply.code(401);
      return buildErrorResponse(
        'AUTH_UNAUTHORIZED',
        'The current session is missing or has expired.'
      );
    }

    if (user.status !== 'active') {
      reply.code(403);
      return buildErrorResponse(
        'AUTH_FORBIDDEN',
        'Only active users can query audit events.',
        {
          status: user.status,
        }
      );
    }

    const query = (request.query ?? {}) as { limit?: string };
    const parsedLimit = query.limit ? Number.parseInt(query.limit, 10) : Number.NaN;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;

    const response: AuthAuditListResponse = {
      ok: true,
      data: {
        events: auditService.listEvents({
          tenantId: user.tenantId,
          limit,
        }),
      },
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

  app.post('/auth/mfa/verify', async (_request, reply) => {
    reply.code(501);
    return buildErrorResponse(
      'AUTH_NOT_IMPLEMENTED',
      'MFA verification will be implemented in the next slice iteration.'
    );
  });
}
