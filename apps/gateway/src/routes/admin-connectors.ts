import type { AdminErrorResponse } from "@agentifui/shared/admin";
import type {
  ConnectorCreateRequest,
  ConnectorCreateResponse,
  ConnectorListResponse,
  ConnectorProvenanceResponse,
  ConnectorSyncJobsResponse,
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

export async function registerAdminConnectorRoutes(
  app: FastifyInstance,
  authService: AuthService,
  adminService: AdminService,
  connectorService: ConnectorService,
  auditService: AuditService,
) {
  app.get("/admin/connectors", async (request, reply): Promise<ConnectorListResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const connectors = await connectorService.listConnectorsForUser(session.user);

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: "admin.workspace.read",
      entityType: "session",
      entityId: session.user.id,
      ipAddress: request.ip,
      payload: {
        resource: "/admin/connectors",
        resultCount: connectors.length,
      },
    });

    return {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        connectors,
      },
    };
  });

  app.post("/admin/connectors", async (request, reply): Promise<ConnectorCreateResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const body = (request.body ?? {}) as Partial<ConnectorCreateRequest>;
    const result = await connectorService.createConnectorForUser(session.user, {
      title: typeof body.title === "string" ? body.title : "",
      kind: body.kind ?? "web",
      scope: body.scope ?? "tenant",
      groupId: typeof body.groupId === "string" ? body.groupId : null,
      cadenceMinutes: typeof body.cadenceMinutes === "number" ? body.cadenceMinutes : 60,
      authType: body.authType ?? "none",
      authSecret: typeof body.authSecret === "string" ? body.authSecret : null,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: "knowledge.connector.created",
      entityType: "knowledge_connector",
      entityId: result.data.id,
      ipAddress: request.ip,
      payload: {
        kind: result.data.kind,
        scope: result.data.scope,
        groupId: result.data.groupId,
        cadenceMinutes: result.data.cadenceMinutes,
        authType: result.data.auth.authType,
      },
    });

    return {
      ok: true,
      data: result.data,
    };
  });

  app.post(
    "/admin/connectors/:connectorId/sync-jobs",
    async (request, reply): Promise<ConnectorSyncQueueResponse | AdminErrorResponse> => {
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

      const body = (request.body ?? {}) as {
        requestedByUserId?: string | null;
        checkpointCursor?: string | null;
      };
      const result = await connectorService.queueSyncJobForUser(session.user, connectorId, {
        requestedByUserId:
          typeof body.requestedByUserId === "string" ? body.requestedByUserId : null,
        checkpointCursor:
          typeof body.checkpointCursor === "string" ? body.checkpointCursor : null,
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
          checkpointAfter: result.data.checkpointAfter,
        },
      });

      return {
        ok: true,
        data: result.data,
      };
    },
  );

  app.get(
    "/admin/connectors/:connectorId/sync-jobs",
    async (request, reply): Promise<ConnectorSyncJobsResponse | AdminErrorResponse> => {
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

      const result = await connectorService.listSyncJobsForUser(session.user, connectorId);

      if (!result.ok) {
        reply.code(result.statusCode);
        return buildErrorResponse(result.code, result.message, result.details);
      }

      return {
        ok: true,
        data: {
          connectorId,
          jobs: result.data,
        },
      };
    },
  );

  app.get(
    "/admin/connectors/:connectorId/provenance",
    async (request, reply): Promise<ConnectorProvenanceResponse | AdminErrorResponse> => {
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

      const result = await connectorService.listProvenanceForUser(session.user, connectorId);

      if (!result.ok) {
        reply.code(result.statusCode);
        return buildErrorResponse(result.code, result.message, result.details);
      }

      return {
        ok: true,
        data: {
          connectorId,
          provenance: result.data,
        },
      };
    },
  );

  app.put(
    "/admin/connectors/:connectorId/checkpoint",
    async (request, reply): Promise<ConnectorCreateResponse | AdminErrorResponse> => {
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

      const body = (request.body ?? {}) as {
        cursor?: string | null;
        updatedAt?: string | null;
      };
      const result = await connectorService.updateCheckpointForUser(session.user, connectorId, {
        cursor: typeof body.cursor === "string" ? body.cursor : null,
        updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
      });

      if (!result.ok) {
        reply.code(result.statusCode);
        return buildErrorResponse(result.code, result.message, result.details);
      }

      await auditService.recordEvent({
        tenantId: session.user.tenantId,
        actorUserId: session.user.id,
        action: "knowledge.connector.checkpoint_updated",
        entityType: "knowledge_connector",
        entityId: connectorId,
        ipAddress: request.ip,
        payload: {
          checkpoint: result.data.checkpoint,
        },
      });

      return {
        ok: true,
        data: result.data,
      };
    },
  );
}
