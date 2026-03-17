export type WorkflowDefinitionNodeType =
  | "prompt"
  | "retrieval"
  | "tool_call"
  | "approval"
  | "transform"
  | "export";

export type WorkflowDefinitionNode = {
  id: string;
  type: WorkflowDefinitionNodeType;
  title: string;
  description?: string | null;
  config: Record<string, unknown>;
};

export type WorkflowDefinitionEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  condition?: string | null;
};

export type WorkflowDefinitionVariable = {
  id: string;
  name: string;
  label: string;
  required: boolean;
  defaultValue?: string | null;
};

export type WorkflowDefinitionApproval = {
  id: string;
  label: string;
  policyTag: string;
  approverRole: string;
};

export type WorkflowDefinitionDocument = {
  nodes: WorkflowDefinitionNode[];
  edges: WorkflowDefinitionEdge[];
  variables: WorkflowDefinitionVariable[];
  approvals: WorkflowDefinitionApproval[];
};

export type WorkflowVersionStatus =
  | "draft"
  | "published"
  | "archived"
  | "rolled_back";

export type WorkflowPermissionRole =
  | "author"
  | "reviewer"
  | "publisher"
  | "runner";

export type WorkflowPermission = {
  id: string;
  userEmail: string;
  role: WorkflowPermissionRole;
  createdAt: string;
};

export type WorkflowDefinitionSummary = {
  id: string;
  tenantId: string;
  slug: string;
  title: string;
  description: string | null;
  currentVersionId: string | null;
  currentVersionStatus: WorkflowVersionStatus | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowDefinitionVersion = {
  id: string;
  workflowId: string;
  versionNumber: number;
  status: WorkflowVersionStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  rolledBackFromVersionId: string | null;
  validationErrors: string[];
  document: WorkflowDefinitionDocument;
};

export type WorkflowValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type WorkflowDryRunResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  planPreview: Array<{
    id: string;
    title: string;
    type: WorkflowDefinitionNodeType;
  }>;
};

export type WorkflowDefinitionListResponse = {
  ok: true;
  data: {
    generatedAt: string;
    workflows: Array<
      WorkflowDefinitionSummary & {
        versions: WorkflowDefinitionVersion[];
        permissions: WorkflowPermission[];
      }
    >;
  };
};

export type WorkflowDefinitionCreateRequest = {
  slug: string;
  title: string;
  description?: string | null;
  document: WorkflowDefinitionDocument;
};

export type WorkflowDefinitionCreateResponse = {
  ok: true;
  data: {
    workflow: WorkflowDefinitionSummary;
    version: WorkflowDefinitionVersion;
  };
};

export type WorkflowDefinitionUpdateRequest = {
  title?: string;
  description?: string | null;
  document?: WorkflowDefinitionDocument;
};

export type WorkflowDefinitionUpdateResponse = {
  ok: true;
  data: {
    workflow: WorkflowDefinitionSummary;
    version: WorkflowDefinitionVersion;
  };
};

export type WorkflowDefinitionPublishRequest = {
  versionId: string;
};

export type WorkflowDefinitionPublishResponse = {
  ok: true;
  data: {
    workflow: WorkflowDefinitionSummary;
    version: WorkflowDefinitionVersion;
  };
};

export type WorkflowDefinitionRollbackRequest = {
  targetVersionId: string;
};

export type WorkflowDefinitionRollbackResponse = {
  ok: true;
  data: {
    workflow: WorkflowDefinitionSummary;
    version: WorkflowDefinitionVersion;
  };
};

export type WorkflowDefinitionPermissionsUpdateRequest = {
  permissions: Array<{
    userEmail: string;
    role: WorkflowPermissionRole;
  }>;
};

export type WorkflowDefinitionPermissionsUpdateResponse = {
  ok: true;
  data: {
    workflowId: string;
    permissions: WorkflowPermission[];
  };
};

export type WorkflowDefinitionDryRunRequest = {
  versionId?: string | null;
  fixtures?: Record<string, string>;
};

export type WorkflowDefinitionDryRunResponse = {
  ok: true;
  data: WorkflowDryRunResult;
};

export type WorkflowDefinitionExportResponse = {
  ok: true;
  data: {
    workflow: WorkflowDefinitionSummary;
    versions: WorkflowDefinitionVersion[];
    permissions: WorkflowPermission[];
  };
};

export type WorkflowDefinitionImportRequest = {
  workflow: WorkflowDefinitionSummary;
  versions: WorkflowDefinitionVersion[];
  permissions: WorkflowPermission[];
};

export type WorkflowDefinitionImportResponse = {
  ok: true;
  data: {
    workflow: WorkflowDefinitionSummary;
    importedVersionCount: number;
  };
};
