import type {
  AdminAccessRequestReviewRequest,
  AdminAccessRequestReviewResponse,
  AdminAppGrantCreateRequest,
  AdminAppGrantCreateResponse,
  AdminAppGrantDeleteResponse,
  AdminAppToolUpdateRequest,
  AdminAppToolUpdateResponse,
  AdminBillingAdjustmentCreateRequest,
  AdminBillingAdjustmentCreateResponse,
  AdminBillingExportFormat,
  AdminBillingExportMetadata,
  AdminBillingPlanUpdateRequest,
  AdminBillingPlanUpdateResponse,
  AdminBillingResponse,
  AdminBreakGlassCreateRequest,
  AdminBreakGlassCreateResponse,
  AdminBreakGlassUpdateRequest,
  AdminBreakGlassUpdateResponse,
  AdminAppsResponse,
  AdminCleanupResponse,
  AdminContextResponse,
  AdminDomainClaimCreateRequest,
  AdminDomainClaimCreateResponse,
  AdminDomainClaimReviewRequest,
  AdminDomainClaimReviewResponse,
  AdminIdentityOverviewResponse,
  AdminObservabilityAnnotationCreateRequest,
  AdminObservabilityAnnotationCreateResponse,
  AdminObservabilityResponse,
  AdminPolicyExceptionCreateRequest,
  AdminPolicyExceptionCreateResponse,
  AdminPolicyExceptionReviewRequest,
  AdminPolicyExceptionReviewResponse,
  AdminPolicyOverviewResponse,
  AdminPolicySimulationRequest,
  AdminPolicySimulationResponse,
  AdminAuditExportFormat,
  AdminAuditEvidenceBundle,
  AdminAuditExportMetadata,
  AdminAuditFilters,
  AdminAuditResponse,
  AdminErrorResponse,
  AdminGroupsResponse,
  AdminTenantCreateRequest,
  AdminTenantCreateResponse,
  AdminTenantStatusUpdateRequest,
  AdminTenantStatusUpdateResponse,
  AdminTenantsResponse,
  AdminTenantGovernanceUpdateRequest,
  AdminTenantGovernanceUpdateResponse,
  AdminUserMfaResetRequest,
  AdminUserMfaResetResponse,
  AdminUsageExportFormat,
  AdminUsageExportMetadata,
  AdminUsageResponse,
  AdminUsersResponse,
  KnowledgeSourceCreateRequest,
  KnowledgeSourceCreateResponse,
  KnowledgeSourceListFilters,
  KnowledgeSourceListResponse,
  KnowledgeSourceStatusUpdateRequest,
  KnowledgeSourceStatusUpdateResponse,
  WorkflowDefinitionCreateRequest,
  WorkflowDefinitionCreateResponse,
  WorkflowDefinitionDryRunRequest,
  WorkflowDefinitionDryRunResponse,
  WorkflowDefinitionExportResponse,
  WorkflowDefinitionImportRequest,
  WorkflowDefinitionImportResponse,
  WorkflowDefinitionListResponse,
  WorkflowDefinitionPermissionsUpdateRequest,
  WorkflowDefinitionPermissionsUpdateResponse,
  WorkflowDefinitionPublishRequest,
  WorkflowDefinitionPublishResponse,
  WorkflowDefinitionRollbackRequest,
  WorkflowDefinitionRollbackResponse,
  WorkflowDefinitionUpdateRequest,
  WorkflowDefinitionUpdateResponse,
} from '@agentifui/shared';
import type {
  ConnectorCreateRequest,
  ConnectorCreateResponse,
  ConnectorCredentialRotateRequest,
  ConnectorCredentialRotateResponse,
  ConnectorDeleteResponse,
  ConnectorHealthResponse,
  ConnectorListResponse,
  ConnectorStatusUpdateRequest,
  ConnectorStatusUpdateResponse,
  ConnectorSyncJobsResponse,
  ConnectorSyncQueueResponse,
  ConnectorUpdateCheckpointRequest,
} from '@agentifui/shared';

const GATEWAY_PROXY_BASE_PATH = '/api/gateway';

export type AdminAuditExportDownload = {
  blob: Blob;
  metadata: AdminAuditExportMetadata;
};

export type AdminAuditEvidenceExportDownload = {
  blob: Blob;
  metadata: AdminAuditExportMetadata;
};

export type AdminUsageExportDownload = {
  blob: Blob;
  metadata: AdminUsageExportMetadata;
};

export type AdminBillingExportDownload = {
  blob: Blob;
  metadata: AdminBillingExportMetadata;
};

async function fetchAdminJson<TSuccess>(
  path: string,
  sessionToken: string,
  options: {
    body?: unknown;
    method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
  } = {}
): Promise<TSuccess | AdminErrorResponse> {
  const response = await fetch(`${GATEWAY_PROXY_BASE_PATH}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  return (await response.json()) as TSuccess | AdminErrorResponse;
}

function buildAdminAuditQuery(filters: AdminAuditFilters = {}) {
  const params = new URLSearchParams();

  if (filters.scope) {
    params.set('scope', filters.scope);
  }

  if (filters.tenantId) {
    params.set('tenantId', filters.tenantId);
  }

  if (filters.action) {
    params.set('action', filters.action);
  }

  if (filters.level) {
    params.set('level', filters.level);
  }

  if (filters.detectorType) {
    params.set('detectorType', filters.detectorType);
  }

  if (filters.actorUserId) {
    params.set('actorUserId', filters.actorUserId);
  }

  if (filters.entityType) {
    params.set('entityType', filters.entityType);
  }

  if (filters.traceId) {
    params.set('traceId', filters.traceId);
  }

  if (filters.runId) {
    params.set('runId', filters.runId);
  }

  if (filters.conversationId) {
    params.set('conversationId', filters.conversationId);
  }

  if (filters.payloadMode) {
    params.set('payloadMode', filters.payloadMode);
  }

  if (filters.occurredAfter) {
    params.set('occurredAfter', filters.occurredAfter);
  }

  if (filters.occurredBefore) {
    params.set('occurredBefore', filters.occurredBefore);
  }

  if (filters.datePreset) {
    params.set('datePreset', filters.datePreset);
  }

  if (typeof filters.limit === 'number') {
    params.set('limit', String(filters.limit));
  }

  const query = params.toString();

  return query ? `?${query}` : '';
}

function readRequiredHeader(headers: Headers, name: string) {
  const value = headers.get(name);

  if (!value) {
    throw new Error(`Missing required admin export header: ${name}`);
  }

  return value;
}

export async function fetchAdminUsers(
  sessionToken: string,
  options: {
    tenantId?: string;
  } = {}
): Promise<AdminUsersResponse | AdminErrorResponse> {
  const searchParams = new URLSearchParams();

  if (options.tenantId) {
    searchParams.set('tenantId', options.tenantId);
  }

  const path = searchParams.size > 0 ? `/admin/users?${searchParams.toString()}` : '/admin/users';

  return fetchAdminJson<AdminUsersResponse>(path, sessionToken);
}

export async function fetchAdminContext(
  sessionToken: string
): Promise<AdminContextResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminContextResponse>('/admin/context', sessionToken);
}

export async function fetchAdminTenants(
  sessionToken: string
): Promise<AdminTenantsResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminTenantsResponse>('/admin/tenants', sessionToken);
}

export async function createAdminTenant(
  sessionToken: string,
  payload: AdminTenantCreateRequest
): Promise<AdminTenantCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminTenantCreateResponse>('/admin/tenants', sessionToken, {
    method: 'POST',
    body: payload,
  });
}

export async function updateAdminTenantStatus(
  sessionToken: string,
  tenantId: string,
  payload: AdminTenantStatusUpdateRequest
): Promise<AdminTenantStatusUpdateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminTenantStatusUpdateResponse>(
    `/admin/tenants/${tenantId}/status`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function fetchAdminGroups(
  sessionToken: string
): Promise<AdminGroupsResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminGroupsResponse>('/admin/groups', sessionToken);
}

export async function fetchAdminApps(
  sessionToken: string
): Promise<AdminAppsResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminAppsResponse>('/admin/apps', sessionToken);
}

export async function fetchAdminSources(
  sessionToken: string,
  filters: KnowledgeSourceListFilters = {}
): Promise<KnowledgeSourceListResponse | AdminErrorResponse> {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set('status', filters.status);
  }

  if (filters.scope) {
    params.set('scope', filters.scope);
  }

  if (filters.groupId) {
    params.set('groupId', filters.groupId);
  }

  if (filters.q) {
    params.set('q', filters.q);
  }

  const query = params.toString();

  return fetchAdminJson<KnowledgeSourceListResponse>(
    `/admin/sources${query ? `?${query}` : ''}`,
    sessionToken
  );
}

export async function createAdminSource(
  sessionToken: string,
  payload: KnowledgeSourceCreateRequest
): Promise<KnowledgeSourceCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<KnowledgeSourceCreateResponse>('/admin/sources', sessionToken, {
    method: 'POST',
    body: payload,
  });
}

export async function updateAdminSourceStatus(
  sessionToken: string,
  sourceId: string,
  payload: KnowledgeSourceStatusUpdateRequest
): Promise<KnowledgeSourceStatusUpdateResponse | AdminErrorResponse> {
  return fetchAdminJson<KnowledgeSourceStatusUpdateResponse>(
    `/admin/sources/${sourceId}/status`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function fetchAdminWorkflows(
  sessionToken: string
): Promise<WorkflowDefinitionListResponse | AdminErrorResponse> {
  return fetchAdminJson<WorkflowDefinitionListResponse>('/admin/workflows', sessionToken);
}

export async function createAdminWorkflow(
  sessionToken: string,
  payload: WorkflowDefinitionCreateRequest
): Promise<WorkflowDefinitionCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<WorkflowDefinitionCreateResponse>('/admin/workflows', sessionToken, {
    method: 'POST',
    body: payload,
  });
}

export async function updateAdminWorkflow(
  sessionToken: string,
  workflowId: string,
  payload: WorkflowDefinitionUpdateRequest
): Promise<WorkflowDefinitionUpdateResponse | AdminErrorResponse> {
  return fetchAdminJson<WorkflowDefinitionUpdateResponse>(
    `/admin/workflows/${workflowId}`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function publishAdminWorkflow(
  sessionToken: string,
  workflowId: string,
  payload: WorkflowDefinitionPublishRequest
): Promise<WorkflowDefinitionPublishResponse | AdminErrorResponse> {
  return fetchAdminJson<WorkflowDefinitionPublishResponse>(
    `/admin/workflows/${workflowId}/publish`,
    sessionToken,
    {
      method: 'POST',
      body: payload,
    }
  );
}

export async function rollbackAdminWorkflow(
  sessionToken: string,
  workflowId: string,
  payload: WorkflowDefinitionRollbackRequest
): Promise<WorkflowDefinitionRollbackResponse | AdminErrorResponse> {
  return fetchAdminJson<WorkflowDefinitionRollbackResponse>(
    `/admin/workflows/${workflowId}/rollback`,
    sessionToken,
    {
      method: 'POST',
      body: payload,
    }
  );
}

export async function updateAdminWorkflowPermissions(
  sessionToken: string,
  workflowId: string,
  payload: WorkflowDefinitionPermissionsUpdateRequest
): Promise<WorkflowDefinitionPermissionsUpdateResponse | AdminErrorResponse> {
  return fetchAdminJson<WorkflowDefinitionPermissionsUpdateResponse>(
    `/admin/workflows/${workflowId}/permissions`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function dryRunAdminWorkflow(
  sessionToken: string,
  workflowId: string,
  payload: WorkflowDefinitionDryRunRequest
): Promise<WorkflowDefinitionDryRunResponse | AdminErrorResponse> {
  return fetchAdminJson<WorkflowDefinitionDryRunResponse>(
    `/admin/workflows/${workflowId}/dry-run`,
    sessionToken,
    {
      method: 'POST',
      body: payload,
    }
  );
}

export async function exportAdminWorkflow(
  sessionToken: string,
  workflowId: string
): Promise<WorkflowDefinitionExportResponse | AdminErrorResponse> {
  return fetchAdminJson<WorkflowDefinitionExportResponse>(
    `/admin/workflows/${workflowId}/export`,
    sessionToken
  );
}

export async function importAdminWorkflow(
  sessionToken: string,
  payload: WorkflowDefinitionImportRequest
): Promise<WorkflowDefinitionImportResponse | AdminErrorResponse> {
  return fetchAdminJson<WorkflowDefinitionImportResponse>('/admin/workflows/import', sessionToken, {
    method: 'POST',
    body: payload,
  });
}

export async function fetchAdminConnectors(
  sessionToken: string
): Promise<ConnectorListResponse | AdminErrorResponse> {
  return fetchAdminJson<ConnectorListResponse>('/admin/connectors', sessionToken);
}

export async function fetchAdminConnectorHealth(
  sessionToken: string
): Promise<ConnectorHealthResponse | AdminErrorResponse> {
  return fetchAdminJson<ConnectorHealthResponse>('/admin/connectors/health', sessionToken);
}

export async function createAdminConnector(
  sessionToken: string,
  payload: ConnectorCreateRequest
): Promise<ConnectorCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<ConnectorCreateResponse>('/admin/connectors', sessionToken, {
    method: 'POST',
    body: payload,
  });
}

export async function queueAdminConnectorSync(
  sessionToken: string,
  connectorId: string,
  payload: {
    checkpointCursor?: string | null;
  }
): Promise<ConnectorSyncQueueResponse | AdminErrorResponse> {
  return fetchAdminJson<ConnectorSyncQueueResponse>(
    `/admin/connectors/${connectorId}/sync-jobs`,
    sessionToken,
    {
      method: 'POST',
      body: payload,
    }
  );
}

export async function fetchAdminConnectorSyncJobs(
  sessionToken: string,
  connectorId: string
): Promise<ConnectorSyncJobsResponse | AdminErrorResponse> {
  return fetchAdminJson<ConnectorSyncJobsResponse>(
    `/admin/connectors/${connectorId}/sync-jobs`,
    sessionToken
  );
}

export async function updateAdminConnectorCheckpoint(
  sessionToken: string,
  connectorId: string,
  payload: ConnectorUpdateCheckpointRequest
): Promise<ConnectorCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<ConnectorCreateResponse>(
    `/admin/connectors/${connectorId}/checkpoint`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function updateAdminConnectorStatus(
  sessionToken: string,
  connectorId: string,
  payload: ConnectorStatusUpdateRequest
): Promise<ConnectorStatusUpdateResponse | AdminErrorResponse> {
  return fetchAdminJson<ConnectorStatusUpdateResponse>(
    `/admin/connectors/${connectorId}/status`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function rotateAdminConnectorCredential(
  sessionToken: string,
  connectorId: string,
  payload: ConnectorCredentialRotateRequest
): Promise<ConnectorCredentialRotateResponse | AdminErrorResponse> {
  return fetchAdminJson<ConnectorCredentialRotateResponse>(
    `/admin/connectors/${connectorId}/credentials`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function deleteAdminConnector(
  sessionToken: string,
  connectorId: string
): Promise<ConnectorDeleteResponse | AdminErrorResponse> {
  return fetchAdminJson<ConnectorDeleteResponse>(
    `/admin/connectors/${connectorId}`,
    sessionToken,
    {
      method: 'DELETE',
    }
  );
}

export async function fetchAdminCleanup(
  sessionToken: string
): Promise<AdminCleanupResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminCleanupResponse>('/admin/cleanup', sessionToken);
}

export async function fetchAdminUsage(
  sessionToken: string
): Promise<AdminUsageResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminUsageResponse>('/admin/usage', sessionToken);
}

export async function fetchAdminBilling(
  sessionToken: string,
  filters: {
    search?: string;
    tenantId?: string;
  } = {}
): Promise<AdminBillingResponse | AdminErrorResponse> {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set('search', filters.search);
  }

  if (filters.tenantId) {
    params.set('tenantId', filters.tenantId);
  }

  return fetchAdminJson<AdminBillingResponse>(
    `/admin/billing${params.size > 0 ? `?${params.toString()}` : ''}`,
    sessionToken
  );
}

export async function fetchAdminAudit(
  sessionToken: string,
  filters: AdminAuditFilters = {}
): Promise<AdminAuditResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminAuditResponse>(
    `/admin/audit${buildAdminAuditQuery(filters)}`,
    sessionToken
  );
}

export async function fetchAdminIdentity(
  sessionToken: string,
  filters: {
    tenantId?: string;
  } = {}
): Promise<AdminIdentityOverviewResponse | AdminErrorResponse> {
  const params = new URLSearchParams();

  if (filters.tenantId) {
    params.set('tenantId', filters.tenantId);
  }

  return fetchAdminJson<AdminIdentityOverviewResponse>(
    `/admin/identity${params.toString() ? `?${params.toString()}` : ''}`,
    sessionToken
  );
}

export async function fetchAdminPolicy(
  sessionToken: string,
  filters: {
    tenantId?: string;
  } = {}
): Promise<AdminPolicyOverviewResponse | AdminErrorResponse> {
  const params = new URLSearchParams();

  if (filters.tenantId) {
    params.set('tenantId', filters.tenantId);
  }

  return fetchAdminJson<AdminPolicyOverviewResponse>(
    `/admin/policy${params.toString() ? `?${params.toString()}` : ''}`,
    sessionToken
  );
}

export async function fetchAdminObservability(
  sessionToken: string,
  filters: {
    tenantId?: string;
  } = {}
): Promise<AdminObservabilityResponse | AdminErrorResponse> {
  const params = new URLSearchParams();

  if (filters.tenantId) {
    params.set('tenantId', filters.tenantId);
  }

  return fetchAdminJson<AdminObservabilityResponse>(
    `/admin/observability${params.toString() ? `?${params.toString()}` : ''}`,
    sessionToken
  );
}

export async function createAdminObservabilityAnnotation(
  sessionToken: string,
  payload: AdminObservabilityAnnotationCreateRequest
): Promise<AdminObservabilityAnnotationCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminObservabilityAnnotationCreateResponse>(
    '/admin/observability/annotations',
    sessionToken,
    {
      method: 'POST',
      body: payload,
    }
  );
}

export async function simulateAdminPolicy(
  sessionToken: string,
  payload: AdminPolicySimulationRequest
): Promise<AdminPolicySimulationResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminPolicySimulationResponse>('/admin/policy/simulations', sessionToken, {
    method: 'POST',
    body: payload,
  });
}

export async function createAdminPolicyException(
  sessionToken: string,
  payload: AdminPolicyExceptionCreateRequest
): Promise<AdminPolicyExceptionCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminPolicyExceptionCreateResponse>('/admin/policy/exceptions', sessionToken, {
    method: 'POST',
    body: payload,
  });
}

export async function reviewAdminPolicyException(
  sessionToken: string,
  exceptionId: string,
  payload: AdminPolicyExceptionReviewRequest
): Promise<AdminPolicyExceptionReviewResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminPolicyExceptionReviewResponse>(
    `/admin/policy/exceptions/${exceptionId}/review`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function createAdminDomainClaim(
  sessionToken: string,
  payload: AdminDomainClaimCreateRequest
): Promise<AdminDomainClaimCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminDomainClaimCreateResponse>('/admin/identity/domain-claims', sessionToken, {
    method: 'POST',
    body: payload,
  });
}

export async function reviewAdminDomainClaim(
  sessionToken: string,
  claimId: string,
  payload: AdminDomainClaimReviewRequest
): Promise<AdminDomainClaimReviewResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminDomainClaimReviewResponse>(
    `/admin/identity/domain-claims/${claimId}/review`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function reviewAdminAccessRequest(
  sessionToken: string,
  requestId: string,
  payload: AdminAccessRequestReviewRequest
): Promise<AdminAccessRequestReviewResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminAccessRequestReviewResponse>(
    `/admin/identity/access-requests/${requestId}/review`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function resetAdminUserMfa(
  sessionToken: string,
  userId: string,
  payload: AdminUserMfaResetRequest = {}
): Promise<AdminUserMfaResetResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminUserMfaResetResponse>(
    `/admin/identity/users/${userId}/mfa/reset`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function createAdminBreakGlassSession(
  sessionToken: string,
  payload: AdminBreakGlassCreateRequest
): Promise<AdminBreakGlassCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminBreakGlassCreateResponse>('/admin/identity/break-glass', sessionToken, {
    method: 'POST',
    body: payload,
  });
}

export async function updateAdminBreakGlassSession(
  sessionToken: string,
  sessionId: string,
  payload: AdminBreakGlassUpdateRequest
): Promise<AdminBreakGlassUpdateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminBreakGlassUpdateResponse>(
    `/admin/identity/break-glass/${sessionId}`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function updateAdminTenantGovernance(
  sessionToken: string,
  payload: AdminTenantGovernanceUpdateRequest
): Promise<AdminTenantGovernanceUpdateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminTenantGovernanceUpdateResponse>(
    '/admin/identity/governance',
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function exportAdminAudit(
  sessionToken: string,
  format: AdminAuditExportFormat,
  filters: AdminAuditFilters = {}
): Promise<AdminAuditExportDownload | AdminErrorResponse> {
  const suffix = buildAdminAuditQuery(filters);
  const separator = suffix ? '&' : '?';
  const response = await fetch(
    `${GATEWAY_PROXY_BASE_PATH}/admin/audit/export${suffix}${separator}format=${format}`,
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      cache: 'no-store',
    }
  );

  const contentType = response.headers.get('content-type') ?? '';

  if (
    contentType.includes('application/json') &&
    !response.headers.get('x-agentifui-export-format')
  ) {
    return (await response.json()) as AdminErrorResponse;
  }

  const blob = await response.blob();

  return {
    blob,
    metadata: {
      format: readRequiredHeader(
        response.headers,
        'x-agentifui-export-format'
      ) as AdminAuditExportFormat,
      filename: readRequiredHeader(response.headers, 'x-agentifui-export-filename'),
      exportedAt: readRequiredHeader(response.headers, 'x-agentifui-exported-at'),
      eventCount: Number.parseInt(
        readRequiredHeader(response.headers, 'x-agentifui-export-count'),
        10
      ),
      appliedFilters: filters,
    },
  };
}

export async function exportAdminAuditEvidenceBundle(
  sessionToken: string,
  filters: AdminAuditFilters = {}
): Promise<AdminAuditEvidenceExportDownload | AdminErrorResponse> {
  const suffix = buildAdminAuditQuery(filters);
  const response = await fetch(
    `${GATEWAY_PROXY_BASE_PATH}/admin/audit/evidence-bundle${suffix}`,
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      cache: 'no-store',
    }
  );

  if (response.headers.get('content-type')?.includes('application/json') && !response.ok) {
    return (await response.json()) as AdminErrorResponse;
  }

  const blob = await response.blob();
  const metadata: AdminAuditExportMetadata = {
    format: 'json',
    filename: readRequiredHeader(response.headers, 'x-agentifui-export-filename'),
    exportedAt: readRequiredHeader(response.headers, 'x-agentifui-exported-at'),
    eventCount: Number.parseInt(readRequiredHeader(response.headers, 'x-agentifui-export-count'), 10),
    appliedFilters: (JSON.parse(await blob.text()) as AdminAuditEvidenceBundle).metadata.appliedFilters,
  };

  return {
    blob,
    metadata,
  };
}

export async function exportAdminUsage(
  sessionToken: string,
  format: AdminUsageExportFormat,
  filters: {
    search?: string;
    tenantId?: string;
  } = {}
): Promise<AdminUsageExportDownload | AdminErrorResponse> {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set('search', filters.search);
  }

  if (filters.tenantId) {
    params.set('tenantId', filters.tenantId);
  }

  params.set('format', format);

  const response = await fetch(`${GATEWAY_PROXY_BASE_PATH}/admin/usage/export?${params.toString()}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
    cache: 'no-store',
  });
  const contentType = response.headers.get('content-type') ?? '';

  if (
    contentType.includes('application/json') &&
    !response.headers.get('x-agentifui-export-format')
  ) {
    return (await response.json()) as AdminErrorResponse;
  }

  const blob = await response.blob();

  return {
    blob,
    metadata: {
      format: readRequiredHeader(
        response.headers,
        'x-agentifui-export-format'
      ) as AdminUsageExportFormat,
      filename: readRequiredHeader(response.headers, 'x-agentifui-export-filename'),
      exportedAt: readRequiredHeader(response.headers, 'x-agentifui-exported-at'),
      tenantCount: Number.parseInt(
        readRequiredHeader(response.headers, 'x-agentifui-export-count'),
        10
      ),
    },
  };
}

export async function updateAdminBillingPlan(
  sessionToken: string,
  tenantId: string,
  payload: AdminBillingPlanUpdateRequest
): Promise<AdminBillingPlanUpdateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminBillingPlanUpdateResponse>(
    `/admin/billing/tenants/${tenantId}/plan`,
    sessionToken,
    {
      method: 'PUT',
      body: payload,
    }
  );
}

export async function createAdminBillingAdjustment(
  sessionToken: string,
  tenantId: string,
  payload: AdminBillingAdjustmentCreateRequest
): Promise<AdminBillingAdjustmentCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminBillingAdjustmentCreateResponse>(
    `/admin/billing/tenants/${tenantId}/adjustments`,
    sessionToken,
    {
      method: 'POST',
      body: payload,
    }
  );
}

export async function exportAdminBilling(
  sessionToken: string,
  format: AdminBillingExportFormat,
  filters: {
    search?: string;
    tenantId?: string;
  } = {}
): Promise<AdminBillingExportDownload | AdminErrorResponse> {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set('search', filters.search);
  }

  if (filters.tenantId) {
    params.set('tenantId', filters.tenantId);
  }

  params.set('format', format);

  const response = await fetch(
    `${GATEWAY_PROXY_BASE_PATH}/admin/billing/export?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      cache: 'no-store',
    }
  );
  const contentType = response.headers.get('content-type') ?? '';

  if (
    contentType.includes('application/json') &&
    !response.headers.get('x-agentifui-export-format')
  ) {
    return (await response.json()) as AdminErrorResponse;
  }

  const blob = await response.blob();

  return {
    blob,
    metadata: {
      format: readRequiredHeader(
        response.headers,
        'x-agentifui-export-format'
      ) as AdminBillingExportFormat,
      filename: readRequiredHeader(response.headers, 'x-agentifui-export-filename'),
      exportedAt: readRequiredHeader(response.headers, 'x-agentifui-exported-at'),
      tenantCount: Number.parseInt(
        readRequiredHeader(response.headers, 'x-agentifui-export-count'),
        10
      ),
    },
  };
}

export async function createAdminAppGrant(
  sessionToken: string,
  appId: string,
  payload: AdminAppGrantCreateRequest
): Promise<AdminAppGrantCreateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminAppGrantCreateResponse>(`/admin/apps/${appId}/grants`, sessionToken, {
    method: 'POST',
    body: payload,
  });
}

export async function revokeAdminAppGrant(
  sessionToken: string,
  appId: string,
  grantId: string
): Promise<AdminAppGrantDeleteResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminAppGrantDeleteResponse>(
    `/admin/apps/${appId}/grants/${grantId}`,
    sessionToken,
    {
      method: 'DELETE',
    }
  );
}

export async function updateAdminAppTools(
  sessionToken: string,
  appId: string,
  payload: AdminAppToolUpdateRequest
): Promise<AdminAppToolUpdateResponse | AdminErrorResponse> {
  return fetchAdminJson<AdminAppToolUpdateResponse>(`/admin/apps/${appId}/tools`, sessionToken, {
    method: 'PUT',
    body: payload,
  });
}
