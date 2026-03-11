import type { WorkspaceCatalogResponse, WorkspaceErrorResponse } from '@agentifui/shared/apps';

const DEFAULT_GATEWAY_URL = 'http://localhost:4000';

function getGatewayBaseUrl(): string {
  return process.env.NEXT_PUBLIC_GATEWAY_URL ?? DEFAULT_GATEWAY_URL;
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
