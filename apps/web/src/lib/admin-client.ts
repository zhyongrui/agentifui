import type {
  AdminAppGrantCreateRequest,
  AdminAppGrantCreateResponse,
  AdminAppGrantDeleteResponse,
  AdminAppsResponse,
  AdminAuditFilters,
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
  sessionToken: string,
  filters: AdminAuditFilters = {}
): Promise<AdminAuditResponse | AdminErrorResponse> {
  const params = new URLSearchParams();

  if (filters.action) {
    params.set('action', filters.action);
  }

  if (filters.level) {
    params.set('level', filters.level);
  }

  if (filters.actorUserId) {
    params.set('actorUserId', filters.actorUserId);
  }

  if (filters.entityType) {
    params.set('entityType', filters.entityType);
  }

  if (filters.traceId) {
    params.set('traceId', filters.traceId);
  }

  if (filters.runId) {
    params.set('runId', filters.runId);
  }

  if (filters.conversationId) {
    params.set('conversationId', filters.conversationId);
  }

  if (filters.occurredAfter) {
    params.set('occurredAfter', filters.occurredAfter);
  }

  if (filters.occurredBefore) {
    params.set('occurredBefore', filters.occurredBefore);
  }

  if (typeof filters.limit === 'number') {
    params.set('limit', String(filters.limit));
  }

  const query = params.toString();
  const suffix = query ? `?${query}` : '';

  return fetchAdminJson<AdminAuditResponse>(`/admin/audit${suffix}`, sessionToken);
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
