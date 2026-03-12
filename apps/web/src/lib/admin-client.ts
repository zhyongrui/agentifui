import type {
  AdminAppsResponse,
  AdminAuditResponse,
  AdminErrorResponse,
  AdminGroupsResponse,
  AdminUsersResponse,
} from '@agentifui/shared/admin';

const GATEWAY_PROXY_BASE_PATH = '/api/gateway';

async function fetchAdminJson<TSuccess>(
  path: string,
  sessionToken: string
): Promise<TSuccess | AdminErrorResponse> {
  const response = await fetch(`${GATEWAY_PROXY_BASE_PATH}${path}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
    cache: 'no-store',
  });

  return (await response.json()) as TSuccess | AdminErrorResponse;
}

export async function fetchAdminUsers(
  sessionToken: string
): Promise<AdminUsersResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminUsersResponse>('/admin/users', sessionToken);
}

export async function fetchAdminGroups(
  sessionToken: string
): Promise<AdminGroupsResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminGroupsResponse>('/admin/groups', sessionToken);
}

export async function fetchAdminApps(
  sessionToken: string
): Promise<AdminAppsResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminAppsResponse>('/admin/apps', sessionToken);
}

export async function fetchAdminAudit(
  sessionToken: string
): Promise<AdminAuditResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminAuditResponse>('/admin/audit', sessionToken);
}
