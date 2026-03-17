import { createHash, randomUUID } from "node:crypto";

import type { AdminErrorCode } from "@agentifui/shared/admin";
import type { AuthUser } from "@agentifui/shared/auth";
import type {
  ConnectorCheckpoint,
  ConnectorCredentialRotateRequest,
  ConnectorCreateRequest,
  ConnectorDocumentProvenance,
  ConnectorRecord,
  ConnectorSyncJob,
  ConnectorQueueSyncRequest,
  ConnectorStatusUpdateRequest,
  ConnectorUpdateCheckpointRequest,
} from "@agentifui/shared";

import { buildConnectorHealth } from "./connector-health.js";
import { WORKSPACE_GROUPS } from "./workspace-catalog-fixtures.js";

type ConnectorMutationError = {
  ok: false;
  statusCode: 400 | 404 | 409;
  code: Extract<AdminErrorCode, "ADMIN_CONFLICT" | "ADMIN_INVALID_PAYLOAD" | "ADMIN_NOT_FOUND">;
  message: string;
  details?: unknown;
};

type ConnectorMutationResult<TData> =
  | {
      ok: true;
      data: TData;
    }
  | ConnectorMutationError;

export type ConnectorService = {
  listConnectorsForUser(user: AuthUser): Promise<ConnectorRecord[]> | ConnectorRecord[];
  createConnectorForUser(
    user: AuthUser,
    input: ConnectorCreateRequest,
  ): Promise<ConnectorMutationResult<ConnectorRecord>> | ConnectorMutationResult<ConnectorRecord>;
  queueSyncJobForUser(
    user: AuthUser,
    connectorId: string,
    input: ConnectorQueueSyncRequest,
  ): Promise<ConnectorMutationResult<ConnectorSyncJob>> | ConnectorMutationResult<ConnectorSyncJob>;
  listSyncJobsForUser(
    user: AuthUser,
    connectorId: string,
  ): Promise<ConnectorMutationResult<ConnectorSyncJob[]>> | ConnectorMutationResult<ConnectorSyncJob[]>;
  listProvenanceForUser(
    user: AuthUser,
    connectorId: string,
  ): Promise<ConnectorMutationResult<ConnectorDocumentProvenance[]>> | ConnectorMutationResult<ConnectorDocumentProvenance[]>;
  updateCheckpointForUser(
    user: AuthUser,
    connectorId: string,
    input: ConnectorUpdateCheckpointRequest,
  ): Promise<ConnectorMutationResult<ConnectorRecord>> | ConnectorMutationResult<ConnectorRecord>;
  updateConnectorStatusForUser(
    user: AuthUser,
    connectorId: string,
    input: ConnectorStatusUpdateRequest,
  ): Promise<ConnectorMutationResult<ConnectorRecord>> | ConnectorMutationResult<ConnectorRecord>;
  rotateConnectorCredentialForUser(
    user: AuthUser,
    connectorId: string,
    input: ConnectorCredentialRotateRequest,
  ): Promise<ConnectorMutationResult<ConnectorRecord>> | ConnectorMutationResult<ConnectorRecord>;
  deleteConnectorForUser(
    user: AuthUser,
    connectorId: string,
  ): Promise<ConnectorMutationResult<{ connectorId: string; deleted: true }>> | ConnectorMutationResult<{ connectorId: string; deleted: true }>;
};

function nowIso() {
  return new Date().toISOString();
}

function buildCheckpoint(input?: Partial<ConnectorCheckpoint>): ConnectorCheckpoint {
  return {
    cursor: input?.cursor ?? null,
    updatedAt: input?.updatedAt ?? null,
  };
}

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validateGroupScope(scope: ConnectorCreateRequest["scope"], groupId: string | null) {
  if (scope === "tenant") {
    return null;
  }

  if (!groupId) {
    return "__missing__";
  }

  return WORKSPACE_GROUPS.some((group) => group.id === groupId) ? groupId : "__invalid__";
}

function hashSecret(secret: string | null) {
  if (!secret) {
    return null;
  }

  return createHash("sha256").update(secret).digest("hex");
}

function decorateConnector(
  connector: ConnectorRecord,
  jobs: ConnectorSyncJob[],
): ConnectorRecord {
  return {
    ...connector,
    health: buildConnectorHealth({
      connector,
      jobs,
    }),
  };
}

export function createConnectorService(): ConnectorService {
  const connectors: ConnectorRecord[] = [];
  const credentials = new Map<string, { secretHash: string | null }>();
  const jobs = new Map<string, ConnectorSyncJob[]>();
  const provenance = new Map<string, ConnectorDocumentProvenance[]>();

  return {
    listConnectorsForUser(user) {
      return connectors
        .filter((connector) => connector.tenantId === user.tenantId)
        .map((connector) => decorateConnector(connector, jobs.get(connector.id) ?? []))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    createConnectorForUser(user, input) {
      const title = normalizeTitle(input.title);
      const groupId = validateGroupScope(input.scope, input.groupId);

      if (!title) {
        return {
          ok: false,
          statusCode: 400,
          code: "ADMIN_INVALID_PAYLOAD",
          message: "Connector creation requires a title.",
        };
      }

      if (groupId === "__missing__") {
        return {
          ok: false,
          statusCode: 400,
          code: "ADMIN_INVALID_PAYLOAD",
          message: "Group-scoped connectors require a target group.",
        };
      }

      if (groupId === "__invalid__") {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The target group does not exist.",
        };
      }

      if (input.authType !== "none" && !input.authSecret?.trim()) {
        return {
          ok: false,
          statusCode: 400,
          code: "ADMIN_INVALID_PAYLOAD",
          message: "This connector auth type requires a credential secret.",
        };
      }

      const createdAt = nowIso();
      const connector: ConnectorRecord = {
        id: `connector_${randomUUID()}`,
        tenantId: user.tenantId,
        title,
        kind: input.kind,
        scope: input.scope,
        groupId,
        status: "active",
        auth: {
          authType: input.authType,
          status: "active",
          lastValidatedAt: input.authType === "none" ? null : createdAt,
          lastRotatedAt: input.authType === "none" ? null : createdAt,
        },
        cadenceMinutes: input.cadenceMinutes,
        lastSyncedAt: null,
        checkpoint: buildCheckpoint(),
        health: {
          severity: "healthy",
          issues: [],
          failureSummary: {
            lastSyncStatus: null,
            lastFailureAt: null,
            lastFailureMessage: null,
            totalFailures: 0,
            hasPartialFailures: false,
          },
          staleSince: null,
        },
        createdAt,
        updatedAt: createdAt,
      };

      connectors.push(connector);
      credentials.set(connector.id, {
        secretHash: hashSecret(input.authSecret),
      });
      jobs.set(connector.id, []);
      provenance.set(connector.id, []);

      return {
        ok: true,
        data: decorateConnector(connector, []),
      };
    },
    queueSyncJobForUser(user, connectorId, input) {
      const connector = connectors.find(
        (candidate) =>
          candidate.id === connectorId && candidate.tenantId === user.tenantId,
      );

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      if (connector.status === "revoked") {
        return {
          ok: false,
          statusCode: 409,
          code: "ADMIN_CONFLICT",
          message: "Revoked connectors must rotate credentials before syncing again.",
        };
      }

      const createdAt = nowIso();
      const checkpointBefore = connector.checkpoint;
      const checkpointAfter = buildCheckpoint({
        cursor: input.checkpointCursor ?? connector.checkpoint.cursor,
        updatedAt: connector.checkpoint.updatedAt ?? createdAt,
      });
      const syncStatus = input.simulateStatus ?? "queued";
      const summary = {
        createdSources: input.summaryOverride?.createdSources ?? (syncStatus === "succeeded" ? 1 : 0),
        updatedSources: input.summaryOverride?.updatedSources ?? 0,
        skippedSources: input.summaryOverride?.skippedSources ?? 0,
        failedSources:
          input.summaryOverride?.failedSources ??
          (syncStatus === "failed" || syncStatus === "partial_failure" ? 1 : 0),
      };
      const job: ConnectorSyncJob = {
        id: `sync_${randomUUID()}`,
        tenantId: user.tenantId,
        connectorId,
        status: syncStatus,
        startedAt: syncStatus === "queued" ? null : createdAt,
        finishedAt:
          syncStatus === "queued" || syncStatus === "running" ? null : createdAt,
        requestedByUserId: input.requestedByUserId ?? user.id,
        checkpointBefore,
        checkpointAfter,
        summary,
        error: input.simulateError ?? null,
        createdAt,
      };

      jobs.set(connectorId, [job, ...(jobs.get(connectorId) ?? [])]);
      connector.updatedAt = createdAt;
      connector.checkpoint = checkpointAfter;
      if (syncStatus === "succeeded" || syncStatus === "partial_failure") {
        connector.lastSyncedAt = createdAt;
      }

      const connectorProvenance = provenance.get(connectorId) ?? [];
      const externalDocumentId =
        input.externalDocumentId ?? `${connector.kind}:${connectorId}:primary`;

      if (connectorProvenance.length === 0) {
        connectorProvenance.push({
          id: `prov_${randomUUID()}`,
          tenantId: user.tenantId,
          connectorId,
          knowledgeSourceId: `src_${connectorId}`,
          sourceKind:
            connector.kind === "file_drop" || connector.kind === "google_drive"
              ? "file"
              : "url",
          externalDocumentId,
          externalUpdatedAt: input.externalUpdatedAt ?? null,
          lastSyncJobId: job.id,
          lastSyncedAt:
            syncStatus === "succeeded" || syncStatus === "partial_failure"
              ? createdAt
              : null,
          createdAt,
          updatedAt: createdAt,
        });
      } else {
        const index = connectorProvenance.findIndex(
          (entry) => entry.externalDocumentId === externalDocumentId,
        );
        const current: ConnectorDocumentProvenance =
          index >= 0 && connectorProvenance[index]
            ? connectorProvenance[index]
            : {
                id: `prov_${randomUUID()}`,
                tenantId: user.tenantId,
                connectorId,
                knowledgeSourceId: `src_${connectorId}`,
                sourceKind:
                  connector.kind === "file_drop" || connector.kind === "google_drive"
                    ? "file"
                    : "url",
                externalDocumentId,
                externalUpdatedAt: null,
                lastSyncJobId: null,
                lastSyncedAt: null,
                createdAt,
                updatedAt: createdAt,
              };
        const next: ConnectorDocumentProvenance = {
          ...current,
          externalUpdatedAt: input.externalUpdatedAt ?? current.externalUpdatedAt,
          lastSyncJobId: job.id,
          lastSyncedAt:
            syncStatus === "succeeded" || syncStatus === "partial_failure"
              ? createdAt
              : current.lastSyncedAt,
          updatedAt: createdAt,
        };
        if (index >= 0) {
          connectorProvenance[index] = next;
        } else {
          connectorProvenance.unshift(next);
        }
      }

      provenance.set(connectorId, connectorProvenance);

      return {
        ok: true,
        data: job,
      };
    },
    listSyncJobsForUser(user, connectorId) {
      const connector = connectors.find(
        (candidate) =>
          candidate.id === connectorId && candidate.tenantId === user.tenantId,
      );

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      return {
        ok: true,
        data: jobs.get(connectorId) ?? [],
      };
    },
    listProvenanceForUser(user, connectorId) {
      const connector = connectors.find(
        (candidate) =>
          candidate.id === connectorId && candidate.tenantId === user.tenantId,
      );

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      return {
        ok: true,
        data: provenance.get(connectorId) ?? [],
      };
    },
    updateCheckpointForUser(user, connectorId, input) {
      const connector = connectors.find(
        (candidate) =>
          candidate.id === connectorId && candidate.tenantId === user.tenantId,
      );

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      const updatedAt = nowIso();
      connector.checkpoint = buildCheckpoint({
        cursor: input.cursor,
        updatedAt: input.updatedAt ?? updatedAt,
      });
      connector.updatedAt = updatedAt;

      return {
        ok: true,
        data: decorateConnector(connector, jobs.get(connectorId) ?? []),
      };
    },
    updateConnectorStatusForUser(user, connectorId, input) {
      const connector = connectors.find(
        (candidate) =>
          candidate.id === connectorId && candidate.tenantId === user.tenantId,
      );

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      const updatedAt = nowIso();
      connector.status = input.status;
      connector.auth.status = input.status;
      connector.updatedAt = updatedAt;

      return {
        ok: true,
        data: decorateConnector(connector, jobs.get(connectorId) ?? []),
      };
    },
    rotateConnectorCredentialForUser(user, connectorId, input) {
      const connector = connectors.find(
        (candidate) =>
          candidate.id === connectorId && candidate.tenantId === user.tenantId,
      );

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      const updatedAt = nowIso();
      credentials.set(connectorId, {
        secretHash: hashSecret(input.authSecret),
      });
      connector.status = "active";
      connector.auth.status = "active";
      connector.auth.lastValidatedAt = updatedAt;
      connector.auth.lastRotatedAt = updatedAt;
      connector.updatedAt = updatedAt;

      return {
        ok: true,
        data: decorateConnector(connector, jobs.get(connectorId) ?? []),
      };
    },
    deleteConnectorForUser(user, connectorId) {
      const index = connectors.findIndex(
        (candidate) =>
          candidate.id === connectorId && candidate.tenantId === user.tenantId,
      );

      if (index < 0) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      connectors.splice(index, 1);
      credentials.delete(connectorId);
      jobs.delete(connectorId);
      provenance.delete(connectorId);

      return {
        ok: true,
        data: {
          connectorId,
          deleted: true as const,
        },
      };
    },
  };
}
