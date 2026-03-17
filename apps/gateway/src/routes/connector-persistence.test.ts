import type {
  ConnectorCreateResponse,
  ConnectorListResponse,
  ConnectorProvenanceResponse,
  ConnectorSyncJobsResponse,
} from "@agentifui/shared";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import {
  PERSISTENT_TEST_ENV,
  resetPersistentTestDatabase,
} from "../test/persistent-db.js";

async function createPersistentApp() {
  return buildApp(PERSISTENT_TEST_ENV, {
    logger: false,
  });
}

describe.sequential("persistent connectors", () => {
  it("persists connectors, sync jobs, provenance, and checkpoints across restarts", async () => {
    await resetPersistentTestDatabase();

    const app = await createPersistentApp();
    let appClosed = false;

    try {
      const register = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "admin@iflabx.com",
          password: "Secure123",
          displayName: "Admin User",
        },
      });

      expect(register.statusCode).toBe(201);

      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "admin@iflabx.com",
          password: "Secure123",
        },
      });

      expect(login.statusCode).toBe(200);
      const sessionToken = (login.json() as { data: { sessionToken: string } }).data.sessionToken;
      const headers = {
        authorization: `Bearer ${sessionToken}`,
      };

      const create = await app.inject({
        method: "POST",
        url: "/admin/connectors",
        headers,
        payload: {
          title: "Confluence SOP",
          kind: "confluence",
          scope: "tenant",
          groupId: null,
          cadenceMinutes: 45,
          authType: "token",
          authSecret: "confluence-secret",
        },
      });

      expect(create.statusCode).toBe(200);
      const connector = (create.json() as ConnectorCreateResponse).data;

      const queue = await app.inject({
        method: "POST",
        url: `/admin/connectors/${connector.id}/sync-jobs`,
        headers,
        payload: {
          checkpointCursor: "seed-cursor",
        },
      });

      expect(queue.statusCode).toBe(200);

      const checkpoint = await app.inject({
        method: "PUT",
        url: `/admin/connectors/${connector.id}/checkpoint`,
        headers,
        payload: {
          cursor: "cursor-after-restart",
          updatedAt: "2026-03-17T06:00:00.000Z",
        },
      });

      expect(checkpoint.statusCode).toBe(200);

      await app.close();
      appClosed = true;

      const restartedApp = await createPersistentApp();

      try {
        const listed = await restartedApp.inject({
          method: "GET",
          url: "/admin/connectors",
          headers,
        });

        expect(listed.statusCode).toBe(200);
        expect((listed.json() as ConnectorListResponse).data.connectors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: connector.id,
              checkpoint: {
                cursor: "cursor-after-restart",
                updatedAt: "2026-03-17T06:00:00.000Z",
              },
            }),
          ]),
        );

        const jobs = await restartedApp.inject({
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

        const provenance = await restartedApp.inject({
          method: "GET",
          url: `/admin/connectors/${connector.id}/provenance`,
          headers,
        });

        expect(provenance.statusCode).toBe(200);
        expect((provenance.json() as ConnectorProvenanceResponse).data.provenance).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              connectorId: connector.id,
              externalDocumentId: `confluence:${connector.id}:primary`,
            }),
          ]),
        );
      } finally {
        await restartedApp.close();
      }
    } finally {
      if (!appClosed) {
        await app.close();
      }
    }
  }, 120_000);
});
