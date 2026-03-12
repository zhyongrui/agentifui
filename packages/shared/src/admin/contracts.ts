import type {
  AuthAuditAction,
  AuthAuditEntityType,
  AuthAuditEvent,
  AuthAuditLevel,
  AuthUserStatus,
} from '../auth/contracts.js';
import type { WorkspaceApp, WorkspaceGroup } from '../apps/contracts.js';

export type AdminErrorCode =
  | 'ADMIN_UNAUTHORIZED'
  | 'ADMIN_FORBIDDEN'
  | 'ADMIN_NOT_AVAILABLE'
  | 'ADMIN_INVALID_PAYLOAD'
  | 'ADMIN_NOT_FOUND'
  | 'ADMIN_CONFLICT';

export type AdminErrorResponse = {
  ok: false;
  error: {
    code: AdminErrorCode;
    message: string;
    details?: unknown;
  };
};

export type AdminUserGroupMembership = {
  groupId: string;
  groupName: string;
  role: 'member' | 'manager';
  isPrimary: boolean;
};

export type AdminUserSummary = {
  id: string;
  email: string;
  displayName: string;
  status: AuthUserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
  roleIds: string[];
  groupMemberships: AdminUserGroupMembership[];
};

export type AdminUsersResponse = {
  ok: true;
  data: {
    generatedAt: string;
    users: AdminUserSummary[];
  };
};

export type AdminGroupAppGrant = Pick<WorkspaceApp, 'id' | 'slug' | 'name' | 'shortCode' | 'status'>;

export type AdminGroupSummary = Pick<WorkspaceGroup, 'id' | 'name' | 'description'> & {
  memberCount: number;
  managerCount: number;
  primaryMemberCount: number;
  appGrants: AdminGroupAppGrant[];
};

export type AdminGroupsResponse = {
  ok: true;
  data: {
    generatedAt: string;
    groups: AdminGroupSummary[];
  };
};

export type AdminAppGrantEffect = 'allow' | 'deny';

export type AdminAppGrantSubjectUser = {
  id: string;
  email: string;
  displayName: string;
  status: AuthUserStatus;
};

export type AdminAppUserGrant = {
  id: string;
  effect: AdminAppGrantEffect;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
  createdByUserId: string | null;
  user: AdminAppGrantSubjectUser;
};

export type AdminAppSummary = Pick<
  WorkspaceApp,
  'id' | 'slug' | 'name' | 'summary' | 'kind' | 'status' | 'shortCode' | 'launchCost'
> & {
  grantedGroups: Pick<WorkspaceGroup, 'id' | 'name'>[];
  grantedRoleIds: string[];
  directUserGrantCount: number;
  denyGrantCount: number;
  launchCount: number;
  lastLaunchedAt: string | null;
  userGrants: AdminAppUserGrant[];
};

export type AdminAppsResponse = {
  ok: true;
  data: {
    generatedAt: string;
    apps: AdminAppSummary[];
  };
};

export type AdminAppGrantCreateRequest = {
  subjectUserEmail: string;
  effect: AdminAppGrantEffect;
  reason?: string | null;
};

export type AdminAppGrantCreateResponse = {
  ok: true;
  data: {
    app: AdminAppSummary;
    grant: AdminAppUserGrant;
  };
};

export type AdminAppGrantDeleteResponse = {
  ok: true;
  data: {
    app: AdminAppSummary;
    revokedGrantId: string;
  };
};

export type AdminAuditActionCount = {
  action: AuthAuditAction | string;
  count: number;
};

export type AdminAuditFilters = {
  action?: string | null;
  level?: AuthAuditLevel | null;
  actorUserId?: string | null;
  entityType?: AuthAuditEntityType | null;
  traceId?: string | null;
  runId?: string | null;
  conversationId?: string | null;
  occurredAfter?: string | null;
  occurredBefore?: string | null;
  limit?: number | null;
};

export type AdminAuditEventContext = {
  traceId: string | null;
  runId: string | null;
  conversationId: string | null;
  appId: string | null;
  appName: string | null;
  activeGroupId: string | null;
  activeGroupName: string | null;
};

export type AdminAuditEventSummary = AuthAuditEvent & {
  context: AdminAuditEventContext;
};

export type AdminAuditResponse = {
  ok: true;
  data: {
    generatedAt: string;
    appliedFilters: AdminAuditFilters;
    countsByAction: AdminAuditActionCount[];
    events: AdminAuditEventSummary[];
  };
};
