import type {
  AuthErrorResponse,
  LoginRequest,
  RegisterRequest,
  SsoDiscoveryRequest,
  SsoDiscoveryResponse,
} from '@agentifui/shared/auth';
import { validatePassword } from '@agentifui/shared/auth';
import type { FastifyInstance } from 'fastify';

import type { GatewayEnv } from '../config/env.js';

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

export async function registerAuthRoutes(
  app: FastifyInstance,
  env: GatewayEnv
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

    reply.code(501);
    return buildErrorResponse(
      'AUTH_NOT_IMPLEMENTED',
      'Registration persistence will be implemented in the next slice iteration.'
    );
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

    reply.code(501);
    return buildErrorResponse(
      'AUTH_NOT_IMPLEMENTED',
      'Credential verification will be implemented in the next slice iteration.'
    );
  });

  app.post('/auth/logout', async () => {
    return {
      ok: true,
      data: {
        loggedOut: true,
      },
    };
  });

  app.post('/auth/invitations/accept', async (_request, reply) => {
    reply.code(501);
    return buildErrorResponse(
      'AUTH_NOT_IMPLEMENTED',
      'Invitation activation will be implemented in the next slice iteration.'
    );
  });

  app.post('/auth/mfa/verify', async (_request, reply) => {
    reply.code(501);
    return buildErrorResponse(
      'AUTH_NOT_IMPLEMENTED',
      'MFA verification will be implemented in the next slice iteration.'
    );
  });
}
