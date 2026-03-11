export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  displayName?: string;
};

export type SsoDiscoveryRequest = {
  email: string;
};

export type AuthErrorCode =
  | 'AUTH_INVALID_PAYLOAD'
  | 'AUTH_INVALID_EMAIL'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'AUTH_PASSWORD_TOO_WEAK'
  | 'AUTH_MFA_REQUIRED'
  | 'AUTH_ACCOUNT_PENDING'
  | 'AUTH_NOT_IMPLEMENTED';

export type AuthErrorResponse = {
  ok: false;
  error: {
    code: AuthErrorCode;
    message: string;
    details?: unknown;
  };
};

export type AuthSuccessResponse<T> = {
  ok: true;
  data: T;
};

export type SsoDiscoveryResponse = AuthSuccessResponse<{
  domain: string;
  hasSso: boolean;
  providerId: string | null;
}>;
