export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  displayName?: string;
};

export type InvitationAcceptRequest = {
  token: string;
  password: string;
  displayName?: string;
};

export type SsoDiscoveryRequest = {
  email: string;
};

export type AuthErrorCode =
  | 'AUTH_INVALID_PAYLOAD'
  | 'AUTH_INVALID_EMAIL'
  | 'AUTH_EMAIL_ALREADY_EXISTS'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'AUTH_PASSWORD_TOO_WEAK'
  | 'AUTH_INVITE_TOKEN_INVALID'
  | 'AUTH_INVITE_LINK_EXPIRED'
  | 'AUTH_MFA_REQUIRED'
  | 'AUTH_ACCOUNT_PENDING'
  | 'AUTH_NOT_IMPLEMENTED';

export type AuthUserStatus = 'pending' | 'active' | 'suspended';

export type AuthUser = {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  status: AuthUserStatus;
  createdAt: string;
  lastLoginAt: string | null;
};

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

export type RegisterResponse = AuthSuccessResponse<{
  user: AuthUser;
  nextStep: 'login';
}>;

export type InvitationAcceptResponse = AuthSuccessResponse<{
  activated: true;
  userStatus: 'active';
  user: AuthUser;
  nextStep: 'login';
}>;

export type LoginResponse = AuthSuccessResponse<{
  sessionToken: string;
  user: AuthUser;
}>;

export type LogoutResponse = AuthSuccessResponse<{
  loggedOut: true;
}>;
