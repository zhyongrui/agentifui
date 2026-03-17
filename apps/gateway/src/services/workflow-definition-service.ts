import { randomUUID } from "node:crypto";

import type { AuthUser } from "@agentifui/shared/auth";
import type {
  WorkflowDefinitionCreateRequest,
  WorkflowDefinitionDocument,
  WorkflowDefinitionDryRunRequest,
  WorkflowDefinitionExportResponse,
  WorkflowDefinitionImportRequest,
  WorkflowDefinitionListResponse,
  WorkflowDefinitionPermissionsUpdateRequest,
  WorkflowDefinitionPublishRequest,
  WorkflowDefinitionRollbackRequest,
  WorkflowDefinitionSummary,
  WorkflowDefinitionUpdateRequest,
  WorkflowDefinitionVersion,
  WorkflowPermission,
  WorkflowPermissionRole,
  WorkflowValidationResult,
} from "@agentifui/shared";

type WorkflowErrorResult = {
  ok: false;
  statusCode: number;
  code: "ADMIN_FORBIDDEN" | "ADMIN_INVALID_PAYLOAD" | "ADMIN_NOT_FOUND";
  details?: unknown;
  message: string;
};

type WorkflowOkResult<T> = {
  ok: true;
  data: T;
};

type WorkflowServiceResult<T> = WorkflowErrorResult | WorkflowOkResult<T>;

export type WorkflowDefinitionService = {
  createWorkflowForUser(
    user: AuthUser,
    input: WorkflowDefinitionCreateRequest,
  ): Promise<WorkflowServiceResult<{ workflow: WorkflowDefinitionSummary; version: WorkflowDefinitionVersion }>>;
  dryRunWorkflowForUser(
    user: AuthUser,
    workflowId: string,
    input: WorkflowDefinitionDryRunRequest,
  ): Promise<WorkflowServiceResult<{ valid: boolean; errors: string[]; warnings: string[]; planPreview: Array<{ id: string; title: string; type: WorkflowDefinitionVersion["document"]["nodes"][number]["type"] }> }>>;
  exportWorkflowForUser(
    user: AuthUser,
    workflowId: string,
  ): Promise<WorkflowServiceResult<WorkflowDefinitionExportResponse["data"]>>;
  importWorkflowForUser(
    user: AuthUser,
    input: WorkflowDefinitionImportRequest,
  ): Promise<WorkflowServiceResult<{ workflow: WorkflowDefinitionSummary; importedVersionCount: number }>>;
  listWorkflowsForUser(user: AuthUser): Promise<WorkflowServiceResult<WorkflowDefinitionListResponse["data"]>>;
  publishWorkflowForUser(
    user: AuthUser,
    workflowId: string,
    input: WorkflowDefinitionPublishRequest,
  ): Promise<WorkflowServiceResult<{ workflow: WorkflowDefinitionSummary; version: WorkflowDefinitionVersion }>>;
  rollbackWorkflowForUser(
    user: AuthUser,
    workflowId: string,
    input: WorkflowDefinitionRollbackRequest,
  ): Promise<WorkflowServiceResult<{ workflow: WorkflowDefinitionSummary; version: WorkflowDefinitionVersion }>>;
  updateWorkflowForUser(
    user: AuthUser,
    workflowId: string,
    input: WorkflowDefinitionUpdateRequest,
  ): Promise<WorkflowServiceResult<{ workflow: WorkflowDefinitionSummary; version: WorkflowDefinitionVersion }>>;
  updateWorkflowPermissionsForUser(
    user: AuthUser,
    workflowId: string,
    input: WorkflowDefinitionPermissionsUpdateRequest,
  ): Promise<WorkflowServiceResult<{ workflowId: string; permissions: WorkflowPermission[] }>>;
};

type WorkflowRecord = {
  summary: WorkflowDefinitionSummary;
  versions: WorkflowDefinitionVersion[];
  permissions: WorkflowPermission[];
};

function cloneDocument(document: WorkflowDefinitionDocument): WorkflowDefinitionDocument {
  return JSON.parse(JSON.stringify(document)) as WorkflowDefinitionDocument;
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
      return;
    }

    seen.add(value);
  });

  return [...duplicates];
}

export function validateWorkflowDocument(document: WorkflowDefinitionDocument): WorkflowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = document.nodes.map((node) => node.id.trim()).filter(Boolean);
  const edgeIds = document.edges.map((edge) => edge.id.trim()).filter(Boolean);
  const variableNames = document.variables.map((variable) => variable.name.trim()).filter(Boolean);
  const approvalIds = document.approvals.map((approval) => approval.id.trim()).filter(Boolean);
  const nodeIdSet = new Set(nodeIds);

  if (document.nodes.length === 0) {
    errors.push("At least one workflow node is required.");
  }

  duplicateValues(nodeIds).forEach((value) => {
    errors.push(`Duplicate node id: ${value}`);
  });
  duplicateValues(edgeIds).forEach((value) => {
    errors.push(`Duplicate edge id: ${value}`);
  });
  duplicateValues(variableNames).forEach((value) => {
    errors.push(`Duplicate variable name: ${value}`);
  });
  duplicateValues(approvalIds).forEach((value) => {
    errors.push(`Duplicate approval id: ${value}`);
  });

  document.edges.forEach((edge) => {
    if (!nodeIdSet.has(edge.fromNodeId) || !nodeIdSet.has(edge.toNodeId)) {
      errors.push(`Edge ${edge.id} references unknown nodes.`);
    }
  });

  if (document.nodes.every((node) => document.edges.every((edge) => edge.toNodeId !== node.id))) {
    warnings.push("No entry node detected; every node has at least one inbound edge.");
  }

  document.nodes.forEach((node) => {
    if (!node.title.trim()) {
      errors.push(`Node ${node.id} is missing a title.`);
    }

    if (node.type === "approval" && document.approvals.length === 0) {
      warnings.push(`Approval node ${node.id} has no approval policy defined.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function buildWorkflowDryRunResult(
  document: WorkflowDefinitionDocument,
  _fixtures: Record<string, string> = {},
) {
  const validation = validateWorkflowDocument(document);

  return {
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    planPreview: document.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
    })),
  };
}

export function buildDefaultWorkflowPermissions(userEmail: string) {
  const createdAt = new Date().toISOString();
  const roles: WorkflowPermissionRole[] = ["author", "reviewer", "publisher", "runner"];

  return roles.map((role) => ({
    id: `wfperm_${randomUUID()}`,
    userEmail,
    role,
    createdAt,
  }));
}

function buildNextVersion(input: {
  document: WorkflowDefinitionDocument;
  rolledBackFromVersionId?: string | null;
  status: WorkflowDefinitionVersion["status"];
  versionNumber: number;
}) {
  const validation = validateWorkflowDocument(input.document);
  const now = new Date().toISOString();

  return {
    id: `wfver_${randomUUID()}`,
    workflowId: "",
    versionNumber: input.versionNumber,
    status: input.status,
    createdAt: now,
    updatedAt: now,
    publishedAt: input.status === "published" || input.status === "rolled_back" ? now : null,
    rolledBackFromVersionId: input.rolledBackFromVersionId ?? null,
    validationErrors: validation.errors,
    document: cloneDocument(input.document),
  } satisfies WorkflowDefinitionVersion;
}

export function createWorkflowDefinitionService(): WorkflowDefinitionService {
  const records = new Map<string, WorkflowRecord>();

  return {
    async listWorkflowsForUser(user) {
      return {
        ok: true,
        data: {
          generatedAt: new Date().toISOString(),
          workflows: [...records.values()]
            .filter((record) => record.summary.tenantId === user.tenantId)
            .map((record) => ({
              ...record.summary,
              versions: record.versions,
              permissions: record.permissions,
            })),
        },
      };
    },
    async createWorkflowForUser(user, input) {
      const slug = normalizeSlug(input.slug);

      if (!slug || !input.title.trim()) {
        return { ok: false, statusCode: 400, code: "ADMIN_INVALID_PAYLOAD", message: "Workflow slug and title are required." };
      }

      if ([...records.values()].some((record) => record.summary.tenantId === user.tenantId && record.summary.slug === slug)) {
        return { ok: false, statusCode: 409, code: "ADMIN_INVALID_PAYLOAD", message: "A workflow already exists for this slug." };
      }

      const now = new Date().toISOString();
      const workflowId = `workflow_${randomUUID()}`;
      const version = buildNextVersion({
        document: input.document,
        status: "draft",
        versionNumber: 1,
      });
      version.workflowId = workflowId;
      const summary: WorkflowDefinitionSummary = {
        id: workflowId,
        tenantId: user.tenantId,
        slug,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        currentVersionId: version.id,
        currentVersionStatus: version.status,
        createdAt: now,
        updatedAt: now,
      };
      const record: WorkflowRecord = {
        summary,
        versions: [version],
        permissions: buildDefaultWorkflowPermissions(user.email),
      };

      records.set(workflowId, record);

      return { ok: true, data: { workflow: summary, version } };
    },
    async updateWorkflowForUser(user, workflowId, input) {
      const record = records.get(workflowId);

      if (!record || record.summary.tenantId !== user.tenantId) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow definition not found." };
      }

      const document = input.document ? cloneDocument(input.document) : cloneDocument(record.versions[record.versions.length - 1]!.document);
      const version = buildNextVersion({
        document,
        status: "draft",
        versionNumber: record.versions[record.versions.length - 1]!.versionNumber + 1,
      });
      version.workflowId = workflowId;
      record.versions.push(version);
      record.summary = {
        ...record.summary,
        title: input.title?.trim() || record.summary.title,
        description: input.description !== undefined ? input.description?.trim() || null : record.summary.description,
        currentVersionId: version.id,
        currentVersionStatus: version.status,
        updatedAt: version.updatedAt,
      };

      return { ok: true, data: { workflow: record.summary, version } };
    },
    async publishWorkflowForUser(user, workflowId, input) {
      const record = records.get(workflowId);

      if (!record || record.summary.tenantId !== user.tenantId) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow definition not found." };
      }

      const version = record.versions.find((entry) => entry.id === input.versionId);

      if (!version) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow version not found." };
      }

      version.status = "published";
      version.publishedAt = new Date().toISOString();
      version.updatedAt = version.publishedAt;
      record.versions.forEach((entry) => {
        if (entry.id !== version.id && entry.status === "published") {
          entry.status = "archived";
          entry.updatedAt = version.updatedAt;
        }
      });
      record.summary = {
        ...record.summary,
        currentVersionId: version.id,
        currentVersionStatus: version.status,
        updatedAt: version.updatedAt,
      };

      return { ok: true, data: { workflow: record.summary, version } };
    },
    async rollbackWorkflowForUser(user, workflowId, input) {
      const record = records.get(workflowId);

      if (!record || record.summary.tenantId !== user.tenantId) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow definition not found." };
      }

      const targetVersion = record.versions.find((entry) => entry.id === input.targetVersionId);

      if (!targetVersion) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow version not found." };
      }

      const version = buildNextVersion({
        document: targetVersion.document,
        rolledBackFromVersionId: targetVersion.id,
        status: "rolled_back",
        versionNumber: record.versions[record.versions.length - 1]!.versionNumber + 1,
      });
      version.workflowId = workflowId;
      record.versions.push(version);
      record.summary = {
        ...record.summary,
        currentVersionId: version.id,
        currentVersionStatus: version.status,
        updatedAt: version.updatedAt,
      };

      return { ok: true, data: { workflow: record.summary, version } };
    },
    async updateWorkflowPermissionsForUser(user, workflowId, input) {
      const record = records.get(workflowId);

      if (!record || record.summary.tenantId !== user.tenantId) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow definition not found." };
      }

      const createdAt = new Date().toISOString();
      record.permissions = input.permissions.map((permission) => ({
        id: `wfperm_${randomUUID()}`,
        userEmail: permission.userEmail.trim().toLowerCase(),
        role: permission.role,
        createdAt,
      }));

      return { ok: true, data: { workflowId, permissions: record.permissions } };
    },
    async dryRunWorkflowForUser(user, workflowId, input) {
      const record = records.get(workflowId);

      if (!record || record.summary.tenantId !== user.tenantId) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow definition not found." };
      }

      const version =
        (input.versionId ? record.versions.find((entry) => entry.id === input.versionId) : null) ??
        record.versions[record.versions.length - 1]!;

      return { ok: true, data: buildWorkflowDryRunResult(version.document, input.fixtures) };
    },
    async exportWorkflowForUser(user, workflowId) {
      const record = records.get(workflowId);

      if (!record || record.summary.tenantId !== user.tenantId) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow definition not found." };
      }

      return {
        ok: true,
        data: {
          workflow: record.summary,
          versions: record.versions,
          permissions: record.permissions,
        },
      };
    },
    async importWorkflowForUser(user, input) {
      const slugBase = normalizeSlug(input.workflow.slug || input.workflow.title);
      let slug = slugBase || `workflow-${randomUUID().slice(0, 8)}`;

      while ([...records.values()].some((record) => record.summary.tenantId === user.tenantId && record.summary.slug === slug)) {
        slug = `${slugBase || "workflow"}-imported-${randomUUID().slice(0, 4)}`;
      }

      const now = new Date().toISOString();
      const workflowId = `workflow_${randomUUID()}`;
      const versions = input.versions
        .sort((left, right) => left.versionNumber - right.versionNumber)
        .map((version) => ({
          ...version,
          id: `wfver_${randomUUID()}`,
          workflowId,
          document: cloneDocument(version.document),
          createdAt: now,
          updatedAt: now,
        }));
      const currentVersion = versions.find((version) => version.status === input.workflow.currentVersionStatus) ?? versions[versions.length - 1]!;
      const summary: WorkflowDefinitionSummary = {
        id: workflowId,
        tenantId: user.tenantId,
        slug,
        title: input.workflow.title,
        description: input.workflow.description,
        currentVersionId: currentVersion.id,
        currentVersionStatus: currentVersion.status,
        createdAt: now,
        updatedAt: now,
      };
      const permissions = input.permissions.map((permission) => ({
        ...permission,
        id: `wfperm_${randomUUID()}`,
        createdAt: now,
      }));

      records.set(workflowId, { summary, versions, permissions });

      return {
        ok: true,
        data: {
          workflow: summary,
          importedVersionCount: versions.length,
        },
      };
    },
  };
}
