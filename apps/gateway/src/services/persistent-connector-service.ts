import { createHash, randomUUID } from "node:crypto";

import type { DatabaseClient } from "@agentifui/db";
import type { AuthUser } from "@agentifui/shared/auth";
import type {
  ConnectorCheckpoint,
  ConnectorCredentialRotateRequest,
  ConnectorCreateRequest,
  ConnectorDocumentProvenance,
  ConnectorRecord,
  ConnectorQueueSyncRequest,
  ConnectorSyncJob,
  ConnectorStatusUpdateRequest,
  ConnectorUpdateCheckpointRequest,
  KnowledgeSourceKind,
} from "@agentifui/shared";

import { buildConnectorHealth } from "./connector-health.js";
import { WORKSPACE_GROUPS } from "./workspace-catalog-fixtures.js";
import type { ConnectorService } from "./connector-service.js";

type ConnectorRow = {
  id: string;
  tenant_id: string;
  title: string;
  kind: ConnectorRecord["kind"];
  scope: ConnectorRecord["scope"];
  group_id: string | null;
  status: ConnectorRecord["status"];
  auth_type: ConnectorRecord["auth"]["authType"];
  cadence_minutes: number;
  checkpoint_cursor: string | null;
  checkpoint_updated_at: Date | string | null;
  last_synced_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  credential_status: ConnectorRecord["auth"]["status"] | null;
  last_validated_at: Date | string | null;
  last_rotated_at: Date | string | null;
};

type SyncJobRow = {
  id: string;
  tenant_id: string;
  connector_id: string;
  status: ConnectorSyncJob["status"];
  started_at: Date | string | null;
  finished_at: Date | string | null;
  requested_by_user_id: string | null;
  checkpoint_before_cursor: string | null;
  checkpoint_before_updated_at: Date | string | null;
  checkpoint_after_cursor: string | null;
  checkpoint_after_updated_at: Date | string | null;
  summary: string | ConnectorSyncJob["summary"];
  error: string | null;
  created_at: Date | string;
};

type ProvenanceRow = {
  id: string;
  tenant_id: string;
  connector_id: string;
  knowledge_source_id: string;
  external_document_id: string;
  external_updated_at: Date | string | null;
  last_sync_job_id: string | null;
  last_synced_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  source_kind: KnowledgeSourceKind;
};

function toIso(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseSummary(value: string | ConnectorSyncJob["summary"]): ConnectorSyncJob["summary"] {
  if (typeof value === "object" && value !== null) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as ConnectorSyncJob["summary"];

    return {
      createdSources: parsed.createdSources ?? 0,
      updatedSources: parsed.updatedSources ?? 0,
      skippedSources: parsed.skippedSources ?? 0,
      failedSources: parsed.failedSources ?? 0,
    };
  } catch {
    return {
      createdSources: 0,
      updatedSources: 0,
      skippedSources: 0,
      failedSources: 0,
    };
  }
}

function toConnector(row: ConnectorRow): ConnectorRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    kind: row.kind,
    scope: row.scope,
    groupId: row.group_id,
    status: row.status,
    auth: {
      authType: row.auth_type,
      status: row.credential_status ?? row.status,
      lastValidatedAt: toIso(row.last_validated_at),
      lastRotatedAt: toIso(row.last_rotated_at),
    },
    cadenceMinutes: row.cadence_minutes,
    lastSyncedAt: toIso(row.last_synced_at),
    checkpoint: {
      cursor: row.checkpoint_cursor,
      updatedAt: toIso(row.checkpoint_updated_at),
    },
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
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function toSyncJob(row: SyncJobRow): ConnectorSyncJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    connectorId: row.connector_id,
    status: row.status,
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    requestedByUserId: row.requested_by_user_id,
    checkpointBefore: {
      cursor: row.checkpoint_before_cursor,
      updatedAt: toIso(row.checkpoint_before_updated_at),
    },
    checkpointAfter: {
      cursor: row.checkpoint_after_cursor,
      updatedAt: toIso(row.checkpoint_after_updated_at),
    },
    summary: parseSummary(row.summary),
    error: row.error,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

function toProvenance(row: ProvenanceRow): ConnectorDocumentProvenance {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    connectorId: row.connector_id,
    knowledgeSourceId: row.knowledge_source_id,
    sourceKind: row.source_kind,
    externalDocumentId: row.external_document_id,
    externalUpdatedAt: toIso(row.external_updated_at),
    lastSyncJobId: row.last_sync_job_id,
    lastSyncedAt: toIso(row.last_synced_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
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

async function getConnector(database: DatabaseClient, tenantId: string, connectorId: string) {
  const [row] = await database<ConnectorRow[]>`
    select
      c.id,
      c.tenant_id,
      c.title,
      c.kind,
      c.scope,
      c.group_id,
      c.status,
      c.auth_type,
      c.cadence_minutes,
      c.checkpoint_cursor,
      c.checkpoint_updated_at,
      c.last_synced_at,
      c.created_at,
      c.updated_at,
      cred.status as credential_status,
      cred.last_validated_at,
      cred.last_rotated_at
    from knowledge_connectors c
    left join knowledge_connector_credentials cred on cred.connector_id = c.id
    where c.tenant_id = ${tenantId}
      and c.id = ${connectorId}
    limit 1
  `;

  if (!row) {
    return null;
  }

  const connector = toConnector(row);
  const jobs = await listSyncJobsForConnector(database, tenantId, connector.id);

  return {
    ...connector,
    health: buildConnectorHealth({
      connector,
      jobs,
    }),
  };
}

async function listSyncJobsForConnector(
  database: DatabaseClient,
  tenantId: string,
  connectorId: string,
) {
  const rows = await database<SyncJobRow[]>`
    select
      id,
      tenant_id,
      connector_id,
      status,
      started_at,
      finished_at,
      requested_by_user_id,
      checkpoint_before_cursor,
      checkpoint_before_updated_at,
      checkpoint_after_cursor,
      checkpoint_after_updated_at,
      summary,
      error,
      created_at
    from knowledge_connector_sync_jobs
    where tenant_id = ${tenantId}
      and connector_id = ${connectorId}
    order by created_at desc
  `;

  return rows.map(toSyncJob);
}

export function createPersistentConnectorService(database: DatabaseClient): ConnectorService {
  return {
    async listConnectorsForUser(user) {
      const rows = await database<ConnectorRow[]>`
        select
          c.id,
          c.tenant_id,
          c.title,
          c.kind,
          c.scope,
          c.group_id,
          c.status,
          c.auth_type,
          c.cadence_minutes,
          c.checkpoint_cursor,
          c.checkpoint_updated_at,
          c.last_synced_at,
          c.created_at,
          c.updated_at,
          cred.status as credential_status,
          cred.last_validated_at,
          cred.last_rotated_at
        from knowledge_connectors c
        left join knowledge_connector_credentials cred on cred.connector_id = c.id
        where c.tenant_id = ${user.tenantId}
        order by c.updated_at desc
      `;

      return Promise.all(
        rows.map(async (row) => {
          const connector = toConnector(row);
          const jobs = await listSyncJobsForConnector(database, user.tenantId, connector.id);

          return {
            ...connector,
            health: buildConnectorHealth({
              connector,
              jobs,
            }),
          };
        }),
      );
    },
    async createConnectorForUser(user, input) {
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

      const connectorId = `connector_${randomUUID()}`;

      await database`
        insert into knowledge_connectors (
          id,
          tenant_id,
          group_id,
          created_by_user_id,
          title,
          kind,
          scope,
          status,
          auth_type,
          cadence_minutes,
          created_at,
          updated_at
        )
        values (
          ${connectorId},
          ${user.tenantId},
          ${groupId},
          ${user.id},
          ${title},
          ${input.kind},
          ${input.scope},
          ${"active"},
          ${input.authType},
          ${input.cadenceMinutes},
          now(),
          now()
        )
      `;

      await database`
        insert into knowledge_connector_credentials (
          id,
          tenant_id,
          connector_id,
          auth_type,
          secret_hash,
          status,
          last_validated_at,
          last_rotated_at,
          created_at,
          updated_at
        )
        values (
          ${`cred_${randomUUID()}`},
          ${user.tenantId},
          ${connectorId},
          ${input.authType},
          ${hashSecret(input.authSecret)},
          ${"active"},
          ${input.authType === "none" ? null : new Date().toISOString()},
          ${input.authType === "none" ? null : new Date().toISOString()},
          now(),
          now()
        )
      `;

      const connector = await getConnector(database, user.tenantId, connectorId);

      if (!connector) {
        throw new Error("connector creation did not persist");
      }

      return {
        ok: true,
        data: connector,
      };
    },
    async queueSyncJobForUser(user, connectorId, input) {
      const connector = await getConnector(database, user.tenantId, connectorId);

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

      const jobId = `sync_${randomUUID()}`;
      const createdAt = new Date().toISOString();
      const syncStatus = input.simulateStatus ?? "queued";
      const summary = {
        createdSources: input.summaryOverride?.createdSources ?? (syncStatus === "succeeded" ? 1 : 0),
        updatedSources: input.summaryOverride?.updatedSources ?? 0,
        skippedSources: input.summaryOverride?.skippedSources ?? 0,
        failedSources:
          input.summaryOverride?.failedSources ??
          (syncStatus === "failed" || syncStatus === "partial_failure" ? 1 : 0),
      };
      const externalDocumentId =
        input.externalDocumentId ?? `${connector.kind}:${connectorId}:primary`;
      const checkpointAfter: ConnectorCheckpoint = {
        cursor: input.checkpointCursor ?? connector.checkpoint.cursor,
        updatedAt: input.externalUpdatedAt ?? connector.checkpoint.updatedAt ?? createdAt,
      };

      await database`
        insert into knowledge_connector_sync_jobs (
          id,
          tenant_id,
          connector_id,
          requested_by_user_id,
          status,
          started_at,
          finished_at,
          checkpoint_before_cursor,
          checkpoint_before_updated_at,
          checkpoint_after_cursor,
          checkpoint_after_updated_at,
          summary,
          error,
          created_at
        )
        values (
          ${jobId},
          ${user.tenantId},
          ${connectorId},
          ${input.requestedByUserId ?? user.id},
          ${syncStatus},
          ${syncStatus === "queued" ? null : createdAt},
          ${syncStatus === "queued" || syncStatus === "running" ? null : createdAt},
          ${connector.checkpoint.cursor},
          ${connector.checkpoint.updatedAt},
          ${checkpointAfter.cursor},
          ${checkpointAfter.updatedAt},
          ${summary}::jsonb,
          ${input.simulateError ?? null},
          now()
        )
      `;

      await database`
        update knowledge_connectors
        set checkpoint_cursor = ${checkpointAfter.cursor},
            checkpoint_updated_at = ${checkpointAfter.updatedAt},
            last_synced_at = case
              when ${syncStatus} in ('succeeded', 'partial_failure') then ${createdAt}::timestamptz
              else last_synced_at
            end,
            updated_at = now()
        where tenant_id = ${user.tenantId}
          and id = ${connectorId}
      `;

      const [existing] = await database<{ id: string }[]>`
        select id
        from knowledge_connector_document_provenance
        where tenant_id = ${user.tenantId}
          and connector_id = ${connectorId}
          and external_document_id = ${externalDocumentId}
        limit 1
      `;

      if (!existing) {
        const sourceId = `src_${randomUUID()}`;
        const sourceKind =
          connector.kind === "file_drop" || connector.kind === "google_drive"
            ? "file"
            : "url";
        const sourceUri =
          sourceKind === "url" ? `connector://${connector.kind}/${connectorId}` : null;

        await database`
          insert into knowledge_sources (
            id,
            tenant_id,
            group_id,
            owner_user_id,
            title,
            source_kind,
            source_uri,
            source_content,
            scope,
            labels,
            status,
            chunk_count,
            created_at,
            updated_at
          )
          values (
            ${sourceId},
            ${user.tenantId},
            ${connector.groupId},
            ${user.id},
            ${`${connector.title} source`},
            ${sourceKind},
            ${sourceUri},
            ${`Connector seeded source for ${connector.title}`},
            ${connector.scope},
            ${JSON.stringify([connector.kind, "connector"])}::jsonb,
            ${"queued"},
            0,
            now(),
            now()
          )
        `;

        await database`
          insert into knowledge_connector_document_provenance (
            id,
            tenant_id,
            connector_id,
            knowledge_source_id,
            external_document_id,
            external_updated_at,
            last_sync_job_id,
            last_synced_at,
            created_at,
            updated_at
          )
          values (
            ${`prov_${randomUUID()}`},
            ${user.tenantId},
            ${connectorId},
            ${sourceId},
            ${externalDocumentId},
            ${input.externalUpdatedAt ?? null},
            ${jobId},
            ${syncStatus === "succeeded" || syncStatus === "partial_failure" ? createdAt : null},
            now(),
            now()
          )
        `;
      } else {
        await database`
          update knowledge_connector_document_provenance
          set last_sync_job_id = ${jobId},
              external_updated_at = ${input.externalUpdatedAt ?? null},
              last_synced_at = case
                when ${syncStatus} in ('succeeded', 'partial_failure') then ${createdAt}::timestamptz
                else last_synced_at
              end,
              updated_at = now()
          where id = ${existing.id}
        `;
      }

      const [row] = await database<SyncJobRow[]>`
        select
          id,
          tenant_id,
          connector_id,
          status,
          started_at,
          finished_at,
          requested_by_user_id,
          checkpoint_before_cursor,
          checkpoint_before_updated_at,
          checkpoint_after_cursor,
          checkpoint_after_updated_at,
          summary,
          error,
          created_at
        from knowledge_connector_sync_jobs
        where id = ${jobId}
        limit 1
      `;

      if (!row) {
        throw new Error("connector sync job creation did not persist");
      }

      return {
        ok: true,
        data: toSyncJob(row),
      };
    },
    async listSyncJobsForUser(user, connectorId) {
      const connector = await getConnector(database, user.tenantId, connectorId);

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      const rows = await database<SyncJobRow[]>`
        select
          id,
          tenant_id,
          connector_id,
          status,
          started_at,
          finished_at,
          requested_by_user_id,
          checkpoint_before_cursor,
          checkpoint_before_updated_at,
          checkpoint_after_cursor,
          checkpoint_after_updated_at,
          summary,
          error,
          created_at
        from knowledge_connector_sync_jobs
        where tenant_id = ${user.tenantId}
          and connector_id = ${connectorId}
        order by created_at desc
      `;

      return {
        ok: true,
        data: rows.map(toSyncJob),
      };
    },
    async listProvenanceForUser(user, connectorId) {
      const connector = await getConnector(database, user.tenantId, connectorId);

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      const rows = await database<ProvenanceRow[]>`
        select
          p.id,
          p.tenant_id,
          p.connector_id,
          p.knowledge_source_id,
          p.external_document_id,
          p.external_updated_at,
          p.last_sync_job_id,
          p.last_synced_at,
          p.created_at,
          p.updated_at,
          s.source_kind
        from knowledge_connector_document_provenance p
        join knowledge_sources s on s.id = p.knowledge_source_id
        where p.tenant_id = ${user.tenantId}
          and p.connector_id = ${connectorId}
        order by p.updated_at desc
      `;

      return {
        ok: true,
        data: rows.map(toProvenance),
      };
    },
    async updateCheckpointForUser(user, connectorId, input) {
      const connector = await getConnector(database, user.tenantId, connectorId);

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      await database`
        update knowledge_connectors
        set checkpoint_cursor = ${input.cursor},
            checkpoint_updated_at = ${input.updatedAt ?? new Date().toISOString()},
            updated_at = now()
        where tenant_id = ${user.tenantId}
          and id = ${connectorId}
      `;

      const updated = await getConnector(database, user.tenantId, connectorId);

      if (!updated) {
        throw new Error("connector checkpoint update did not persist");
      }

      return {
        ok: true,
        data: updated,
      };
    },
    async updateConnectorStatusForUser(user, connectorId, input) {
      const connector = await getConnector(database, user.tenantId, connectorId);

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      await database`
        update knowledge_connectors
        set status = ${input.status},
            updated_at = now()
        where tenant_id = ${user.tenantId}
          and id = ${connectorId}
      `;

      await database`
        update knowledge_connector_credentials
        set status = ${input.status},
            updated_at = now()
        where tenant_id = ${user.tenantId}
          and connector_id = ${connectorId}
      `;

      const updated = await getConnector(database, user.tenantId, connectorId);

      if (!updated) {
        throw new Error("connector status update did not persist");
      }

      return {
        ok: true,
        data: updated,
      };
    },
    async rotateConnectorCredentialForUser(user, connectorId, input) {
      const connector = await getConnector(database, user.tenantId, connectorId);

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      const rotatedAt = new Date().toISOString();

      await database`
        update knowledge_connectors
        set status = ${"active"},
            updated_at = now()
        where tenant_id = ${user.tenantId}
          and id = ${connectorId}
      `;

      await database`
        update knowledge_connector_credentials
        set secret_hash = ${hashSecret(input.authSecret)},
            status = ${"active"},
            last_validated_at = ${rotatedAt},
            last_rotated_at = ${rotatedAt},
            updated_at = now()
        where tenant_id = ${user.tenantId}
          and connector_id = ${connectorId}
      `;

      const updated = await getConnector(database, user.tenantId, connectorId);

      if (!updated) {
        throw new Error("connector credential rotation did not persist");
      }

      return {
        ok: true,
        data: updated,
      };
    },
    async deleteConnectorForUser(user, connectorId) {
      const connector = await getConnector(database, user.tenantId, connectorId);

      if (!connector) {
        return {
          ok: false,
          statusCode: 404,
          code: "ADMIN_NOT_FOUND",
          message: "The connector does not exist.",
        };
      }

      await database`
        delete from knowledge_connector_document_provenance
        where tenant_id = ${user.tenantId}
          and connector_id = ${connectorId}
      `;

      await database`
        delete from knowledge_connector_sync_jobs
        where tenant_id = ${user.tenantId}
          and connector_id = ${connectorId}
      `;

      await database`
        delete from knowledge_connector_credentials
        where tenant_id = ${user.tenantId}
          and connector_id = ${connectorId}
      `;

      await database`
        delete from knowledge_connectors
        where tenant_id = ${user.tenantId}
          and id = ${connectorId}
      `;

      return {
        ok: true,
        data: {
          connectorId,
          deleted: true,
        },
      };
    },
  };
}
