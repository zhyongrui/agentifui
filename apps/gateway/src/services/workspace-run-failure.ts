import type {
  WorkspaceRunFailure,
  WorkspaceRunFailureCode,
  WorkspaceRunFailureStage,
  WorkspaceRunToolExecutionResult,
  WorkspaceRunToolExecutionStatus,
} from "@agentifui/shared/apps";

function isFailureCode(value: unknown): value is WorkspaceRunFailureCode {
  return (
    value === "stream_interrupted" ||
    value === "provider_error" ||
    value === "persistence_error" ||
    value === "validation_error" ||
    value === "quota_exceeded" ||
    value === "runtime_unavailable" ||
    value === "tool_timeout" ||
    value === "tool_provider_error" ||
    value === "tool_approval_rejected" ||
    value === "tool_approval_cancelled" ||
    value === "tool_approval_expired" ||
    value === "unknown"
  );
}

function isFailureStage(value: unknown): value is WorkspaceRunFailureStage {
  return (
    value === "launch" ||
    value === "input_validation" ||
    value === "execution" ||
    value === "streaming" ||
    value === "tool_execution" ||
    value === "tool_approval" ||
    value === "persistence"
  );
}

type WorkspaceToolFailureReason =
  | "timeout"
  | "provider_error"
  | "approval_rejected"
  | "approval_cancelled"
  | "approval_expired";

function normalizeWorkspaceToolFailureReason(
  value: unknown,
): WorkspaceToolFailureReason | null {
  return value === "timeout" ||
    value === "provider_error" ||
    value === "approval_rejected" ||
    value === "approval_cancelled" ||
    value === "approval_expired"
    ? value
    : null;
}

function readToolRetryability(input: {
  attempt: number;
  maxAttempts: number | null;
  reason: WorkspaceToolFailureReason;
}) {
  if (input.reason === "approval_rejected" || input.reason === "approval_cancelled") {
    return false;
  }

  if (input.reason === "approval_expired") {
    return true;
  }

  if (input.maxAttempts === null) {
    return true;
  }

  return input.attempt < input.maxAttempts;
}

function readToolFailureShape(input: {
  reason: WorkspaceToolFailureReason;
  toolName: string;
}): {
  code: WorkspaceRunFailureCode;
  stage: WorkspaceRunFailureStage;
  message: string;
} {
  switch (input.reason) {
    case "timeout":
      return {
        code: "tool_timeout",
        stage: "tool_execution",
        message: `Tool "${input.toolName}" timed out.`,
      };
    case "provider_error":
      return {
        code: "tool_provider_error",
        stage: "tool_execution",
        message: `Tool "${input.toolName}" failed during execution.`,
      };
    case "approval_rejected":
      return {
        code: "tool_approval_rejected",
        stage: "tool_approval",
        message: `Tool "${input.toolName}" was rejected during approval.`,
      };
    case "approval_cancelled":
      return {
        code: "tool_approval_cancelled",
        stage: "tool_approval",
        message: `Tool "${input.toolName}" approval was cancelled.`,
      };
    case "approval_expired":
      return {
        code: "tool_approval_expired",
        stage: "tool_approval",
        message: `Tool "${input.toolName}" approval expired before execution.`,
      };
  }
}

export function buildWorkspaceRunFailure(input: {
  code: WorkspaceRunFailureCode;
  stage: WorkspaceRunFailureStage;
  message: string;
  retryable: boolean;
  detail?: string | null;
  recordedAt?: string;
}): WorkspaceRunFailure {
  return {
    code: input.code,
    stage: input.stage,
    message: input.message,
    retryable: input.retryable,
    detail: input.detail ?? null,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
}

export function parseWorkspaceRunFailure(
  value: unknown,
  fallback: {
    error: string | null;
    recordedAt?: string | null;
  } = {
    error: null,
  },
): WorkspaceRunFailure | null {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;

    if (
      isFailureCode(record.code) &&
      isFailureStage(record.stage) &&
      typeof record.message === "string" &&
      typeof record.retryable === "boolean" &&
      (record.detail === null || typeof record.detail === "string") &&
      typeof record.recordedAt === "string"
    ) {
      return {
        code: record.code,
        stage: record.stage,
        message: record.message,
        retryable: record.retryable,
        detail: (record.detail as string | null | undefined) ?? null,
        recordedAt: record.recordedAt,
      };
    }
  }

  if (!fallback.error) {
    return null;
  }

  return buildWorkspaceRunFailure({
    code: "unknown",
    stage: "execution",
    message: fallback.error,
    retryable: false,
    recordedAt: fallback.recordedAt ?? undefined,
  });
}

export function buildWorkspaceToolExecutionFailure(input: {
  attempt: number;
  maxAttempts?: number | null;
  metadata?: Record<string, string> | null;
  recordedAt?: string | null;
  result?: WorkspaceRunToolExecutionResult | null;
  status: WorkspaceRunToolExecutionStatus;
  toolName: string;
  value?: unknown;
}): WorkspaceRunFailure | null {
  const explicitFailure = parseWorkspaceRunFailure(input.value, {
    error: null,
  });

  if (explicitFailure) {
    return explicitFailure;
  }

  if (input.status !== "failed") {
    return null;
  }

  const reason = normalizeWorkspaceToolFailureReason(
    input.metadata?.failureReason,
  );
  const maxAttempts =
    typeof input.maxAttempts === "number" && Number.isFinite(input.maxAttempts)
      ? input.maxAttempts
      : typeof input.metadata?.maxAttempts === "string" &&
          Number.isFinite(Number(input.metadata.maxAttempts))
        ? Number(input.metadata.maxAttempts)
        : null;
  const recordedAt =
    input.result?.recordedAt ?? input.recordedAt ?? new Date().toISOString();

  if (reason) {
    const shape = readToolFailureShape({
      reason,
      toolName: input.toolName,
    });

    return buildWorkspaceRunFailure({
      code: shape.code,
      stage: shape.stage,
      message: shape.message,
      retryable: readToolRetryability({
        attempt: input.attempt,
        maxAttempts,
        reason,
      }),
      detail: input.result?.content ?? null,
      recordedAt,
    });
  }

  if (!input.result?.isError) {
    return null;
  }

  return buildWorkspaceRunFailure({
    code: "unknown",
    stage: "tool_execution",
    message: `Tool "${input.toolName}" failed.`,
    retryable: false,
    detail: input.result.content,
    recordedAt,
  });
}
