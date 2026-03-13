type RouteMetric = {
  method: string;
  route: string;
  statusCode: number;
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

export type ObservabilitySnapshot = {
  startedAt: string;
  uptimeSeconds: number;
  inflightRequests: number;
  totalRequests: number;
  serverErrors: number;
  routes: Array<
    RouteMetric & {
      avgDurationMs: number;
    }
  >;
};

type ObserveRequestInput = {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
};

type NowFunction = () => number;

function toMetricKey(input: Pick<RouteMetric, 'method' | 'route' | 'statusCode'>) {
  return `${input.method} ${input.route} ${input.statusCode}`;
}

function escapePrometheusLabelValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function createObservabilityService(now: NowFunction = () => Date.now()) {
  const startedAtMs = now();
  const startedAt = new Date(startedAtMs).toISOString();
  let inflightRequests = 0;
  let totalRequests = 0;
  let serverErrors = 0;
  const routeMetrics = new Map<string, RouteMetric>();

  function getSnapshot(): ObservabilitySnapshot {
    const routes = Array.from(routeMetrics.values())
      .map(route => ({
        ...route,
        avgDurationMs: route.count > 0 ? route.totalDurationMs / route.count : 0,
      }))
      .sort((left, right) => {
        if (left.route !== right.route) {
          return left.route.localeCompare(right.route);
        }

        if (left.method !== right.method) {
          return left.method.localeCompare(right.method);
        }

        return left.statusCode - right.statusCode;
      });

    return {
      startedAt,
      uptimeSeconds: Math.max(0, Math.round((now() - startedAtMs) / 1000)),
      inflightRequests,
      totalRequests,
      serverErrors,
      routes,
    };
  }

  return {
    onRequestStarted() {
      inflightRequests += 1;
    },
    onRequestCompleted(input: ObserveRequestInput) {
      inflightRequests = Math.max(0, inflightRequests - 1);
      totalRequests += 1;

      if (input.statusCode >= 500) {
        serverErrors += 1;
      }

      const key = toMetricKey(input);
      const existing =
        routeMetrics.get(key) ??
        ({
          method: input.method,
          route: input.route,
          statusCode: input.statusCode,
          count: 0,
          totalDurationMs: 0,
          maxDurationMs: 0,
        } satisfies RouteMetric);

      existing.count += 1;
      existing.totalDurationMs += input.durationMs;
      existing.maxDurationMs = Math.max(existing.maxDurationMs, input.durationMs);

      routeMetrics.set(key, existing);
    },
    onRequestAborted() {
      inflightRequests = Math.max(0, inflightRequests - 1);
    },
    getSnapshot,
    renderPrometheus() {
      const snapshot = getSnapshot();
      const lines = [
        '# HELP agentifui_gateway_uptime_seconds Process uptime in seconds.',
        '# TYPE agentifui_gateway_uptime_seconds gauge',
        `agentifui_gateway_uptime_seconds ${snapshot.uptimeSeconds}`,
        '# HELP agentifui_gateway_inflight_requests Requests currently being processed.',
        '# TYPE agentifui_gateway_inflight_requests gauge',
        `agentifui_gateway_inflight_requests ${snapshot.inflightRequests}`,
        '# HELP agentifui_gateway_requests_total Total completed requests.',
        '# TYPE agentifui_gateway_requests_total counter',
        `agentifui_gateway_requests_total ${snapshot.totalRequests}`,
        '# HELP agentifui_gateway_server_errors_total Total completed 5xx requests.',
        '# TYPE agentifui_gateway_server_errors_total counter',
        `agentifui_gateway_server_errors_total ${snapshot.serverErrors}`,
        '# HELP agentifui_gateway_request_duration_ms_sum Sum of request durations in milliseconds.',
        '# TYPE agentifui_gateway_request_duration_ms_sum counter',
        '# HELP agentifui_gateway_request_duration_ms_max Maximum request duration in milliseconds.',
        '# TYPE agentifui_gateway_request_duration_ms_max gauge',
        '# HELP agentifui_gateway_request_count_by_route_total Completed requests by method, route and status.',
        '# TYPE agentifui_gateway_request_count_by_route_total counter',
      ];

      for (const route of snapshot.routes) {
        const labels = [
          `method="${escapePrometheusLabelValue(route.method)}"`,
          `route="${escapePrometheusLabelValue(route.route)}"`,
          `status_code="${route.statusCode}"`,
        ].join(',');

        lines.push(`agentifui_gateway_request_count_by_route_total{${labels}} ${route.count}`);
        lines.push(
          `agentifui_gateway_request_duration_ms_sum{${labels}} ${route.totalDurationMs.toFixed(3)}`
        );
        lines.push(
          `agentifui_gateway_request_duration_ms_max{${labels}} ${route.maxDurationMs.toFixed(3)}`
        );
      }

      return `${lines.join('\n')}\n`;
    },
  };
}

export type ObservabilityService = ReturnType<typeof createObservabilityService>;
