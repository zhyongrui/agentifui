import type {
  WorkspaceApp,
  WorkspaceCatalogResponse,
  WorkspaceErrorResponse,
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

export async function fetchWorkspaceCatalog(
  sessionToken: string
): Promise<WorkspaceCatalogResponse | WorkspaceErrorResponse> {
  const response = await fetch(`${getGatewayBaseUrl()}/workspace/apps`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
    cache: 'no-store',
  });

  const payload = (await response.json()) as WorkspaceCatalogResponse | WorkspaceErrorResponse;

  if (!payload.ok) {
    return payload;
  }

  return {
    ...payload,
    data: {
      ...payload.data,
      apps: payload.data.apps.map(normalizeWorkspaceApp),
    },
  };
}
