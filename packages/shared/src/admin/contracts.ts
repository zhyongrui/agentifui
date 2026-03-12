import type { AuthAuditAction, AuthAuditEvent, AuthUserStatus } from '../auth/contracts.js';
import type { WorkspaceApp, WorkspaceGroup } from '../apps/contracts.js';

export type AdminErrorCode =
  | 'ADMIN_UNAUTHORIZED'
  | 'ADMIN_FORBIDDEN'
  | 'ADMIN_NOT_AVAILABLE';

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
};

export type AdminAppsResponse = {
  ok: true;
  data: {
    generatedAt: string;
    apps: AdminAppSummary[];
  };
};

export type AdminAuditActionCount = {
  action: AuthAuditAction | string;
  count: number;
};

export type AdminAuditResponse = {
  ok: true;
  data: {
    generatedAt: string;
    countsByAction: AdminAuditActionCount[];
    events: AuthAuditEvent[];
  };
};
