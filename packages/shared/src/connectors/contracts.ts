import type { KnowledgeSourceKind, KnowledgeSourceScope } from "../knowledge/contracts.js";

export type ConnectorKind =
  | "web"
  | "google_drive"
  | "notion"
  | "confluence"
  | "file_drop";

export type ConnectorAuthType = "none" | "oauth" | "token" | "service_account";

export type ConnectorStatus = "active" | "paused" | "revoked";

export type ConnectorSyncStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial_failure"
  | "cancelled"
  | "failed";

export type ConnectorCredentialState = {
  authType: ConnectorAuthType;
  status: ConnectorStatus;
  lastValidatedAt: string | null;
  lastRotatedAt: string | null;
};

export type ConnectorCheckpoint = {
  cursor: string | null;
  updatedAt: string | null;
};

export type ConnectorRecord = {
  id: string;
  tenantId: string;
  title: string;
  kind: ConnectorKind;
  scope: KnowledgeSourceScope;
  groupId: string | null;
  status: ConnectorStatus;
  auth: ConnectorCredentialState;
  cadenceMinutes: number;
  lastSyncedAt: string | null;
  checkpoint: ConnectorCheckpoint;
  createdAt: string;
  updatedAt: string;
};

export type ConnectorDocumentProvenance = {
  id: string;
  tenantId: string;
  connectorId: string;
  knowledgeSourceId: string;
  sourceKind: KnowledgeSourceKind;
  externalDocumentId: string;
  externalUpdatedAt: string | null;
  lastSyncJobId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConnectorSyncJob = {
  id: string;
  tenantId: string;
  connectorId: string;
  status: ConnectorSyncStatus;
  startedAt: string | null;
  finishedAt: string | null;
  requestedByUserId: string | null;
  checkpointBefore: ConnectorCheckpoint;
  checkpointAfter: ConnectorCheckpoint;
  summary: {
    createdSources: number;
    updatedSources: number;
    skippedSources: number;
    failedSources: number;
  };
  error: string | null;
  createdAt: string;
};

export type ConnectorCreateRequest = {
  title: string;
  kind: ConnectorKind;
  scope: KnowledgeSourceScope;
  groupId: string | null;
  cadenceMinutes: number;
  authType: ConnectorAuthType;
  authSecret: string | null;
};

export type ConnectorUpdateCheckpointRequest = {
  cursor: string | null;
  updatedAt: string | null;
};

export type ConnectorQueueSyncRequest = {
  requestedByUserId?: string | null;
  checkpointCursor?: string | null;
};

export type ConnectorListResponse = {
  ok: true;
  data: {
    generatedAt: string;
    connectors: ConnectorRecord[];
  };
};

export type ConnectorCreateResponse = {
  ok: true;
  data: ConnectorRecord;
};

export type ConnectorSyncQueueResponse = {
  ok: true;
  data: ConnectorSyncJob;
};

export type ConnectorSyncJobsResponse = {
  ok: true;
  data: {
    connectorId: string;
    jobs: ConnectorSyncJob[];
  };
};

export type ConnectorProvenanceResponse = {
  ok: true;
  data: {
    connectorId: string;
    provenance: ConnectorDocumentProvenance[];
  };
};
