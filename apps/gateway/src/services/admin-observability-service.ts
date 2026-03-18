import { randomUUID } from 'node:crypto';

import type {
  AdminIncidentTimelineEntry,
  AdminObservabilityAlert,
  AdminObservabilityAnnotation,
  AdminObservabilityAnnotationCreateRequest,
  AdminObservabilityRouteSummary,
  AdminObservabilitySli,
} from '@agentifui/shared/admin';
import type { AuthAuditEvent, AuthUser } from '@agentifui/shared/auth';

import type { AuditService } from './audit-service.js';
import type {
  ObservabilityService,
  ObservabilitySnapshot,
} from './observability-service.js';
import type { WorkspaceRuntimeService } from './workspace-runtime.js';

type RunCompletionStats = {
  failedCount: number;
  stoppedCount: number;
  succeededCount: number;
};

type AnnotationStore = {
  listByTenant(tenantId: string): Promise<AdminObservabilityAnnotation[]> | AdminObservabilityAnnotation[];
  create(
    input: AdminObservabilityAnnotation
  ): Promise<AdminObservabilityAnnotation> | AdminObservabilityAnnotation;
};

type AdminObservabilityService = {
  createAnnotationForUser(
    user: AuthUser,
    input: AdminObservabilityAnnotationCreateRequest
  ): Promise<AdminObservabilityAnnotation> | AdminObservabilityAnnotation;
  getOverviewForUser(
    user: AuthUser,
    input?: {
      tenantId?: string | null;
    }
  ): Promise<{
    alerts: AdminObservabilityAlert[];
    annotations: AdminObservabilityAnnotation[];
    generatedAt: string;
    incidentTimeline: AdminIncidentTimelineEntry[];
    routes: AdminObservabilityRouteSummary[];
    sli: AdminObservabilitySli[];
  }> | {
    alerts: AdminObservabilityAlert[];
    annotations: AdminObservabilityAnnotation[];
    generatedAt: string;
    incidentTimeline: AdminIncidentTimelineEntry[];
    routes: AdminObservabilityRouteSummary[];
    sli: AdminObservabilitySli[];
  };
};

function averageDuration(
  snapshot: ObservabilitySnapshot,
  matcher: (route: ObservabilitySnapshot['routes'][number]) => boolean
) {
  const matching = snapshot.routes.filter(matcher);

  if (matching.length === 0) {
    return null;
  }

  const count = matching.reduce((total, route) => total + route.count, 0);
  const duration = matching.reduce((total, route) => total + route.avgDurationMs * route.count, 0);

  return count > 0 ? duration / count : null;
}

function classifyLatency(value: number | null, warningMs: number, criticalMs: number) {
  if (value === null) {
    return {
      observed: 'n/a',
      status: 'warning' as const,
    };
  }

  return {
    observed: `${value.toFixed(1)} ms`,
    status:
      value >= criticalMs ? ('critical' as const) : value >= warningMs ? ('warning' as const) : ('healthy' as const),
  };
}

function buildSli(
  snapshot: ObservabilitySnapshot,
  runStats: RunCompletionStats | null
): AdminObservabilitySli[] {
  const authLatency = classifyLatency(
    averageDuration(snapshot, route => route.route.startsWith('/auth/')),
    250,
    600
  );
  const launchLatency = classifyLatency(
    averageDuration(snapshot, route => route.route === '/workspace/apps/launch'),
    750,
    1500
  );
  const chatLatency = classifyLatency(
    averageDuration(snapshot, route => route.route === '/v1/chat/completions'),
    1500,
    3000
  );
  const totalRuns =
    (runStats?.succeededCount ?? 0) + (runStats?.failedCount ?? 0) + (runStats?.stoppedCount ?? 0);
  const successRate = totalRuns > 0 ? ((runStats?.succeededCount ?? 0) / totalRuns) * 100 : null;

  return [
    {
      key: 'auth_latency',
      label: 'Auth latency',
      target: '< 250 ms',
      observed: authLatency.observed,
      status: authLatency.status,
    },
    {
      key: 'launch_latency',
      label: 'Launch latency',
      target: '< 750 ms',
      observed: launchLatency.observed,
      status: launchLatency.status,
    },
    {
      key: 'chat_latency',
      label: 'Chat latency',
      target: '< 1500 ms',
      observed: chatLatency.observed,
      status: chatLatency.status,
    },
    {
      key: 'run_success_rate',
      label: 'Run completion success',
      target: '>= 95%',
      observed: successRate === null ? 'n/a' : `${successRate.toFixed(1)}%`,
      status:
        successRate === null
          ? 'warning'
          : successRate < 90
            ? 'critical'
            : successRate < 95
              ? 'warning'
              : 'healthy',
    },
  ];
}

function buildAlerts(input: {
  runtimeService: WorkspaceRuntimeService;
  sli: AdminObservabilitySli[];
  snapshot: ObservabilitySnapshot;
}): AdminObservabilityAlert[] {
  const runtime = input.runtimeService.getHealthSnapshot();
  const alerts: AdminObservabilityAlert[] = [];

  if (input.snapshot.serverErrors > 0) {
    alerts.push({
      id: 'gateway-5xx',
      severity: 'critical',
      summary: 'Gateway recorded recent 5xx responses.',
      detail: `${input.snapshot.serverErrors} server error responses were observed since process start.`,
      runbookHref: '/docs/guides/P4-G_OBSERVABILITY_OPERATIONS.md#triage-gateway-5xx',
    });
  }

  if (runtime.overallStatus === 'degraded') {
    alerts.push({
      id: 'runtime-degraded',
      severity: 'warning',
      summary: 'One or more runtimes or providers are degraded.',
      detail: 'Review provider routing, circuit-breaker state, and recent degraded selections.',
      runbookHref: '/docs/guides/P4-G_OBSERVABILITY_OPERATIONS.md#runtime-degraded',
    });
  }

  for (const sli of input.sli.filter(item => item.status !== 'healthy')) {
    alerts.push({
      id: `sli-${sli.key}`,
      severity: sli.status === 'critical' ? 'critical' : 'warning',
      summary: `${sli.label} is outside the target.`,
      detail: `${sli.observed} observed against target ${sli.target}.`,
      runbookHref: '/docs/guides/P4-G_OBSERVABILITY_OPERATIONS.md#sli-response',
    });
  }

  return alerts;
}

function buildAuditTimeline(events: AuthAuditEvent[]): AdminIncidentTimelineEntry[] {
  return events
    .filter(
      event =>
        event.level !== 'info' ||
        event.action === 'workspace.policy.blocked' ||
        event.action === 'workspace.policy.flagged' ||
        event.action === 'workspace.run.safety_flagged'
    )
    .map(event => ({
      id: event.id,
      traceId: typeof event.payload.traceId === 'string' ? event.payload.traceId : null,
      runId: typeof event.payload.runId === 'string' ? event.payload.runId : null,
      source: 'audit' as const,
      summary: `${event.action} (${event.level})`,
      occurredAt: event.occurredAt,
    }));
}

function buildRuntimeTimeline(runtimeService: WorkspaceRuntimeService): AdminIncidentTimelineEntry[] {
  const snapshot = runtimeService.getHealthSnapshot();

  if (snapshot.overallStatus !== 'degraded') {
    return [];
  }

  return snapshot.providers
    ?.filter(provider => provider.status === 'degraded' || provider.circuitBreaker.state === 'open')
    .map(provider => ({
      id: `runtime-${provider.id}`,
      traceId: null,
      runId: null,
      source: 'runtime' as const,
      summary: `${provider.label} is ${provider.status} with circuit ${provider.circuitBreaker.state}.`,
      occurredAt: new Date().toISOString(),
    })) ?? [];
}

function sortTimeline(entries: AdminIncidentTimelineEntry[]) {
  return entries
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 25);
}

export function createAdminObservabilityService(input: {
  annotationStore?: AnnotationStore;
  auditService: AuditService;
  observabilityService: ObservabilityService;
  resolveRunCompletionStats?: (
    tenantId: string
  ) => Promise<RunCompletionStats | null> | RunCompletionStats | null;
  runtimeService: WorkspaceRuntimeService;
}): AdminObservabilityService {
  const annotations: AdminObservabilityAnnotation[] = [];
  const annotationStore: AnnotationStore =
    input.annotationStore ??
    ({
      listByTenant(tenantId: string) {
        return annotations.filter(annotation => annotation.tenantId === tenantId);
      },
      create(annotation: AdminObservabilityAnnotation) {
        annotations.unshift(annotation);
        return annotation;
      },
    } satisfies AnnotationStore);

  return {
    async getOverviewForUser(user, request = {}) {
      const tenantId = request.tenantId?.trim() || user.tenantId;
      const [events, runStats, annotationItems] = await Promise.all([
        input.auditService.listEvents({
          tenantId,
          limit: 100,
        }),
        input.resolveRunCompletionStats?.(tenantId) ?? null,
        annotationStore.listByTenant(tenantId),
      ]);
      const snapshot = input.observabilityService.getSnapshot();
      const sli = buildSli(snapshot, runStats);
      const alerts = buildAlerts({
        snapshot,
        sli,
        runtimeService: input.runtimeService,
      });
      const incidentTimeline = sortTimeline([
        ...buildAuditTimeline(events),
        ...buildRuntimeTimeline(input.runtimeService),
        ...annotationItems.map(annotation => ({
          id: annotation.id,
          traceId: annotation.traceId,
          runId: annotation.runId,
          source: 'annotation' as const,
          summary: annotation.note,
          occurredAt: annotation.createdAt,
        })),
      ]);

      return {
        generatedAt: new Date().toISOString(),
        sli,
        routes: snapshot.routes,
        alerts,
        incidentTimeline,
        annotations: annotationItems.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      };
    },
    async createAnnotationForUser(user, body) {
      return annotationStore.create({
        id: `obs_note_${randomUUID()}`,
        tenantId: body.tenantId?.trim() || user.tenantId,
        traceId: body.traceId?.trim() || null,
        runId: body.runId?.trim() || null,
        note: body.note.trim(),
        createdAt: new Date().toISOString(),
        createdByUserId: user.id,
      });
    },
  };
}

export type { AdminObservabilityService, RunCompletionStats };
