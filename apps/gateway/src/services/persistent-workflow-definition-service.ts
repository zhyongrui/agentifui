import { randomUUID } from "node:crypto";

import type { DatabaseClient } from "@agentifui/db";
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
} from "@agentifui/shared";

import {
  buildDefaultWorkflowPermissions,
  buildWorkflowDryRunResult,
  validateWorkflowDocument,
  type WorkflowDefinitionService,
} from "./workflow-definition-service.js";

type WorkflowDefinitionRow = {
  id: string;
  tenant_id: string;
  slug: string;
  title: string;
  description: string | null;
  current_version_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkflowVersionRow = {
  id: string;
  workflow_id: string;
  version_number: number;
  status: WorkflowDefinitionVersion["status"];
  document: string | WorkflowDefinitionDocument;
  validation_errors: string[] | string;
  published_at: Date | string | null;
  rolled_back_from_version_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkflowPermissionRow = {
  id: string;
  workflow_id: string;
  user_email: string;
  role: WorkflowPermission["role"];
  created_at: Date | string;
};

function toIso(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseDocument(value: string | WorkflowDefinitionDocument) {
  if (typeof value === "object" && value !== null) {
    return value;
  }

  return JSON.parse(value) as WorkflowDefinitionDocument;
}

function parseValidationErrors(value: string[] | string) {
  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toSummary(
  definition: WorkflowDefinitionRow,
  versions: WorkflowDefinitionVersion[],
): WorkflowDefinitionSummary {
  const currentVersion = versions.find((version) => version.id === definition.current_version_id) ?? null;

  return {
    id: definition.id,
    tenantId: definition.tenant_id,
    slug: definition.slug,
    title: definition.title,
    description: definition.description,
    currentVersionId: definition.current_version_id,
    currentVersionStatus: currentVersion?.status ?? null,
    createdAt: toIso(definition.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(definition.updated_at) ?? new Date().toISOString(),
  };
}

function toVersion(row: WorkflowVersionRow): WorkflowDefinitionVersion {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    versionNumber: row.version_number,
    status: row.status,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    publishedAt: toIso(row.published_at),
    rolledBackFromVersionId: row.rolled_back_from_version_id,
    validationErrors: parseValidationErrors(row.validation_errors),
    document: parseDocument(row.document),
  };
}

function toPermission(row: WorkflowPermissionRow): WorkflowPermission {
  return {
    id: row.id,
    userEmail: row.user_email,
    role: row.role,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

async function listWorkflowRows(database: DatabaseClient, tenantId: string) {
  const [definitions, versions, permissions] = await Promise.all([
    database<WorkflowDefinitionRow[]>`
      select id, tenant_id, slug, title, description, current_version_id, created_at, updated_at
      from workflow_definitions
      where tenant_id = ${tenantId}
      order by updated_at desc
    `,
    database<WorkflowVersionRow[]>`
      select id, workflow_id, version_number, status, document, validation_errors, published_at, rolled_back_from_version_id, created_at, updated_at
      from workflow_definition_versions
      where tenant_id = ${tenantId}
      order by workflow_id asc, version_number asc
    `,
    database<WorkflowPermissionRow[]>`
      select id, workflow_id, user_email, role, created_at
      from workflow_definition_permissions
      where tenant_id = ${tenantId}
      order by workflow_id asc, created_at asc
    `,
  ]);

  const versionsByWorkflowId = new Map<string, WorkflowDefinitionVersion[]>();
  const permissionsByWorkflowId = new Map<string, WorkflowPermission[]>();

  versions.forEach((row) => {
    const items = versionsByWorkflowId.get(row.workflow_id) ?? [];
    items.push(toVersion(row));
    versionsByWorkflowId.set(row.workflow_id, items);
  });
  permissions.forEach((row) => {
    const items = permissionsByWorkflowId.get(row.workflow_id) ?? [];
    items.push(toPermission(row));
    permissionsByWorkflowId.set(row.workflow_id, items);
  });

  return definitions.map((definition) => ({
    summary: toSummary(definition, versionsByWorkflowId.get(definition.id) ?? []),
    versions: versionsByWorkflowId.get(definition.id) ?? [],
    permissions: permissionsByWorkflowId.get(definition.id) ?? [],
  }));
}

export function createPersistentWorkflowDefinitionService(database: DatabaseClient): WorkflowDefinitionService {
  return {
    async listWorkflowsForUser(user) {
      const workflows = await listWorkflowRows(database, user.tenantId);

      return {
        ok: true,
        data: {
          generatedAt: new Date().toISOString(),
          workflows: workflows.map((workflow) => ({
            ...workflow.summary,
            versions: workflow.versions,
            permissions: workflow.permissions,
          })),
        },
      };
    },
    async createWorkflowForUser(user, input) {
      const validation = validateWorkflowDocument(input.document);
      const now = new Date().toISOString();
      const workflowId = `workflow_${randomUUID()}`;
      const versionId = `wfver_${randomUUID()}`;
      const permissions = buildDefaultWorkflowPermissions(user.email);

      try {
        await database.begin(async (transaction) => {
          const sql = transaction as unknown as DatabaseClient;

          await sql`
            insert into workflow_definitions (
              id, tenant_id, slug, title, description, current_version_id, created_by_user_id, created_at, updated_at
            ) values (
              ${workflowId}, ${user.tenantId}, ${input.slug.trim().toLowerCase()}, ${input.title.trim()}, ${input.description?.trim() || null}, ${versionId}, ${user.id}, ${now}, ${now}
            )
          `;
          await sql`
            insert into workflow_definition_versions (
              id, tenant_id, workflow_id, version_number, status, rolled_back_from_version_id, document, validation_errors, published_at, created_at, updated_at
            ) values (
              ${versionId}, ${user.tenantId}, ${workflowId}, 1, ${"draft"}, ${null}, ${JSON.stringify(input.document)}::jsonb, ${JSON.stringify(validation.errors)}::jsonb, ${null}, ${now}, ${now}
            )
          `;
          for (const permission of permissions) {
            await sql`
              insert into workflow_definition_permissions (
                id, tenant_id, workflow_id, user_email, role, created_at
              ) values (
                ${permission.id}, ${user.tenantId}, ${workflowId}, ${permission.userEmail}, ${permission.role}, ${permission.createdAt}
              )
            `;
          }
        });
      } catch (error) {
        return {
          ok: false,
          statusCode: 409,
          code: "ADMIN_INVALID_PAYLOAD",
          message: "Workflow creation failed. The slug may already exist.",
          details: error,
        };
      }

      return {
        ok: true,
        data: {
          workflow: {
            id: workflowId,
            tenantId: user.tenantId,
            slug: input.slug.trim().toLowerCase(),
            title: input.title.trim(),
            description: input.description?.trim() || null,
            currentVersionId: versionId,
            currentVersionStatus: "draft",
            createdAt: now,
            updatedAt: now,
          },
          version: {
            id: versionId,
            workflowId,
            versionNumber: 1,
            status: "draft",
            createdAt: now,
            updatedAt: now,
            publishedAt: null,
            rolledBackFromVersionId: null,
            validationErrors: validation.errors,
            document: input.document,
          },
        },
      };
    },
    async updateWorkflowForUser(user, workflowId, input) {
      const workflows = await listWorkflowRows(database, user.tenantId);
      const workflow = workflows.find((entry) => entry.summary.id === workflowId);

      if (!workflow) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow definition not found." };
      }

      const latestVersion = workflow.versions[workflow.versions.length - 1]!;
      const document = input.document ?? latestVersion.document;
      const validation = validateWorkflowDocument(document);
      const now = new Date().toISOString();
      const versionId = `wfver_${randomUUID()}`;

      await database.begin(async (transaction) => {
        const sql = transaction as unknown as DatabaseClient;

        await sql`
          insert into workflow_definition_versions (
            id, tenant_id, workflow_id, version_number, status, rolled_back_from_version_id, document, validation_errors, published_at, created_at, updated_at
          ) values (
            ${versionId}, ${user.tenantId}, ${workflowId}, ${latestVersion.versionNumber + 1}, ${"draft"}, ${null}, ${JSON.stringify(document)}::jsonb, ${JSON.stringify(validation.errors)}::jsonb, ${null}, ${now}, ${now}
          )
        `;
        await sql`
          update workflow_definitions
          set title = ${input.title?.trim() || workflow.summary.title},
              description = ${input.description !== undefined ? input.description?.trim() || null : workflow.summary.description},
              current_version_id = ${versionId},
              updated_at = ${now}
          where id = ${workflowId}
            and tenant_id = ${user.tenantId}
        `;
      });

      return {
        ok: true,
        data: {
          workflow: {
            ...workflow.summary,
            title: input.title?.trim() || workflow.summary.title,
            description: input.description !== undefined ? input.description?.trim() || null : workflow.summary.description,
            currentVersionId: versionId,
            currentVersionStatus: "draft",
            updatedAt: now,
          },
          version: {
            id: versionId,
            workflowId,
            versionNumber: latestVersion.versionNumber + 1,
            status: "draft",
            createdAt: now,
            updatedAt: now,
            publishedAt: null,
            rolledBackFromVersionId: null,
            validationErrors: validation.errors,
            document,
          },
        },
      };
    },
    async publishWorkflowForUser(user, workflowId, input) {
      const workflows = await listWorkflowRows(database, user.tenantId);
      const workflow = workflows.find((entry) => entry.summary.id === workflowId);
      const version = workflow?.versions.find((entry) => entry.id === input.versionId);

      if (!workflow || !version) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow version not found." };
      }

      const now = new Date().toISOString();

      await database.begin(async (transaction) => {
        const sql = transaction as unknown as DatabaseClient;

        await sql`
          update workflow_definition_versions
          set status = ${"archived"}, updated_at = ${now}
          where tenant_id = ${user.tenantId}
            and workflow_id = ${workflowId}
            and status = ${"published"}
            and id <> ${version.id}
        `;
        await sql`
          update workflow_definition_versions
          set status = ${"published"}, published_at = ${now}, updated_at = ${now}
          where tenant_id = ${user.tenantId}
            and workflow_id = ${workflowId}
            and id = ${version.id}
        `;
        await sql`
          update workflow_definitions
          set current_version_id = ${version.id}, updated_at = ${now}
          where id = ${workflowId}
            and tenant_id = ${user.tenantId}
        `;
      });

      return {
        ok: true,
        data: {
          workflow: {
            ...workflow.summary,
            currentVersionId: version.id,
            currentVersionStatus: "published",
            updatedAt: now,
          },
          version: {
            ...version,
            status: "published",
            publishedAt: now,
            updatedAt: now,
          },
        },
      };
    },
    async rollbackWorkflowForUser(user, workflowId, input) {
      const workflows = await listWorkflowRows(database, user.tenantId);
      const workflow = workflows.find((entry) => entry.summary.id === workflowId);
      const target = workflow?.versions.find((entry) => entry.id === input.targetVersionId);

      if (!workflow || !target) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow version not found." };
      }

      const now = new Date().toISOString();
      const versionId = `wfver_${randomUUID()}`;

      await database.begin(async (transaction) => {
        const sql = transaction as unknown as DatabaseClient;

        await sql`
          insert into workflow_definition_versions (
            id, tenant_id, workflow_id, version_number, status, rolled_back_from_version_id, document, validation_errors, published_at, created_at, updated_at
          ) values (
            ${versionId}, ${user.tenantId}, ${workflowId}, ${workflow.versions[workflow.versions.length - 1]!.versionNumber + 1}, ${"rolled_back"}, ${target.id}, ${JSON.stringify(target.document)}::jsonb, ${JSON.stringify(target.validationErrors)}::jsonb, ${now}, ${now}, ${now}
          )
        `;
        await sql`
          update workflow_definitions
          set current_version_id = ${versionId}, updated_at = ${now}
          where id = ${workflowId}
            and tenant_id = ${user.tenantId}
        `;
      });

      return {
        ok: true,
        data: {
          workflow: {
            ...workflow.summary,
            currentVersionId: versionId,
            currentVersionStatus: "rolled_back",
            updatedAt: now,
          },
          version: {
            id: versionId,
            workflowId,
            versionNumber: workflow.versions[workflow.versions.length - 1]!.versionNumber + 1,
            status: "rolled_back",
            createdAt: now,
            updatedAt: now,
            publishedAt: now,
            rolledBackFromVersionId: target.id,
            validationErrors: target.validationErrors,
            document: target.document,
          },
        },
      };
    },
    async updateWorkflowPermissionsForUser(user, workflowId, input) {
      const workflows = await listWorkflowRows(database, user.tenantId);
      const workflow = workflows.find((entry) => entry.summary.id === workflowId);

      if (!workflow) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow definition not found." };
      }

      const permissions = input.permissions.map((permission) => ({
        id: `wfperm_${randomUUID()}`,
        userEmail: permission.userEmail.trim().toLowerCase(),
        role: permission.role,
        createdAt: new Date().toISOString(),
      }));

      await database.begin(async (transaction) => {
        const sql = transaction as unknown as DatabaseClient;

        await sql`
          delete from workflow_definition_permissions
          where tenant_id = ${user.tenantId}
            and workflow_id = ${workflowId}
        `;
        for (const permission of permissions) {
          await sql`
            insert into workflow_definition_permissions (
              id, tenant_id, workflow_id, user_email, role, created_at
            ) values (
              ${permission.id}, ${user.tenantId}, ${workflowId}, ${permission.userEmail}, ${permission.role}, ${permission.createdAt}
            )
          `;
        }
      });

      return { ok: true, data: { workflowId, permissions } };
    },
    async dryRunWorkflowForUser(user, workflowId, input) {
      const workflows = await listWorkflowRows(database, user.tenantId);
      const workflow = workflows.find((entry) => entry.summary.id === workflowId);

      if (!workflow) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow definition not found." };
      }

      const version =
        (input.versionId ? workflow.versions.find((entry) => entry.id === input.versionId) : null) ??
        workflow.versions[workflow.versions.length - 1]!;

      return {
        ok: true,
        data: buildWorkflowDryRunResult(version.document, input.fixtures),
      };
    },
    async exportWorkflowForUser(user, workflowId) {
      const workflows = await listWorkflowRows(database, user.tenantId);
      const workflow = workflows.find((entry) => entry.summary.id === workflowId);

      if (!workflow) {
        return { ok: false, statusCode: 404, code: "ADMIN_NOT_FOUND", message: "Workflow definition not found." };
      }

      return { ok: true, data: { workflow: workflow.summary, versions: workflow.versions, permissions: workflow.permissions } };
    },
    async importWorkflowForUser(user, input) {
      const slugBase = input.workflow.slug.trim().toLowerCase() || `workflow-${randomUUID().slice(0, 8)}`;
      const workflows = await listWorkflowRows(database, user.tenantId);
      let slug = slugBase;

      while (workflows.some((workflow) => workflow.summary.slug === slug)) {
        slug = `${slugBase}-imported-${randomUUID().slice(0, 4)}`;
      }

      const workflowId = `workflow_${randomUUID()}`;
      const now = new Date().toISOString();
      const versionIdMap = new Map<string, string>();
      const versions = input.versions
        .slice()
        .sort((left, right) => left.versionNumber - right.versionNumber)
        .map((version) => {
          const nextId = `wfver_${randomUUID()}`;
          versionIdMap.set(version.id, nextId);

          return {
            ...version,
            id: nextId,
            workflowId,
            rolledBackFromVersionId: version.rolledBackFromVersionId,
          };
        });
      const currentVersion =
        versions.find((version) => version.id === versionIdMap.get(input.workflow.currentVersionId ?? "")) ??
        versions[versions.length - 1]!;
      const permissions = input.permissions.map((permission) => ({
        id: `wfperm_${randomUUID()}`,
        userEmail: permission.userEmail.trim().toLowerCase(),
        role: permission.role,
        createdAt: now,
      }));

      await database.begin(async (transaction) => {
        const sql = transaction as unknown as DatabaseClient;

        await sql`
          insert into workflow_definitions (
            id, tenant_id, slug, title, description, current_version_id, created_by_user_id, created_at, updated_at
          ) values (
            ${workflowId}, ${user.tenantId}, ${slug}, ${input.workflow.title}, ${input.workflow.description}, ${currentVersion.id}, ${user.id}, ${now}, ${now}
          )
        `;
        for (const version of versions) {
          await sql`
            insert into workflow_definition_versions (
              id, tenant_id, workflow_id, version_number, status, rolled_back_from_version_id, document, validation_errors, published_at, created_at, updated_at
            ) values (
              ${version.id},
              ${user.tenantId},
              ${workflowId},
              ${version.versionNumber},
              ${version.status},
              ${version.rolledBackFromVersionId ? versionIdMap.get(version.rolledBackFromVersionId) ?? null : null},
              ${JSON.stringify(version.document)}::jsonb,
              ${JSON.stringify(version.validationErrors)}::jsonb,
              ${version.publishedAt},
              ${now},
              ${now}
            )
          `;
        }
        for (const permission of permissions) {
          await sql`
            insert into workflow_definition_permissions (
              id, tenant_id, workflow_id, user_email, role, created_at
            ) values (
              ${permission.id}, ${user.tenantId}, ${workflowId}, ${permission.userEmail}, ${permission.role}, ${permission.createdAt}
            )
          `;
        }
      });

      return {
        ok: true,
        data: {
          workflow: {
            id: workflowId,
            tenantId: user.tenantId,
            slug,
            title: input.workflow.title,
            description: input.workflow.description,
            currentVersionId: currentVersion.id,
            currentVersionStatus: currentVersion.status,
            createdAt: now,
            updatedAt: now,
          },
          importedVersionCount: versions.length,
        },
      };
    },
  };
}
