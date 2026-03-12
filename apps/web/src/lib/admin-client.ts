import type {
  AdminAppGrantCreateRequest,
  AdminAppGrantCreateResponse,
  AdminAppGrantDeleteResponse,
  AdminAppsResponse,
  AdminAuditResponse,
  AdminErrorResponse,
  AdminGroupsResponse,
  AdminUsersResponse,
} from '@agentifui/shared/admin';

const GATEWAY_PROXY_BASE_PATH = '/api/gateway';

async function fetchAdminJson<TSuccess>(
  path: string,
  sessionToken: string,
  options: {
    body?: unknown;
    method?: 'DELETE' | 'GET' | 'POST';
  } = {}
): Promise<TSuccess | AdminErrorResponse> {
  const response = await fetch(`${GATEWAY_PROXY_BASE_PATH}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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

export async function createAdminAppGrant(
  sessionToken: string,
  appId: string,
  payload: AdminAppGrantCreateRequest
): Promise<AdminAppGrantCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminAppGrantCreateResponse>(`/admin/apps/${appId}/grants`, sessionToken, {
    method: 'POST',
    body: payload,
  });
}

export async function revokeAdminAppGrant(
  sessionToken: string,
  appId: string,
  grantId: string
): Promise<AdminAppGrantDeleteResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminAppGrantDeleteResponse>(
    `/admin/apps/${appId}/grants/${grantId}`,
    sessionToken,
    {
      method: 'DELETE',
    }
  );
}
