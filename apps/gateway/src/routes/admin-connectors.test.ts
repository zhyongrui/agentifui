import type {
  ConnectorCreateResponse,
  ConnectorCredentialRotateResponse,
  ConnectorDeleteResponse,
  ConnectorHealthResponse,
  ConnectorListResponse,
  ConnectorProvenanceResponse,
  ConnectorStatusUpdateResponse,
  ConnectorSyncJobsResponse,
  ConnectorSyncQueueResponse,
  WorkspaceSourceStatusResponse,
} from "@agentifui/shared";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { createAuthService } from "../services/auth-service.js";

const testEnv = {
  nodeEnv: "test" as const,
  host: "127.0.0.1",
  port: 4050,
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

async function createTestApp() {
  const authService = createTestAuthService();
  const app = await buildApp(testEnv, {
    logger: false,
    authService,
  });

  return {
    app,
    authService,
  };
}

describe("admin connector routes", () => {
  it("creates connectors, queues sync jobs, lists provenance, and updates checkpoints", async () => {
    const { app, authService } = await createTestApp();

    authService.register({
      email: "admin@iflabx.com",
      password: "Secure123",
      displayName: "Admin User",
    });

    const login = authService.login({
      email: "admin@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected active login to succeed");
    }

    try {
      const headers = {
        authorization: `Bearer ${login.data.sessionToken}`,
      };

      const emptyList = await app.inject({
        method: "GET",
        url: "/admin/connectors",
        headers,
      });

      expect(emptyList.statusCode).toBe(200);
      expect((emptyList.json() as ConnectorListResponse).data.connectors).toEqual([]);

      const create = await app.inject({
        method: "POST",
        url: "/admin/connectors",
        headers,
        payload: {
          title: "Research Notion",
          kind: "notion",
          scope: "group",
          groupId: "grp_research",
          cadenceMinutes: 30,
          authType: "token",
          authSecret: "notion-token",
        },
      });

      expect(create.statusCode).toBe(200);
      const connector = (create.json() as ConnectorCreateResponse).data;
      expect(connector).toMatchObject({
        title: "Research Notion",
        kind: "notion",
        scope: "group",
        groupId: "grp_research",
        auth: {
          authType: "token",
          status: "active",
        },
      });

      const listed = await app.inject({
        method: "GET",
        url: "/admin/connectors",
        headers,
      });

      expect(listed.statusCode).toBe(200);
      expect((listed.json() as ConnectorListResponse).data.connectors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: connector.id,
            kind: "notion",
          }),
        ]),
      );

      const queued = await app.inject({
        method: "POST",
        url: `/admin/connectors/${connector.id}/sync-jobs`,
        headers,
        payload: {
          checkpointCursor: "cursor-1",
        },
      });

      expect(queued.statusCode).toBe(200);
      expect((queued.json() as ConnectorSyncQueueResponse).data).toMatchObject({
        connectorId: connector.id,
        status: "queued",
        checkpointAfter: {
          cursor: "cursor-1",
        },
      });

      const jobs = await app.inject({
        method: "GET",
        url: `/admin/connectors/${connector.id}/sync-jobs`,
        headers,
      });

      expect(jobs.statusCode).toBe(200);
      expect((jobs.json() as ConnectorSyncJobsResponse).data.jobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            connectorId: connector.id,
            status: "queued",
          }),
        ]),
      );

      const provenance = await app.inject({
        method: "GET",
        url: `/admin/connectors/${connector.id}/provenance`,
        headers,
      });

      expect(provenance.statusCode).toBe(200);
      expect((provenance.json() as ConnectorProvenanceResponse).data.provenance).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            connectorId: connector.id,
            externalDocumentId: `notion:${connector.id}:primary`,
          }),
        ]),
      );

      const checkpoint = await app.inject({
        method: "PUT",
        url: `/admin/connectors/${connector.id}/checkpoint`,
        headers,
        payload: {
          cursor: "cursor-2",
          updatedAt: "2026-03-17T00:00:00.000Z",
        },
      });

      expect(checkpoint.statusCode).toBe(200);
      expect((checkpoint.json() as ConnectorCreateResponse).data.checkpoint).toEqual({
        cursor: "cursor-2",
        updatedAt: "2026-03-17T00:00:00.000Z",
      });
    } finally {
      await app.close();
    }
  });

  it("reports connector health, allows status mutations, rotation, deletion, and user-facing source status", async () => {
    const { app, authService } = await createTestApp();

    authService.register({
      email: "admin@iflabx.com",
      password: "Secure123",
      displayName: "Admin User",
    });

    const login = authService.login({
      email: "admin@iflabx.com",
      password: "Secure123",
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error("expected active login to succeed");
    }

    try {
      const headers = {
        authorization: `Bearer ${login.data.sessionToken}`,
      };

      const create = await app.inject({
        method: "POST",
        url: "/admin/connectors",
        headers,
        payload: {
          title: "Ops Drive",
          kind: "google_drive",
          scope: "group",
          groupId: "grp_research",
          cadenceMinutes: 15,
          authType: "token",
          authSecret: "drive-secret",
        },
      });

      expect(create.statusCode).toBe(200);
      const connector = (create.json() as ConnectorCreateResponse).data;

      const advancedSync = await app.inject({
        method: "POST",
        url: `/admin/connectors/${connector.id}/sync-jobs/advanced`,
        headers,
        payload: {
          simulateStatus: "partial_failure",
          simulateError: "Drive API throttled",
          externalDocumentId: "drive:policy-handbook",
          externalUpdatedAt: "2026-03-17T10:00:00.000Z",
        },
      });

      expect(advancedSync.statusCode).toBe(200);
      expect((advancedSync.json() as ConnectorSyncQueueResponse).data).toMatchObject({
        status: "partial_failure",
        error: "Drive API throttled",
      });

      const health = await app.inject({
        method: "GET",
        url: "/admin/connectors/health",
        headers,
      });

      expect(health.statusCode).toBe(200);
      expect((health.json() as ConnectorHealthResponse).data).toMatchObject({
        counts: expect.objectContaining({
          sync_partial_failure: 1,
        }),
        connectors: [
          expect.objectContaining({
            id: connector.id,
            health: expect.objectContaining({
              failureSummary: expect.objectContaining({
                hasPartialFailures: true,
              }),
            }),
          }),
        ],
      });

      const paused = await app.inject({
        method: "PUT",
        url: `/admin/connectors/${connector.id}/status`,
        headers,
        payload: {
          status: "paused",
          reason: "maintenance-window",
        },
      });

      expect(paused.statusCode).toBe(200);
      expect((paused.json() as ConnectorStatusUpdateResponse).data.status).toBe("paused");

      const sourceStatus = await app.inject({
        method: "GET",
        url: "/workspace/source-status",
        headers,
      });

      expect(sourceStatus.statusCode).toBe(200);
      expect((sourceStatus.json() as WorkspaceSourceStatusResponse).data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            connectorId: connector.id,
            reason: "paused",
            connectorStatus: "paused",
          }),
        ]),
      );

      const rotated = await app.inject({
        method: "PUT",
        url: `/admin/connectors/${connector.id}/credentials`,
        headers,
        payload: {
          authSecret: "drive-secret-rotated",
          note: "rotate-after-revoke",
        },
      });

      expect(rotated.statusCode).toBe(200);
      expect((rotated.json() as ConnectorCredentialRotateResponse).data).toMatchObject({
        id: connector.id,
        status: "active",
        auth: {
          status: "active",
        },
      });

      const deleted = await app.inject({
        method: "DELETE",
        url: `/admin/connectors/${connector.id}`,
        headers,
      });

      expect(deleted.statusCode).toBe(200);
      expect((deleted.json() as ConnectorDeleteResponse).data).toEqual({
        connectorId: connector.id,
        deleted: true,
      });
    } finally {
      await app.close();
    }
  });
});
