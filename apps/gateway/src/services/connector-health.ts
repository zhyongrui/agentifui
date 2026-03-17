import type {
  ConnectorFailureSummary,
  ConnectorHealthIssue,
  ConnectorHealthIssueCode,
  ConnectorRecord,
  ConnectorSyncJob,
} from "@agentifui/shared";

function toMillis(value: string | null) {
  return value ? new Date(value).getTime() : Number.NaN;
}

function buildIssue(input: {
  code: ConnectorHealthIssueCode;
  severity: ConnectorHealthIssue["severity"];
  summary: string;
  detail?: string | null;
  recordedAt: string;
}): ConnectorHealthIssue {
  return {
    code: input.code,
    severity: input.severity,
    summary: input.summary,
    detail: input.detail ?? null,
    recordedAt: input.recordedAt,
  };
}

export function buildConnectorFailureSummary(
  jobs: ConnectorSyncJob[],
): ConnectorFailureSummary {
  const failureJobs = jobs.filter(
    (job) => job.status === "failed" || job.status === "partial_failure",
  );
  const lastFailure = failureJobs[0] ?? null;

  return {
    lastSyncStatus: jobs[0]?.status ?? null,
    lastFailureAt: lastFailure?.finishedAt ?? lastFailure?.createdAt ?? null,
    lastFailureMessage: lastFailure?.error ?? null,
    totalFailures: failureJobs.length,
    hasPartialFailures: failureJobs.some((job) => job.status === "partial_failure"),
  };
}

export function buildConnectorHealth(input: {
  connector: Pick<
    ConnectorRecord,
    "status" | "title" | "cadenceMinutes" | "createdAt" | "lastSyncedAt"
  >;
  jobs: ConnectorSyncJob[];
  now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const issues: ConnectorHealthIssue[] = [];
  const lastJob = input.jobs[0] ?? null;
  const failureSummary = buildConnectorFailureSummary(input.jobs);
  const lastSyncedAtMs = toMillis(input.connector.lastSyncedAt);
  const createdAtMs = toMillis(input.connector.createdAt);
  const nowMs = toMillis(now);
  const staleThresholdMs = Math.max(60, input.connector.cadenceMinutes * 3) * 60_000;

  let staleSince: string | null = null;

  if (input.connector.status === "paused") {
    issues.push(
      buildIssue({
        code: "paused",
        severity: "warning",
        summary: `${input.connector.title} is paused.`,
        detail: "Resume the connector before the next scheduled sync.",
        recordedAt: now,
      }),
    );
  }

  if (input.connector.status === "revoked") {
    issues.push(
      buildIssue({
        code: "revoked",
        severity: "critical",
        summary: `${input.connector.title} credentials are revoked.`,
        detail: "Rotate or reauthorize this connector before syncing again.",
        recordedAt: now,
      }),
    );
  }

  if (lastJob?.status === "failed") {
    issues.push(
      buildIssue({
        code: "sync_failed",
        severity: "critical",
        summary: `${input.connector.title} last sync failed.`,
        detail: lastJob.error,
        recordedAt: lastJob.finishedAt ?? lastJob.createdAt,
      }),
    );
  } else if (lastJob?.status === "partial_failure") {
    issues.push(
      buildIssue({
        code: "sync_partial_failure",
        severity: "warning",
        summary: `${input.connector.title} last sync finished with partial failures.`,
        detail: lastJob.error,
        recordedAt: lastJob.finishedAt ?? lastJob.createdAt,
      }),
    );
  }

  const lastRelevantMs = Number.isFinite(lastSyncedAtMs) ? lastSyncedAtMs : createdAtMs;

  if (
    Number.isFinite(lastRelevantMs) &&
    Number.isFinite(nowMs) &&
    nowMs - lastRelevantMs > staleThresholdMs
  ) {
    staleSince = new Date(lastRelevantMs + staleThresholdMs).toISOString();
    issues.push(
      buildIssue({
        code: "stale_sync",
        severity: input.connector.status === "active" ? "warning" : "critical",
        summary: `${input.connector.title} sync is stale.`,
        detail: `No healthy sync has completed within the expected cadence window (${input.connector.cadenceMinutes} minutes).`,
        recordedAt: now,
      }),
    );
  }

  const severity =
    issues.some((issue) => issue.severity === "critical")
      ? "critical"
      : issues.some((issue) => issue.severity === "warning")
        ? "warning"
        : "healthy";

  return {
    severity,
    issues,
    failureSummary,
    staleSince,
  } satisfies ConnectorRecord["health"];
}
