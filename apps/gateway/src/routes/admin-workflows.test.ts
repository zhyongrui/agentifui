import type {
  WorkflowDefinitionCreateResponse,
  WorkflowDefinitionDryRunResponse,
  WorkflowDefinitionExportResponse,
  WorkflowDefinitionImportResponse,
  WorkflowDefinitionListResponse,
  WorkflowDefinitionPermissionsUpdateResponse,
  WorkflowDefinitionPublishResponse,
  WorkflowDefinitionRollbackResponse,
  WorkflowDefinitionUpdateResponse,
} from "@agentifui/shared";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { createAuditService } from "../services/audit-service.js";
import { createAuthService } from "../services/auth-service.js";

const testEnv = {
  nodeEnv: "test" as const,
  host: "127.0.0.1",
  port: 4051,
  corsOrigin: true,
  ssoDomainMap: {
    "iflabx.com": "iflabx-sso",
  },
  defaultTenantId: "tenant-dev",
  defaultSsoUserStatus: "pending" as const,
  authLockoutThreshold: 5,
  authLockoutDurationMs: 1_800_000,
};

function createTestAuthService() {
  return createAuthService({
    defaultTenantId: testEnv.defaultTenantId,
    defaultSsoUserStatus: testEnv.defaultSsoUserStatus,
    lockoutThreshold: testEnv.authLockoutThreshold,
    lockoutDurationMs: testEnv.authLockoutDurationMs,
  });
}

describe("admin workflow routes", () => {
  it("creates, versions, publishes, rolls back, exports, imports, and audits workflow definitions", async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const app = await buildApp(testEnv, {
      logger: false,
      authService,
      auditService,
    });

    authService.register({
      email: "admin@example.net",
      password: "Secure123",
      displayName: "Workflow Admin",
    });

    const login = authService.login({
      email: "admin@example.net",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected admin login to succeed");
    }

    const headers = {
      authorization: `Bearer ${login.data.sessionToken}`,
    };
    const baseDocument = {
      nodes: [
        {
          id: "node_prompt",
          type: "prompt",
          title: "Collect context",
          description: "Normalize the request",
          config: {},
        },
      ],
      edges: [],
      variables: [],
      approvals: [],
    };

    try {
      const emptyList = await app.inject({
        method: "GET",
        url: "/admin/workflows",
        headers,
      });

      expect(emptyList.statusCode).toBe(200);
      expect((emptyList.json() as WorkflowDefinitionListResponse).data.workflows).toEqual([]);

      const createResponse = await app.inject({
        method: "POST",
        url: "/admin/workflows",
        headers,
        payload: {
          slug: "incident-review",
          title: "Incident Review",
          description: "Review context, approvals and exports.",
          document: baseDocument,
        },
      });

      expect(createResponse.statusCode).toBe(200);
      const created = createResponse.json() as WorkflowDefinitionCreateResponse;
      expect(created.data.workflow).toMatchObject({
        slug: "incident-review",
        currentVersionStatus: "draft",
      });

      const updateResponse = await app.inject({
        method: "PUT",
        url: `/admin/workflows/${created.data.workflow.id}`,
        headers,
        payload: {
          document: {
            ...baseDocument,
            nodes: [
              ...baseDocument.nodes,
              {
                id: "node_export",
                type: "export",
                title: "Export evidence",
                description: "Prepare evidence bundle",
                config: {},
              },
            ],
          },
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      const updated = updateResponse.json() as WorkflowDefinitionUpdateResponse;
      expect(updated.data.version.versionNumber).toBe(2);

      const publishResponse = await app.inject({
        method: "POST",
        url: `/admin/workflows/${created.data.workflow.id}/publish`,
        headers,
        payload: {
          versionId: updated.data.version.id,
        },
      });

      expect(publishResponse.statusCode).toBe(200);
      const published = publishResponse.json() as WorkflowDefinitionPublishResponse;
      expect(published.data.version.status).toBe("published");

      const permissionResponse = await app.inject({
        method: "PUT",
        url: `/admin/workflows/${created.data.workflow.id}/permissions`,
        headers,
        payload: {
          permissions: [
            {
              userEmail: "reviewer@example.net",
              role: "reviewer",
            },
            {
              userEmail: "runner@example.net",
              role: "runner",
            },
          ],
        },
      });

      expect(permissionResponse.statusCode).toBe(200);
      expect((permissionResponse.json() as WorkflowDefinitionPermissionsUpdateResponse).data.permissions).toHaveLength(2);

      const dryRunResponse = await app.inject({
        method: "POST",
        url: `/admin/workflows/${created.data.workflow.id}/dry-run`,
        headers,
        payload: {},
      });

      expect(dryRunResponse.statusCode).toBe(200);
      expect((dryRunResponse.json() as WorkflowDefinitionDryRunResponse).data.planPreview).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "node_export",
            type: "export",
          }),
        ]),
      );

      const exportResponse = await app.inject({
        method: "GET",
        url: `/admin/workflows/${created.data.workflow.id}/export`,
        headers,
      });

      expect(exportResponse.statusCode).toBe(200);
      const exported = exportResponse.json() as WorkflowDefinitionExportResponse;
      expect(exported.data.versions).toHaveLength(2);

      const rollbackResponse = await app.inject({
        method: "POST",
        url: `/admin/workflows/${created.data.workflow.id}/rollback`,
        headers,
        payload: {
          targetVersionId: updated.data.version.id,
        },
      });

      expect(rollbackResponse.statusCode).toBe(200);
      expect((rollbackResponse.json() as WorkflowDefinitionRollbackResponse).data.version.status).toBe(
        "rolled_back",
      );

      const importResponse = await app.inject({
        method: "POST",
        url: "/admin/workflows/import",
        headers,
        payload: exported.data,
      });

      expect(importResponse.statusCode).toBe(200);
      expect((importResponse.json() as WorkflowDefinitionImportResponse).data.importedVersionCount).toBe(2);

      const listResponse = await app.inject({
        method: "GET",
        url: "/admin/workflows",
        headers,
      });

      expect(listResponse.statusCode).toBe(200);
      expect((listResponse.json() as WorkflowDefinitionListResponse).data.workflows).toHaveLength(2);

      expect(await auditService.listEvents()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "workflow.definition.created",
            entityType: "workflow_definition",
          }),
          expect.objectContaining({
            action: "workflow.definition.updated",
            entityType: "workflow_definition",
            entityId: created.data.workflow.id,
          }),
          expect.objectContaining({
            action: "workflow.definition.published",
            entityType: "workflow_version",
            entityId: updated.data.version.id,
          }),
          expect.objectContaining({
            action: "workflow.definition.permissions_updated",
            entityType: "workflow_definition",
            entityId: created.data.workflow.id,
          }),
          expect.objectContaining({
            action: "workflow.definition.dry_run",
            entityType: "workflow_definition",
            entityId: created.data.workflow.id,
          }),
          expect.objectContaining({
            action: "workflow.definition.rolled_back",
            entityType: "workflow_version",
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });
});
