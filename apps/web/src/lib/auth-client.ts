import type {
  AuthErrorResponse,
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
  SsoCallbackRequest,
  SsoCallbackResponse,
  SsoDiscoveryRequest,
  SsoDiscoveryResponse,
} from '@agentifui/shared/auth';

const DEFAULT_GATEWAY_URL = 'http://localhost:4000';

function getGatewayBaseUrl(): string {
  return process.env.NEXT_PUBLIC_GATEWAY_URL ?? DEFAULT_GATEWAY_URL;
}

type AuthClientResult<T> = T | AuthErrorResponse;

async function postJson<TRequest, TResponse>(
  path: string,
  payload: TRequest
): Promise<AuthClientResult<TResponse>> {
  const response = await fetch(`${getGatewayBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return (await response.json()) as AuthClientResult<TResponse>;
}

async function postAuthorizedJson<TRequest, TResponse>(
  path: string,
  sessionToken: string,
  payload: TRequest
): Promise<AuthClientResult<TResponse>> {
  const response = await fetch(`${getGatewayBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return (await response.json()) as AuthClientResult<TResponse>;
}

async function getAuthorizedJson<TResponse>(
  path: string,
  sessionToken: string
): Promise<AuthClientResult<TResponse>> {
  const response = await fetch(`${getGatewayBaseUrl()}${path}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
    cache: 'no-store',
  });

  return (await response.json()) as AuthClientResult<TResponse>;
}

export function registerWithPassword(payload: RegisterRequest) {
  return postJson<RegisterRequest, RegisterResponse>('/auth/register', payload);
}

export function acceptInvitation(payload: InvitationAcceptRequest) {
  return postJson<InvitationAcceptRequest, InvitationAcceptResponse>(
    '/auth/invitations/accept',
    payload
  );
}

export function discoverSso(payload: SsoDiscoveryRequest) {
  return postJson<SsoDiscoveryRequest, SsoDiscoveryResponse>(
    '/auth/sso/discovery',
    payload
  );
}

export function continueWithSso(payload: SsoCallbackRequest) {
  return postJson<SsoCallbackRequest, SsoCallbackResponse>(
    '/auth/sso/callback',
    payload
  );
}

export function loginWithPassword(payload: LoginRequest) {
  return postJson<LoginRequest, LoginResponse>('/auth/login', payload);
}

export function getMfaStatus(sessionToken: string) {
  return getAuthorizedJson<MfaStatusResponse>('/auth/mfa/status', sessionToken);
}

export function startMfaSetup(sessionToken: string) {
  return postAuthorizedJson<Record<string, never>, MfaSetupResponse>(
    '/auth/mfa/setup',
    sessionToken,
    {}
  );
}

export function enableMfa(sessionToken: string, payload: MfaEnableRequest) {
  return postAuthorizedJson<MfaEnableRequest, MfaEnableResponse>(
    '/auth/mfa/enable',
    sessionToken,
    payload
  );
}

export function disableMfa(sessionToken: string, payload: MfaDisableRequest) {
  return postAuthorizedJson<MfaDisableRequest, MfaDisableResponse>(
    '/auth/mfa/disable',
    sessionToken,
    payload
  );
}

export function verifyMfa(payload: MfaVerifyRequest) {
  return postJson<MfaVerifyRequest, MfaVerifyResponse>('/auth/mfa/verify', payload);
}
