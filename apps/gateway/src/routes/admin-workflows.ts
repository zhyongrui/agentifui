import type { AdminErrorResponse } from "@agentifui/shared/admin";
import type {
  WorkflowDefinitionCreateRequest,
  WorkflowDefinitionCreateResponse,
  WorkflowDefinitionDryRunRequest,
  WorkflowDefinitionDryRunResponse,
  WorkflowDefinitionExportResponse,
  WorkflowDefinitionImportRequest,
  WorkflowDefinitionImportResponse,
  WorkflowDefinitionListResponse,
  WorkflowDefinitionPermissionsUpdateRequest,
  WorkflowDefinitionPermissionsUpdateResponse,
  WorkflowDefinitionPublishRequest,
  WorkflowDefinitionPublishResponse,
  WorkflowDefinitionRollbackRequest,
  WorkflowDefinitionRollbackResponse,
  WorkflowDefinitionUpdateRequest,
  WorkflowDefinitionUpdateResponse,
} from "@agentifui/shared";
import type { FastifyInstance } from "fastify";

import type { AdminService } from "../services/admin-service.js";
import type { AuditService } from "../services/audit-service.js";
import type { AuthService } from "../services/auth-service.js";
import type { WorkflowDefinitionService } from "../services/workflow-definition-service.js";

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
      response: buildErrorResponse("ADMIN_FORBIDDEN", "This user cannot access admin workflows."),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export async function registerAdminWorkflowRoutes(
  app: FastifyInstance,
  authService: AuthService,
  adminService: AdminService,
  workflowService: WorkflowDefinitionService,
  auditService: AuditService,
) {
  app.get("/admin/workflows", async (request, reply): Promise<WorkflowDefinitionListResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const result = await workflowService.listWorkflowsForUser(session.user);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    return {
      ok: true,
      data: result.data,
    };
  });

  app.post("/admin/workflows", async (request, reply): Promise<WorkflowDefinitionCreateResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const body = (request.body ?? {}) as Partial<WorkflowDefinitionCreateRequest>;

    if (typeof body.slug !== "string" || typeof body.title !== "string" || typeof body.document !== "object" || body.document === null) {
      reply.code(400);
      return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "Workflow creation requires slug, title, and document.");
    }

    const result = await workflowService.createWorkflowForUser(session.user, {
      slug: body.slug,
      title: body.title,
      description: typeof body.description === "string" ? body.description : null,
      document: body.document as WorkflowDefinitionCreateRequest["document"],
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: "workflow.definition.created",
      entityType: "workflow_definition",
      entityId: result.data.workflow.id,
      ipAddress: request.ip,
      payload: {
        versionId: result.data.version.id,
        versionNumber: result.data.version.versionNumber,
        validationErrors: result.data.version.validationErrors,
      },
    });

    return { ok: true, data: result.data };
  });

  app.put("/admin/workflows/:workflowId", async (request, reply): Promise<WorkflowDefinitionUpdateResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const params = (request.params ?? {}) as { workflowId?: string };
    const body = (request.body ?? {}) as Partial<WorkflowDefinitionUpdateRequest>;
    const workflowId = params.workflowId?.trim();

    if (!workflowId) {
      reply.code(400);
      return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "workflowId is required.");
    }

    const result = await workflowService.updateWorkflowForUser(session.user, workflowId, {
      title: typeof body.title === "string" ? body.title : undefined,
      description: typeof body.description === "string" ? body.description : body.description === null ? null : undefined,
      document: typeof body.document === "object" && body.document !== null ? (body.document as WorkflowDefinitionUpdateRequest["document"]) : undefined,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: "workflow.definition.updated",
      entityType: "workflow_definition",
      entityId: workflowId,
      ipAddress: request.ip,
      payload: {
        versionId: result.data.version.id,
        versionNumber: result.data.version.versionNumber,
      },
    });

    return { ok: true, data: result.data };
  });

  app.post("/admin/workflows/:workflowId/publish", async (request, reply): Promise<WorkflowDefinitionPublishResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const params = (request.params ?? {}) as { workflowId?: string };
    const body = (request.body ?? {}) as Partial<WorkflowDefinitionPublishRequest>;

    if (!params.workflowId?.trim() || typeof body.versionId !== "string") {
      reply.code(400);
      return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "Publishing requires workflowId and versionId.");
    }

    const result = await workflowService.publishWorkflowForUser(session.user, params.workflowId.trim(), {
      versionId: body.versionId,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: "workflow.definition.published",
      entityType: "workflow_version",
      entityId: result.data.version.id,
      ipAddress: request.ip,
      payload: {
        workflowId: params.workflowId.trim(),
        versionNumber: result.data.version.versionNumber,
      },
    });

    return { ok: true, data: result.data };
  });

  app.post("/admin/workflows/:workflowId/rollback", async (request, reply): Promise<WorkflowDefinitionRollbackResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const params = (request.params ?? {}) as { workflowId?: string };
    const body = (request.body ?? {}) as Partial<WorkflowDefinitionRollbackRequest>;

    if (!params.workflowId?.trim() || typeof body.targetVersionId !== "string") {
      reply.code(400);
      return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "Rollback requires workflowId and targetVersionId.");
    }

    const result = await workflowService.rollbackWorkflowForUser(session.user, params.workflowId.trim(), {
      targetVersionId: body.targetVersionId,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: "workflow.definition.rolled_back",
      entityType: "workflow_version",
      entityId: result.data.version.id,
      ipAddress: request.ip,
      payload: {
        workflowId: params.workflowId.trim(),
        rolledBackFromVersionId: result.data.version.rolledBackFromVersionId,
      },
    });

    return { ok: true, data: result.data };
  });

  app.put("/admin/workflows/:workflowId/permissions", async (request, reply): Promise<WorkflowDefinitionPermissionsUpdateResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const params = (request.params ?? {}) as { workflowId?: string };
    const body = (request.body ?? {}) as Partial<WorkflowDefinitionPermissionsUpdateRequest>;

    if (!params.workflowId?.trim() || !Array.isArray(body.permissions)) {
      reply.code(400);
      return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "Permission updates require workflowId and permissions.");
    }

    const result = await workflowService.updateWorkflowPermissionsForUser(session.user, params.workflowId.trim(), {
      permissions: body.permissions.filter((permission): permission is WorkflowDefinitionPermissionsUpdateRequest["permissions"][number] => {
        return Boolean(
          permission &&
            typeof permission.userEmail === "string" &&
            typeof permission.role === "string",
        );
      }),
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: "workflow.definition.permissions_updated",
      entityType: "workflow_definition",
      entityId: params.workflowId.trim(),
      ipAddress: request.ip,
      payload: {
        permissionCount: result.data.permissions.length,
      },
    });

    return { ok: true, data: result.data };
  });

  app.post("/admin/workflows/:workflowId/dry-run", async (request, reply): Promise<WorkflowDefinitionDryRunResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const params = (request.params ?? {}) as { workflowId?: string };
    const body = (request.body ?? {}) as Partial<WorkflowDefinitionDryRunRequest>;

    if (!params.workflowId?.trim()) {
      reply.code(400);
      return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "workflowId is required.");
    }

    const result = await workflowService.dryRunWorkflowForUser(session.user, params.workflowId.trim(), {
      versionId: typeof body.versionId === "string" ? body.versionId : null,
      fixtures: typeof body.fixtures === "object" && body.fixtures !== null ? (body.fixtures as Record<string, string>) : undefined,
    });

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: "workflow.definition.dry_run",
      entityType: "workflow_definition",
      entityId: params.workflowId.trim(),
      ipAddress: request.ip,
      payload: {
        valid: result.data.valid,
        errorCount: result.data.errors.length,
      },
    });

    return { ok: true, data: result.data };
  });

  app.get("/admin/workflows/:workflowId/export", async (request, reply): Promise<WorkflowDefinitionExportResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const params = (request.params ?? {}) as { workflowId?: string };

    if (!params.workflowId?.trim()) {
      reply.code(400);
      return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "workflowId is required.");
    }

    const result = await workflowService.exportWorkflowForUser(session.user, params.workflowId.trim());

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    return { ok: true, data: result.data };
  });

  app.post("/admin/workflows/import", async (request, reply): Promise<WorkflowDefinitionImportResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);

    if (!session.ok) {
      reply.code(session.statusCode);
      return session.response;
    }

    const body = (request.body ?? {}) as Partial<WorkflowDefinitionImportRequest>;

    if (!body.workflow || !Array.isArray(body.versions) || !Array.isArray(body.permissions)) {
      reply.code(400);
      return buildErrorResponse("ADMIN_INVALID_PAYLOAD", "Workflow import requires workflow, versions, and permissions.");
    }

    const result = await workflowService.importWorkflowForUser(session.user, body as WorkflowDefinitionImportRequest);

    if (!result.ok) {
      reply.code(result.statusCode);
      return buildErrorResponse(result.code, result.message, result.details);
    }

    await auditService.recordEvent({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      action: "workflow.definition.created",
      entityType: "workflow_definition",
      entityId: result.data.workflow.id,
      ipAddress: request.ip,
      payload: {
        importedVersionCount: result.data.importedVersionCount,
        source: "import",
      },
    });

    return { ok: true, data: result.data };
  });
}
