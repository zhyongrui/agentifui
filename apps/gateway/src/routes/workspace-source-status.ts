import type {
  WorkspaceErrorResponse,
  WorkspaceSourceStatusItem,
  WorkspaceSourceStatusResponse,
} from "@agentifui/shared/apps";
import type { FastifyInstance } from "fastify";

import type { AuthService } from "../services/auth-service.js";
import type { ConnectorService } from "../services/connector-service.js";
import type { KnowledgeService } from "../services/knowledge-service.js";

function buildErrorResponse(
  code: WorkspaceErrorResponse["error"]["code"],
  message: string,
  details?: unknown,
): WorkspaceErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}

function readBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function registerWorkspaceSourceStatusRoutes(
  app: FastifyInstance,
  authService: AuthService,
  knowledgeService: KnowledgeService,
  connectorService: ConnectorService,
) {
  app.get("/workspace/source-status", async (request, reply): Promise<WorkspaceSourceStatusResponse | WorkspaceErrorResponse> => {
    const sessionToken = readBearerToken(request.headers.authorization);

    if (!sessionToken) {
      reply.code(401);
      return buildErrorResponse("WORKSPACE_UNAUTHORIZED", "Workspace access requires a bearer session.");
    }

    const user = await authService.getUserBySessionToken(sessionToken);

    if (!user) {
      reply.code(401);
      return buildErrorResponse("WORKSPACE_UNAUTHORIZED", "The workspace session is invalid or expired.");
    }

    const [sourceResult, connectors] = await Promise.all([
      knowledgeService.listSourcesForUser(user, {}),
      connectorService.listConnectorsForUser(user),
    ]);
    const sourcesById = new Map(sourceResult.sources.map((source) => [source.id, source]));
    const items: WorkspaceSourceStatusItem[] = [];

    for (const connector of connectors) {
      if (connector.health.issues.length === 0) {
        continue;
      }

      const provenanceResult = await connectorService.listProvenanceForUser(user, connector.id);

      if (!provenanceResult.ok) {
        continue;
      }

      provenanceResult.data.forEach((entry) => {
        const source = sourcesById.get(entry.knowledgeSourceId);

        connector.health.issues.forEach((issue, issueIndex) => {
          items.push({
            id: `${connector.id}:${entry.knowledgeSourceId}:${issue.code}:${issueIndex}`,
            title: source?.title ?? `${connector.title} source`,
            sourceId: source?.id ?? entry.knowledgeSourceId,
            connectorId: connector.id,
            connectorTitle: connector.title,
            connectorKind: connector.kind,
            connectorStatus: connector.status,
            syncStatus: connector.health.failureSummary.lastSyncStatus,
            scope: source?.scope ?? connector.scope,
            groupId: source?.groupId ?? connector.groupId,
            severity:
              issue.severity === "critical"
                ? "critical"
                : issue.severity === "warning"
                  ? "warning"
                  : "healthy",
            reason:
              issue.code === "stale_sync"
                ? "stale"
                : issue.code === "sync_failed"
                  ? "sync_failed"
                  : issue.code === "sync_partial_failure"
                    ? "sync_partial_failure"
                    : issue.code,
            summary: issue.summary,
            updatedAt: source?.updatedAt ?? entry.updatedAt,
            staleSince: connector.health.staleSince,
          });
        });
      });
    }

    return {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        items: items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      },
    };
  });
}
