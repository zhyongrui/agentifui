import type {
  WorkspaceRunFailure,
  WorkspaceRunFailureCode,
  WorkspaceRunFailureStage,
} from "@agentifui/shared/apps";

function isFailureCode(value: unknown): value is WorkspaceRunFailureCode {
  return (
    value === "stream_interrupted" ||
    value === "provider_error" ||
    value === "persistence_error" ||
    value === "validation_error" ||
    value === "quota_exceeded" ||
    value === "runtime_unavailable" ||
    value === "unknown"
  );
}

function isFailureStage(value: unknown): value is WorkspaceRunFailureStage {
  return (
    value === "launch" ||
    value === "input_validation" ||
    value === "execution" ||
    value === "streaming" ||
    value === "persistence"
  );
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
