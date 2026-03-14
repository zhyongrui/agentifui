import type {
  WorkspaceAppLaunchRequest,
  WorkspaceAppLaunchResponse,
  WorkspaceApp,
  WorkspaceCatalogResponse,
  WorkspaceConversationListResponse,
  WorkspaceConversationMessageFeedbackRequest,
  WorkspaceConversationMessageFeedbackResponse,
  WorkspaceConversationResponse,
  WorkspaceConversationShareCreateRequest,
  WorkspaceConversationShareResponse,
  WorkspaceConversationSharesResponse,
  WorkspaceConversationUploadRequest,
  WorkspaceConversationUploadResponse,
  WorkspaceConversationUpdateRequest,
  WorkspaceConversationUpdateResponse,
  WorkspaceConversationRunsResponse,
  WorkspaceErrorResponse,
  WorkspacePreferencesResponse,
  WorkspacePreferencesUpdateRequest,
  WorkspaceSharedConversationResponse,
  WorkspaceRunResponse,
} from '@agentifui/shared/apps';

const GATEWAY_PROXY_BASE_PATH = '/api/gateway';

function getGatewayBaseUrl(): string {
  return GATEWAY_PROXY_BASE_PATH;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function normalizeWorkspaceApp(app: WorkspaceApp): WorkspaceApp {
  return {
    ...app,
    tags: normalizeStringArray(app.tags),
    grantedGroupIds: normalizeStringArray(app.grantedGroupIds),
  };
}

function normalizeWorkspaceCatalogPayload(payload: WorkspaceCatalogResponse): WorkspaceCatalogResponse {
  return {
    ...payload,
    data: {
      ...payload.data,
      apps: payload.data.apps.map(normalizeWorkspaceApp),
      favoriteAppIds: normalizeStringArray(payload.data.favoriteAppIds),
      recentAppIds: normalizeStringArray(payload.data.recentAppIds),
    },
  };
}

async function fetchWorkspaceJson<TSuccess>(
  path: string,
  input: {
    method: 'GET' | 'POST' | 'PUT';
    sessionToken: string;
    body?: unknown;
  }
): Promise<TSuccess | WorkspaceErrorResponse> {
  const response = await fetch(`${getGatewayBaseUrl()}${path}`, {
    method: input.method,
    headers: {
      authorization: `Bearer ${input.sessionToken}`,
      ...(input.body ? { 'content-type': 'application/json' } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: 'no-store',
  });

  return (await response.json()) as TSuccess | WorkspaceErrorResponse;
}

export async function fetchWorkspaceCatalog(
  sessionToken: string
): Promise<WorkspaceCatalogResponse | WorkspaceErrorResponse> {
  const payload = await fetchWorkspaceJson<WorkspaceCatalogResponse>('/workspace/apps', {
    method: 'GET',
    sessionToken,
  });

  if (!payload.ok) {
    return payload;
  }

  return normalizeWorkspaceCatalogPayload(payload);
}

export async function updateWorkspacePreferences(
  sessionToken: string,
  input: WorkspacePreferencesUpdateRequest
): Promise<WorkspacePreferencesResponse | WorkspaceErrorResponse> {
  return fetchWorkspaceJson<WorkspacePreferencesResponse>('/workspace/preferences', {
    method: 'PUT',
    sessionToken,
    body: input,
  });
}

export async function launchWorkspaceApp(
  sessionToken: string,
  input: WorkspaceAppLaunchRequest
): Promise<WorkspaceAppLaunchResponse | WorkspaceErrorResponse> {
  return fetchWorkspaceJson<WorkspaceAppLaunchResponse>('/workspace/apps/launch', {
    method: 'POST',
    sessionToken,
    body: input,
  });
}

export async function fetchWorkspaceConversation(
  sessionToken: string,
  conversationId: string
): Promise<WorkspaceConversationResponse | WorkspaceErrorResponse> {
  return fetchWorkspaceJson<WorkspaceConversationResponse>(
    `/workspace/conversations/${conversationId}`,
    {
      method: 'GET',
      sessionToken,
    }
  );
}

export async function updateWorkspaceConversationMessageFeedback(
  sessionToken: string,
  conversationId: string,
  messageId: string,
  input: WorkspaceConversationMessageFeedbackRequest
): Promise<WorkspaceConversationMessageFeedbackResponse | WorkspaceErrorResponse> {
  return fetchWorkspaceJson<WorkspaceConversationMessageFeedbackResponse>(
    `/workspace/conversations/${conversationId}/messages/${messageId}/feedback`,
    {
      method: 'PUT',
      sessionToken,
      body: input,
    }
  );
}

export async function updateWorkspaceConversation(
  sessionToken: string,
  conversationId: string,
  input: WorkspaceConversationUpdateRequest
): Promise<WorkspaceConversationUpdateResponse | WorkspaceErrorResponse> {
  return fetchWorkspaceJson<WorkspaceConversationUpdateResponse>(
    `/workspace/conversations/${conversationId}`,
    {
      method: 'PUT',
      sessionToken,
      body: input,
    }
  );
}

export async function fetchWorkspaceConversationList(
  sessionToken: string,
  input: {
    appId?: string | null;
    groupId?: string | null;
    limit?: number;
    query?: string | null;
  } = {}
): Promise<WorkspaceConversationListResponse | WorkspaceErrorResponse> {
  const params = new URLSearchParams();

  if (input.appId) {
    params.set('appId', input.appId);
  }

  if (input.groupId) {
    params.set('groupId', input.groupId);
  }

  if (input.query) {
    params.set('q', input.query);
  }

  if (typeof input.limit === 'number' && Number.isFinite(input.limit)) {
    params.set('limit', String(input.limit));
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : '';

  return fetchWorkspaceJson<WorkspaceConversationListResponse>(
    `/workspace/conversations${suffix}`,
    {
      method: 'GET',
      sessionToken,
    }
  );
}

export async function fetchWorkspaceConversationRuns(
  sessionToken: string,
  conversationId: string
): Promise<WorkspaceConversationRunsResponse | WorkspaceErrorResponse> {
  return fetchWorkspaceJson<WorkspaceConversationRunsResponse>(
    `/workspace/conversations/${conversationId}/runs`,
    {
      method: 'GET',
      sessionToken,
    }
  );
}

export async function uploadWorkspaceConversationFile(
  sessionToken: string,
  conversationId: string,
  input: WorkspaceConversationUploadRequest
): Promise<WorkspaceConversationUploadResponse | WorkspaceErrorResponse> {
  return fetchWorkspaceJson<WorkspaceConversationUploadResponse>(
    `/workspace/conversations/${conversationId}/uploads`,
    {
      method: 'POST',
      sessionToken,
      body: input,
    }
  );
}

export async function fetchWorkspaceConversationShares(
  sessionToken: string,
  conversationId: string
): Promise<WorkspaceConversationSharesResponse | WorkspaceErrorResponse> {
  return fetchWorkspaceJson<WorkspaceConversationSharesResponse>(
    `/workspace/conversations/${conversationId}/shares`,
    {
      method: 'GET',
      sessionToken,
    }
  );
}

export async function createWorkspaceConversationShare(
  sessionToken: string,
  conversationId: string,
  input: WorkspaceConversationShareCreateRequest
): Promise<WorkspaceConversationShareResponse | WorkspaceErrorResponse> {
  return fetchWorkspaceJson<WorkspaceConversationShareResponse>(
    `/workspace/conversations/${conversationId}/shares`,
    {
      method: 'POST',
      sessionToken,
      body: input,
    }
  );
}

export async function revokeWorkspaceConversationShare(
  sessionToken: string,
  conversationId: string,
  shareId: string
): Promise<WorkspaceConversationShareResponse | WorkspaceErrorResponse> {
  const response = await fetch(
    `${getGatewayBaseUrl()}/workspace/conversations/${conversationId}/shares/${shareId}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      cache: 'no-store',
    }
  );

  return (await response.json()) as WorkspaceConversationShareResponse | WorkspaceErrorResponse;
}

export async function fetchWorkspaceSharedConversation(
  sessionToken: string,
  shareId: string
): Promise<WorkspaceSharedConversationResponse | WorkspaceErrorResponse> {
  return fetchWorkspaceJson<WorkspaceSharedConversationResponse>(`/workspace/shares/${shareId}`, {
    method: 'GET',
    sessionToken,
  });
}

export async function fetchWorkspaceRun(
  sessionToken: string,
  runId: string
): Promise<WorkspaceRunResponse | WorkspaceErrorResponse> {
  return fetchWorkspaceJson<WorkspaceRunResponse>(`/workspace/runs/${runId}`, {
    method: 'GET',
    sessionToken,
  });
}
