import { createHash, randomUUID } from "node:crypto";

import type { AdminErrorCode } from "@agentifui/shared/admin";
import type { AuthUser } from "@agentifui/shared/auth";
import type {
  ConnectorCheckpoint,
  ConnectorCreateRequest,
  ConnectorDocumentProvenance,
  ConnectorRecord,
  ConnectorSyncJob,
  ConnectorQueueSyncRequest,
  ConnectorUpdateCheckpointRequest,
} from "@agentifui/shared";

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

export function createConnectorService(): ConnectorService {
  const connectors: ConnectorRecord[] = [];
  const credentials = new Map<string, { secretHash: string | null }>();
  const jobs = new Map<string, ConnectorSyncJob[]>();
  const provenance = new Map<string, ConnectorDocumentProvenance[]>();

  return {
    listConnectorsForUser(user) {
      return connectors
        .filter((connector) => connector.tenantId === user.tenantId)
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
        data: connector,
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

      const createdAt = nowIso();
      const checkpointBefore = connector.checkpoint;
      const checkpointAfter = buildCheckpoint({
        cursor: input.checkpointCursor ?? connector.checkpoint.cursor,
        updatedAt: connector.checkpoint.updatedAt ?? createdAt,
      });
      const job: ConnectorSyncJob = {
        id: `sync_${randomUUID()}`,
        tenantId: user.tenantId,
        connectorId,
        status: "queued",
        startedAt: null,
        finishedAt: null,
        requestedByUserId: input.requestedByUserId ?? user.id,
        checkpointBefore,
        checkpointAfter,
        summary: {
          createdSources: 0,
          updatedSources: 0,
          skippedSources: 0,
          failedSources: 0,
        },
        error: null,
        createdAt,
      };

      jobs.set(connectorId, [job, ...(jobs.get(connectorId) ?? [])]);
      connector.updatedAt = createdAt;
      connector.checkpoint = checkpointAfter;

      const connectorProvenance = provenance.get(connectorId) ?? [];

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
          externalDocumentId: `${connector.kind}:${connectorId}:primary`,
          externalUpdatedAt: null,
          lastSyncJobId: job.id,
          lastSyncedAt: null,
          createdAt,
          updatedAt: createdAt,
        });
      } else if (connectorProvenance[0]) {
        connectorProvenance[0] = {
          ...connectorProvenance[0],
          lastSyncJobId: job.id,
          updatedAt: createdAt,
        };
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
        data: connector,
      };
    },
  };
}
