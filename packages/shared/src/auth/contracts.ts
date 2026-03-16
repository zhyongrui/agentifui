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

export type SsoCallbackRequest = {
  email: string;
  providerId: string;
  code?: string;
  displayName?: string;
};

export type AuthErrorCode =
  | 'AUTH_INVALID_PAYLOAD'
  | 'AUTH_INVALID_EMAIL'
  | 'AUTH_UNAUTHORIZED'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_EMAIL_ALREADY_EXISTS'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'AUTH_PASSWORD_TOO_WEAK'
  | 'AUTH_INVITE_TOKEN_INVALID'
  | 'AUTH_INVITE_LINK_EXPIRED'
  | 'AUTH_SSO_NOT_CONFIGURED'
  | 'AUTH_MFA_REQUIRED'
  | 'AUTH_MFA_INVALID_CODE'
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

export type AuthAuditLevel = 'info' | 'warning' | 'critical';

export type AuthAuditAction =
  | 'auth.login.succeeded'
  | 'auth.login.failed'
  | 'auth.logout.succeeded'
  | 'auth.mfa.enabled'
  | 'auth.mfa.disabled'
  | 'workspace.artifact.generated'
  | 'workspace.artifact.viewed'
  | 'workspace.artifact.downloaded'
  | 'workspace.preferences.updated'
  | 'workspace.app.launched'
  | 'workspace.conversation.updated'
  | 'workspace.conversation.deleted'
  | 'workspace.conversation_share.created'
  | 'workspace.conversation_share.expired'
  | 'workspace.conversation_share.revoked'
  | 'workspace.conversation_share.accessed'
  | 'workspace.cleanup.executed'
  | 'workspace.message.feedback.updated'
  | 'workspace.pending_action.responded'
  | 'workspace.pending_action.cancelled'
  | 'workspace.pending_action.expired'
  | 'workspace.quota.launch_blocked'
  | 'workspace.quota.usage_recorded'
  | 'workspace.run.safety_flagged'
  | 'workspace.run.stop_requested'
  | 'knowledge.source.created'
  | 'knowledge.source.status_updated'
  | 'admin.tenant.created'
  | 'admin.tenant.suspended'
  | 'admin.tenant.reactivated'
  | 'admin.workspace.read'
  | 'admin.workspace_tool_registry.updated'
  | 'admin.workspace_grant.created'
  | 'admin.workspace_grant.revoked'
  | 'admin.workspace_grant.rejected';

export type AuthAuditEntityType =
  | 'tenant'
  | 'user'
  | 'session'
  | 'workspace_app'
  | 'artifact'
  | 'knowledge_source'
  | 'conversation'
  | 'conversation_message'
  | 'conversation_share'
  | 'pending_action'
  | 'run';

export type AuthAuditEvent = {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  action: AuthAuditAction;
  level: AuthAuditLevel;
  entityType: AuthAuditEntityType;
  entityId: string | null;
  ipAddress: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
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

export type SsoCallbackResponse = AuthSuccessResponse<{
  sessionToken: string;
  user: AuthUser;
  providerId: string;
  createdViaJit: boolean;
}>;

export type LogoutResponse = AuthSuccessResponse<{
  loggedOut: true;
}>;

export type AuthAuditListResponse = AuthSuccessResponse<{
  events: AuthAuditEvent[];
}>;

export type MfaStatusResponse = AuthSuccessResponse<{
  enabled: boolean;
  enrolledAt: string | null;
}>;

export type MfaSetupResponse = AuthSuccessResponse<{
  setupToken: string;
  manualEntryKey: string;
  otpauthUri: string;
  issuer: string;
  accountName: string;
}>;

export type MfaEnableRequest = {
  setupToken: string;
  code: string;
};

export type MfaEnableResponse = AuthSuccessResponse<{
  enabled: true;
  enrolledAt: string;
}>;

export type MfaDisableRequest = {
  code: string;
};

export type MfaDisableResponse = AuthSuccessResponse<{
  enabled: false;
}>;

export type MfaVerifyRequest = {
  ticket: string;
  code: string;
};

export type MfaVerifyResponse = AuthSuccessResponse<{
  sessionToken: string;
  user: AuthUser;
}>;
