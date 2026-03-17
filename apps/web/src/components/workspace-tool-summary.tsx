import React from "react";
import type { ChatToolCall } from "@agentifui/shared";
import type { WorkspaceRunToolExecution } from "@agentifui/shared/apps";

type ToolSummaryLocale = "zh-CN" | "en-US" | string;

function readCopy(locale: ToolSummaryLocale) {
  return locale === "zh-CN"
    ? {
        arguments: "参数",
        callId: "调用",
        noArguments: "没有参数",
        attempt: "第",
        attemptSuffix: "次尝试",
        latency: "耗时",
        latencyUnavailable: "无耗时",
        idempotencyKey: "幂等键",
        timeoutBudget: "超时预算",
        maxAttempts: "最大尝试次数",
        failureReason: "失败原因",
        failureCode: "失败代码",
        failureStage: "失败阶段",
        failureMessage: "失败说明",
        failureRetryable: "可重试",
        failureManualFollowUp: "需要人工跟进",
        resultPreview: "结果摘要",
        noResultPreview: "没有结果摘要",
        status: {
          succeeded: "成功",
          failed: "失败",
        },
        failureReasonLabels: {
          timeout: "超时",
          provider_error: "执行错误",
          approval_rejected: "审批拒绝",
          approval_cancelled: "审批取消",
          approval_expired: "审批过期",
        } as Record<string, string>,
      }
    : {
        arguments: "Arguments",
        callId: "Call",
        noArguments: "No arguments",
        attempt: "Attempt ",
        attemptSuffix: "",
        latency: "Latency",
        latencyUnavailable: "latency n/a",
        idempotencyKey: "Idempotency key",
        timeoutBudget: "Timeout budget",
        maxAttempts: "Max attempts",
        failureReason: "Failure reason",
        failureCode: "Failure code",
        failureStage: "Failure stage",
        failureMessage: "Failure message",
        failureRetryable: "retryable",
        failureManualFollowUp: "manual follow-up",
        resultPreview: "Result preview",
        noResultPreview: "No result preview",
        status: {
          succeeded: "Succeeded",
          failed: "Failed",
        },
        failureReasonLabels: {
          timeout: "timeout",
          provider_error: "provider error",
          approval_rejected: "approval rejected",
          approval_cancelled: "approval cancelled",
          approval_expired: "approval expired",
        } as Record<string, string>,
      };
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatScalar(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.length}]`;
  }

  if (typeof value === "object") {
    return "{...}";
  }

  return "";
}

function parseToolArguments(argumentsValue: string) {
  const normalized = argumentsValue.trim();

  if (!normalized) {
    return {
      summary: "",
      detail: "",
    };
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      const entries = Object.entries(parsed).slice(0, 3);

      return {
        summary: entries
          .map(([key, value]) => `${key}: ${formatScalar(value)}`)
          .join(" · "),
        detail: JSON.stringify(parsed, null, 2),
      };
    }

    return {
      summary: truncate(JSON.stringify(parsed), 140),
      detail: JSON.stringify(parsed, null, 2),
    };
  } catch {
    return {
      summary: truncate(normalized.replace(/\s+/g, " "), 140),
      detail: normalized,
    };
  }
}

function buildResultPreview(content: string) {
  const normalized = content
    .replace(/```[\s\S]*?```/g, "[code block]")
    .replace(/\s+/g, " ")
    .trim();

  return truncate(normalized, 200);
}

export function WorkspaceToolCallSummaryList(input: {
  locale: ToolSummaryLocale;
  title?: string;
  toolCalls: ChatToolCall[];
}) {
  const copy = readCopy(input.locale);

  if (input.toolCalls.length === 0) {
    return null;
  }

  return (
    <div className="tool-summary-section">
      {input.title ? (
        <span className="chat-suggested-prompts-label">{input.title}</span>
      ) : null}
      <ul
        aria-label={input.title ?? (input.locale === "zh-CN" ? "工具调用" : "Tool calls")}
        className="tool-summary-list"
      >
        {input.toolCalls.map((toolCall) => {
          const argumentPreview = parseToolArguments(toolCall.function.arguments);

          return (
            <li key={toolCall.id} className="tool-summary-card">
              <div className="tool-summary-header">
                <strong className="tool-summary-title">
                  {toolCall.function.name}
                </strong>
                <span className="tool-summary-badge">
                  {copy.callId}: {toolCall.id}
                </span>
              </div>
              <p className="tool-summary-copy">
                <span className="tool-summary-label">{copy.arguments}: </span>
                {argumentPreview.summary || copy.noArguments}
              </p>
              {argumentPreview.detail ? (
                <pre className="tool-summary-code">{argumentPreview.detail}</pre>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function WorkspaceToolExecutionSummaryList(input: {
  executions: WorkspaceRunToolExecution[];
  locale: ToolSummaryLocale;
  title?: string;
}) {
  const copy = readCopy(input.locale);

  if (input.executions.length === 0) {
    return null;
  }

  return (
    <div className="tool-summary-section">
      {input.title ? (
        <span className="chat-suggested-prompts-label">{input.title}</span>
      ) : null}
      <ul
        aria-label={input.title ?? (input.locale === "zh-CN" ? "工具执行" : "Tool executions")}
        className="tool-summary-list"
      >
        {input.executions.map((execution) => {
          const argumentPreview = parseToolArguments(
            execution.request.function.arguments,
          );
          const resultPreview = execution.result?.content
            ? buildResultPreview(execution.result.content)
            : "";
          const structuredFailure = execution.failure;
          const failureReason = structuredFailure
            ? null
            : execution.metadata?.failureReason &&
                copy.failureReasonLabels[execution.metadata.failureReason]
              ? copy.failureReasonLabels[execution.metadata.failureReason]
              : execution.metadata?.failureReason ?? null;

          return (
            <li key={execution.id} className="tool-summary-card">
              <div className="tool-summary-header">
                <strong className="tool-summary-title">
                  {execution.request.function.name}
                </strong>
                <span
                  className={`tool-summary-badge status-${execution.status}`}
                >
                  {copy.status[execution.status]}
                </span>
              </div>
              <div className="tool-summary-meta">
                <span className="tool-summary-chip">
                  {copy.attempt}
                  {execution.attempt}
                  {copy.attemptSuffix}
                </span>
                <span className="tool-summary-chip">
                  {copy.latency}:{" "}
                  {execution.latencyMs !== null
                    ? `${execution.latencyMs} ms`
                    : copy.latencyUnavailable}
                </span>
                {execution.metadata?.maxAttempts ? (
                  <span className="tool-summary-chip">
                    {copy.maxAttempts}: {execution.metadata.maxAttempts}
                  </span>
                ) : null}
                {execution.metadata?.timeoutMs ? (
                  <span className="tool-summary-chip">
                    {copy.timeoutBudget}: {execution.metadata.timeoutMs} ms
                  </span>
                ) : null}
              </div>
              <p className="tool-summary-copy">
                <span className="tool-summary-label">{copy.arguments}: </span>
                {argumentPreview.summary || copy.noArguments}
              </p>
              {failureReason ? (
                <p className="tool-summary-copy">
                  <span className="tool-summary-label">
                    {copy.failureReason}:{" "}
                  </span>
                  {failureReason}
                </p>
              ) : null}
              {structuredFailure ? (
                <>
                  <p className="tool-summary-copy">
                    <span className="tool-summary-label">
                      {copy.failureCode}:{" "}
                    </span>
                    {structuredFailure.code}
                  </p>
                  <p className="tool-summary-copy">
                    <span className="tool-summary-label">
                      {copy.failureStage}:{" "}
                    </span>
                    {structuredFailure.stage}
                  </p>
                  <p className="tool-summary-copy">
                    <span className="tool-summary-label">
                      {copy.failureMessage}:{" "}
                    </span>
                    {structuredFailure.message}
                  </p>
                  {structuredFailure.detail ? (
                    <p className="tool-summary-copy">{structuredFailure.detail}</p>
                  ) : null}
                  <p className="tool-summary-copy">
                    {structuredFailure.retryable
                      ? copy.failureRetryable
                      : copy.failureManualFollowUp}
                  </p>
                </>
              ) : null}
              {execution.metadata?.idempotencyKey ? (
                <p className="tool-summary-copy">
                  <span className="tool-summary-label">
                    {copy.idempotencyKey}:{" "}
                  </span>
                  {execution.metadata.idempotencyKey}
                </p>
              ) : null}
              <p className="tool-summary-copy">
                <span className="tool-summary-label">
                  {copy.resultPreview}:{" "}
                </span>
                {resultPreview || copy.noResultPreview}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
