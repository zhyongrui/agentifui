import type { WorkspaceCatalogResponse, WorkspaceErrorResponse } from '@agentifui/shared/apps';

const GATEWAY_PROXY_BASE_PATH = '/api/gateway';

function getGatewayBaseUrl(): string {
  return GATEWAY_PROXY_BASE_PATH;
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

  return (await response.json()) as WorkspaceCatalogResponse | WorkspaceErrorResponse;
}
