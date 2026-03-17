import type { AdminErrorResponse } from "@agentifui/shared/admin";
import type {
  ConnectorCredentialRotateRequest,
  ConnectorCredentialRotateResponse,
  ConnectorDeleteResponse,
  ConnectorHealthResponse,
  ConnectorQueueSyncRequest,
  ConnectorStatus,
  ConnectorStatusUpdateRequest,
  ConnectorStatusUpdateResponse,
  ConnectorSyncQueueResponse,
} from "@agentifui/shared";
import type { FastifyInstance } from "fastify";

import type { AdminService } from "../services/admin-service.js";
import type { AuditService } from "../services/audit-service.js";
import type { AuthService } from "../services/auth-service.js";
import type { ConnectorService } from "../services/connector-service.js";

function buildErrorResponse(
  code: AdminErrorResponse["error"]["code"],
  message: string,
  details?: unknown,
): AdminErrorResponse {
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

function isConnectorStatus(value: unknown): value is ConnectorStatus {
  return value === "active" || value === "paused" || value === "revoked";
}

async function requireAdminSession(
  authService: AuthService,
  adminService: AdminService,
  authorization: string | undefined,
) {
  const sessionToken = readBearerToken(authorization);

  if (!sessionToken) {
    return {
      ok: false as const,
      statusCode: 401 as const,
      response: buildErrorResponse("ADMIN_UNAUTHORIZED", "Admin access requires a bearer session."),
    };
  }

  const user = await authService.getUserBySessionToken(sessionToken);

  if (!user) {
    return {
      ok: false as const,
      statusCode: 401 as const,
      response: buildErrorResponse("ADMIN_UNAUTHORIZED", "The admin session is invalid or expired."),
    };
  }

  if (!(await adminService.canReadAdminForUser(user))) {
    return {
      ok: false as const,
      statusCode: 403 as const,
      response: buildErrorResponse("ADMIN_FORBIDDEN", "This user cannot access admin connectors."),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export async function registerAdminConnectorOpsRoutes(
  app: FastifyInstance,
  authService: AuthService,
  adminService: AdminService,
  connectorService: ConnectorService,
  auditService: AuditService,
) {
  app.get(
    "/admin/connectors/health",
    async (request, reply): Promise<ConnectorHealthResponse | AdminErrorResponse> => {
      const session = await requireAdminSession(authService, adminService, request.headers.authorization);

      if (!session.ok) {
        reply.code(session.statusCode);
        return session.response;
      }

      const connectors = await connectorService.listConnectorsForUser(session.user);
      const counts = connectors.reduce<ConnectorHealthResponse["data"]["counts"]>(
        (accumulator, connector) => {
          connector.health.issues.forEach((issue) => {
            accumulator[issue.code] += 1;
          });
          return accumulator;
        },
        {
          stale_sync: 0,
          paused: 0,
          revoked: 0,
          sync_failed: 0,
          sync_partial_failure: 0,
        },
      );

      return {
        ok: true,
        data: {
          generatedAt: new Date().toISOString(),
          connectors,
          counts,
        },
      };
    },
  );

  app.put(
    "/admin/connectors/:connectorId/status",
    async (request, reply): Promise<ConnectorStatusUpdateResponse | AdminErrorResponse> => {
      const session = await requireAdminSession(authService, adminService, request.headers.authorization);

      if (!session.ok) {
        reply.code(session.statusCode);
        return session.response;
      }

      const params = (request.params ?? {}) as { connectorId?: string };
      const body = (request.body ?? {}) as Partial<ConnectorStatusUpdateRequest>;
      const connectorId = params.connectorId?.trim();

      if (!connectorId || !isConnectorStatus(body.status)) {
        reply.code(400);
        return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "Connector status updates require a connector id and valid status.");
      }

      const result = await connectorService.updateConnectorStatusForUser(session.user, connectorId, {
        status: body.status,
        reason: typeof body.reason === "string" ? body.reason : null,
      });

      if (!result.ok) {
        reply.code(result.statusCode);
        return buildErrorResponse(result.code, result.message, result.details);
      }

      await auditService.recordEvent({
        tenantId: session.user.tenantId,
        actorUserId: session.user.id,
        action: "knowledge.connector.status_updated",
        entityType: "knowledge_connector",
        entityId: connectorId,
        ipAddress: request.ip,
        payload: {
          status: result.data.status,
          reason: body.reason ?? null,
        },
      });

      return {
        ok: true,
        data: result.data,
      };
    },
  );

  app.put(
    "/admin/connectors/:connectorId/credentials",
    async (request, reply): Promise<ConnectorCredentialRotateResponse | AdminErrorResponse> => {
      const session = await requireAdminSession(authService, adminService, request.headers.authorization);

      if (!session.ok) {
        reply.code(session.statusCode);
        return session.response;
      }

      const params = (request.params ?? {}) as { connectorId?: string };
      const body = (request.body ?? {}) as Partial<ConnectorCredentialRotateRequest>;
      const connectorId = params.connectorId?.trim();

      if (!connectorId || typeof body.authSecret !== "string" || !body.authSecret.trim()) {
        reply.code(400);
        return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "Credential rotation requires a connector id and non-empty authSecret.");
      }

      const result = await connectorService.rotateConnectorCredentialForUser(session.user, connectorId, {
        authSecret: body.authSecret,
        note: typeof body.note === "string" ? body.note : null,
      });

      if (!result.ok) {
        reply.code(result.statusCode);
        return buildErrorResponse(result.code, result.message, result.details);
      }

      await auditService.recordEvent({
        tenantId: session.user.tenantId,
        actorUserId: session.user.id,
        action: "knowledge.connector.rotated",
        entityType: "knowledge_connector",
        entityId: connectorId,
        ipAddress: request.ip,
        payload: {
          note: body.note ?? null,
          authType: result.data.auth.authType,
          status: result.data.status,
        },
      });

      return {
        ok: true,
        data: result.data,
      };
    },
  );

  app.delete(
    "/admin/connectors/:connectorId",
    async (request, reply): Promise<ConnectorDeleteResponse | AdminErrorResponse> => {
      const session = await requireAdminSession(authService, adminService, request.headers.authorization);

      if (!session.ok) {
        reply.code(session.statusCode);
        return session.response;
      }

      const params = (request.params ?? {}) as { connectorId?: string };
      const connectorId = params.connectorId?.trim();

      if (!connectorId) {
        reply.code(400);
        return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "connectorId is required.");
      }

      const result = await connectorService.deleteConnectorForUser(session.user, connectorId);

      if (!result.ok) {
        reply.code(result.statusCode);
        return buildErrorResponse(result.code, result.message, result.details);
      }

      await auditService.recordEvent({
        tenantId: session.user.tenantId,
        actorUserId: session.user.id,
        action: "knowledge.connector.deleted",
        entityType: "knowledge_connector",
        entityId: connectorId,
        ipAddress: request.ip,
        payload: {
          deleted: true,
        },
      });

      return {
        ok: true,
        data: result.data,
      };
    },
  );

  app.post(
    "/admin/connectors/:connectorId/sync-jobs/advanced",
    async (request, reply): Promise<ConnectorSyncQueueResponse | AdminErrorResponse> => {
      const session = await requireAdminSession(authService, adminService, request.headers.authorization);

      if (!session.ok) {
        reply.code(session.statusCode);
        return session.response;
      }

      const params = (request.params ?? {}) as { connectorId?: string };
      const body = (request.body ?? {}) as Partial<ConnectorQueueSyncRequest>;
      const connectorId = params.connectorId?.trim();

      if (!connectorId) {
        reply.code(400);
        return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "connectorId is required.");
      }

      const result = await connectorService.queueSyncJobForUser(session.user, connectorId, {
        requestedByUserId:
          typeof body.requestedByUserId === "string" ? body.requestedByUserId : null,
        checkpointCursor:
          typeof body.checkpointCursor === "string" ? body.checkpointCursor : null,
        resumeFromJobId:
          typeof body.resumeFromJobId === "string" ? body.resumeFromJobId : null,
        simulateStatus: body.simulateStatus,
        simulateError:
          typeof body.simulateError === "string" ? body.simulateError : null,
        externalDocumentId:
          typeof body.externalDocumentId === "string" ? body.externalDocumentId : null,
        externalUpdatedAt:
          typeof body.externalUpdatedAt === "string" ? body.externalUpdatedAt : null,
        summaryOverride:
          typeof body.summaryOverride === "object" && body.summaryOverride !== null
            ? body.summaryOverride
            : undefined,
      });

      if (!result.ok) {
        reply.code(result.statusCode);
        return buildErrorResponse(result.code, result.message, result.details);
      }

      await auditService.recordEvent({
        tenantId: session.user.tenantId,
        actorUserId: session.user.id,
        action: "knowledge.connector.sync_queued",
        entityType: "knowledge_connector",
        entityId: connectorId,
        ipAddress: request.ip,
        payload: {
          syncJobId: result.data.id,
          status: result.data.status,
          resumeFromJobId: body.resumeFromJobId ?? null,
          checkpointAfter: result.data.checkpointAfter,
          summary: result.data.summary,
          error: result.data.error,
        },
      });

      return {
        ok: true,
        data: result.data,
      };
    },
  );
}
