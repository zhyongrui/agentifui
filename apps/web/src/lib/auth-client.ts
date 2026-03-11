import type {
  AuthErrorResponse,
  InvitationAcceptRequest,
  InvitationAcceptResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
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

export function registerWithPassword(payload: RegisterRequest) {
  return postJson<RegisterRequest, RegisterResponse>('/auth/register', payload);
}

export function acceptInvitation(payload: InvitationAcceptRequest) {
  return postJson<InvitationAcceptRequest, InvitationAcceptResponse>(
    '/auth/invitations/accept',
    payload
  );
}

export function loginWithPassword(payload: LoginRequest) {
  return postJson<LoginRequest, LoginResponse>('/auth/login', payload);
}
