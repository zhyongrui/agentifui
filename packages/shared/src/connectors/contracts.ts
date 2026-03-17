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

export type ConnectorHealthSeverity = "healthy" | "warning" | "critical";

export type ConnectorHealthIssueCode =
  | "stale_sync"
  | "paused"
  | "revoked"
  | "sync_failed"
  | "sync_partial_failure";

export type ConnectorHealthIssue = {
  code: ConnectorHealthIssueCode;
  severity: ConnectorHealthSeverity;
  summary: string;
  detail: string | null;
  recordedAt: string;
};

export type ConnectorFailureSummary = {
  lastSyncStatus: ConnectorSyncStatus | null;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
  totalFailures: number;
  hasPartialFailures: boolean;
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
  health: {
    severity: ConnectorHealthSeverity;
    issues: ConnectorHealthIssue[];
    failureSummary: ConnectorFailureSummary;
    staleSince: string | null;
  };
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

export type ConnectorStatusUpdateRequest = {
  status: ConnectorStatus;
  reason?: string | null;
};

export type ConnectorCredentialRotateRequest = {
  authSecret: string;
  note?: string | null;
};

export type ConnectorUpdateCheckpointRequest = {
  cursor: string | null;
  updatedAt: string | null;
};

export type ConnectorQueueSyncRequest = {
  requestedByUserId?: string | null;
  checkpointCursor?: string | null;
  resumeFromJobId?: string | null;
  simulateStatus?: ConnectorSyncStatus;
  simulateError?: string | null;
  externalDocumentId?: string | null;
  externalUpdatedAt?: string | null;
  summaryOverride?: Partial<ConnectorSyncJob["summary"]>;
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

export type ConnectorStatusUpdateResponse = {
  ok: true;
  data: ConnectorRecord;
};

export type ConnectorCredentialRotateResponse = {
  ok: true;
  data: ConnectorRecord;
};

export type ConnectorDeleteResponse = {
  ok: true;
  data: {
    connectorId: string;
    deleted: true;
  };
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

export type ConnectorHealthResponse = {
  ok: true;
  data: {
    generatedAt: string;
    connectors: ConnectorRecord[];
    counts: Record<ConnectorHealthIssueCode, number>;
  };
};
