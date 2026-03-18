import type { DatabaseClient } from '@agentifui/db';
import type { AdminObservabilityAnnotation } from '@agentifui/shared/admin';

import type { AuditService } from './audit-service.js';
import {
  createAdminObservabilityService,
  type AdminObservabilityService,
  type RunCompletionStats,
} from './admin-observability-service.js';
import type { ObservabilityService } from './observability-service.js';
import type { WorkspaceRuntimeService } from './workspace-runtime.js';

type AnnotationRow = {
  created_at: Date | string;
  created_by_user_id: string | null;
  id: string;
  note: string;
  run_id: string | null;
  tenant_id: string | null;
  trace_id: string | null;
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toAnnotation(row: AnnotationRow): AdminObservabilityAnnotation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    traceId: row.trace_id,
    runId: row.run_id,
    note: row.note,
    createdAt: toIso(row.created_at),
    createdByUserId: row.created_by_user_id,
  };
}

async function resolveRunCompletionStats(
  database: DatabaseClient,
  tenantId: string
): Promise<RunCompletionStats> {
  const [row] = await database<Array<{
    failed_count: number;
    stopped_count: number;
    succeeded_count: number;
  }>>`
    select
      count(*) filter (where status = 'succeeded')::int as succeeded_count,
      count(*) filter (where status = 'failed')::int as failed_count,
      count(*) filter (where status = 'stopped')::int as stopped_count
    from runs
    where tenant_id = ${tenantId}
  `;

  return {
    succeededCount: row?.succeeded_count ?? 0,
    failedCount: row?.failed_count ?? 0,
    stoppedCount: row?.stopped_count ?? 0,
  };
}

export function createPersistentAdminObservabilityService(
  database: DatabaseClient,
  input: {
    auditService: AuditService;
    observabilityService: ObservabilityService;
    runtimeService: WorkspaceRuntimeService;
  }
): AdminObservabilityService {
  return createAdminObservabilityService({
    auditService: input.auditService,
    observabilityService: input.observabilityService,
    runtimeService: input.runtimeService,
    resolveRunCompletionStats: tenantId => resolveRunCompletionStats(database, tenantId),
    annotationStore: {
      async listByTenant(tenantId) {
        const rows = await database<AnnotationRow[]>`
          select id, tenant_id, trace_id, run_id, note, created_by_user_id, created_at
          from operator_annotations
          where tenant_id = ${tenantId}
          order by created_at desc
          limit 50
        `;

        return rows.map(toAnnotation);
      },
      async create(annotation) {
        const [row] = await database<AnnotationRow[]>`
          insert into operator_annotations (
            id,
            tenant_id,
            trace_id,
            run_id,
            note,
            created_by_user_id,
            created_at
          )
          values (
            ${annotation.id},
            ${annotation.tenantId},
            ${annotation.traceId},
            ${annotation.runId},
            ${annotation.note},
            ${annotation.createdByUserId},
            ${annotation.createdAt}::timestamptz
          )
          returning id, tenant_id, trace_id, run_id, note, created_by_user_id, created_at
        `;

        if (!row) {
          throw new Error('Operator annotation insert did not return a row.');
        }

        return toAnnotation(row);
      },
    },
  });
}
