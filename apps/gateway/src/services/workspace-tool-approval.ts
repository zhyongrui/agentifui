import type {
  WorkspaceApprovalHitlStep,
  WorkspaceConversationMessage,
  WorkspaceHitlStep,
  WorkspaceRunToolExecution,
} from "@agentifui/shared/apps";
import type { ChatToolCall } from "@agentifui/shared";
import { randomUUID } from "node:crypto";

const TOOL_APPROVAL_KIND = "tool_approval";

type ToolApprovalMetadata = {
  kind: typeof TOOL_APPROVAL_KIND;
  toolCallId: string;
  toolName: string;
  toolArguments: string;
  policyTag: string | null;
};

type LegacyToolResultRecord = {
  id: string;
  attempt: number;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
  recordedAt: string;
};

function buildConversationMessageId() {
  return `msg_${randomUUID()}`;
}

function parseToolApprovalMetadata(step: WorkspaceHitlStep): ToolApprovalMetadata | null {
  const metadata = step.metadata;

  if (!metadata || metadata.kind !== TOOL_APPROVAL_KIND) {
    return null;
  }

  const toolCallId = metadata.toolCallId?.trim();
  const toolName = metadata.toolName?.trim();
  const toolArguments = metadata.toolArguments;

  if (!toolCallId || !toolName || typeof toolArguments !== "string") {
    return null;
  }

  return {
    kind: TOOL_APPROVAL_KIND,
    toolCallId,
    toolName,
    toolArguments,
    policyTag: metadata.policyTag?.trim() || null,
  };
}

function formatActorLabel(step: WorkspaceHitlStep) {
  const response = step.response;

  if (!response) {
    return "Unknown reviewer";
  }

  return response.actorDisplayName?.trim() || response.actorUserId;
}

function formatArgumentsPreview(argumentsValue: string) {
  try {
    return JSON.stringify(JSON.parse(argumentsValue), null, 2);
  } catch {
    return argumentsValue;
  }
}

function buildOutcomeLabel(step: WorkspaceHitlStep) {
  switch (step.response?.action) {
    case "approve":
      return {
        summary: "was approved",
        detail: "executed after approval",
        isError: false,
      };
    case "reject":
      return {
        summary: "was rejected",
        detail: "was not executed because approval was rejected",
        isError: true,
      };
    case "cancel":
      return {
        summary: "was cancelled",
        detail: "was not executed because the approval request was cancelled",
        isError: true,
      };
    default:
      return null;
  }
}

function readExistingLegacyToolResults(outputs: Record<string, unknown>) {
  if (!Array.isArray(outputs.toolResults)) {
    return [];
  }

  return outputs.toolResults.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const record = entry as Record<string, unknown>;

    if (
      typeof record.toolCallId !== "string" ||
      typeof record.toolName !== "string" ||
      typeof record.content !== "string"
    ) {
      return [];
    }

    return [
      {
        id:
          typeof record.id === "string" ? record.id : `tool_result_${randomUUID()}`,
        attempt:
          typeof record.attempt === "number" && Number.isFinite(record.attempt)
            ? record.attempt
            : 1,
        startedAt:
          typeof record.startedAt === "string"
            ? record.startedAt
            : typeof record.recordedAt === "string"
              ? record.recordedAt
              : new Date().toISOString(),
        finishedAt:
          typeof record.finishedAt === "string"
            ? record.finishedAt
            : typeof record.recordedAt === "string"
              ? record.recordedAt
              : new Date().toISOString(),
        latencyMs:
          typeof record.latencyMs === "number" && Number.isFinite(record.latencyMs)
            ? record.latencyMs
            : 0,
        toolCallId: record.toolCallId,
        toolName: record.toolName,
        content: record.content,
        isError: Boolean(record.isError),
        recordedAt:
          typeof record.recordedAt === "string"
            ? record.recordedAt
            : typeof record.finishedAt === "string"
              ? record.finishedAt
              : new Date().toISOString(),
      } satisfies LegacyToolResultRecord,
    ];
  });
}

export function buildWorkspaceToolApprovalStep(input: {
  conversationId: string;
  createdAt: string;
  policyTag?: string | null;
  runId: string;
  toolCall: ChatToolCall;
}): WorkspaceApprovalHitlStep {
  const expiresAt = new Date(
    Date.parse(input.createdAt) + 24 * 60 * 60 * 1000,
  ).toISOString();
  const toolName = input.toolCall.function.name.trim();

  return {
    id: `hitl_${randomUUID()}`,
    kind: "approval",
    status: "pending",
    title: `Approve ${toolName}`,
    description: `A human approval is required before ${toolName} can execute.`,
    conversationId: input.conversationId,
    runId: input.runId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    expiresAt,
    approveLabel: "Approve tool",
    rejectLabel: "Reject tool",
    metadata: {
      kind: TOOL_APPROVAL_KIND,
      toolCallId: input.toolCall.id,
      toolName,
      toolArguments: input.toolCall.function.arguments,
      ...(input.policyTag?.trim() ? { policyTag: input.policyTag.trim() } : {}),
    },
  };
}

export function buildWorkspaceToolApprovalResolution(input: {
  appName: string;
  attempt: number;
  outputs: Record<string, unknown>;
  step: WorkspaceHitlStep;
}):
  | {
      assistantMessage: WorkspaceConversationMessage;
      nextOutputs: Record<string, unknown>;
      nextToolExecutions: WorkspaceRunToolExecution[];
      toolMessage: WorkspaceConversationMessage;
    }
  | null {
  const metadata = parseToolApprovalMetadata(input.step);
  const outcome = buildOutcomeLabel(input.step);
  const response = input.step.response;

  if (!metadata || !outcome || !response) {
    return null;
  }

  const request: ChatToolCall = {
    id: metadata.toolCallId,
    type: "function",
    function: {
      name: metadata.toolName,
      arguments: metadata.toolArguments,
    },
  };
  const recordedAt = input.step.updatedAt;
  const policyTagLine = metadata.policyTag
    ? `Policy tag: ${metadata.policyTag}.`
    : null;
  const noteLine = response.note ? `Reviewer note: ${response.note}` : null;
  const content = [
    `Tool \`${metadata.toolName}\` ${outcome.detail}.`,
    `Reviewed by ${formatActorLabel(input.step)}.`,
    policyTagLine,
    "Arguments:",
    "```json",
    formatArgumentsPreview(metadata.toolArguments),
    "```",
    noteLine,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join("\n");
  const resultRecord: LegacyToolResultRecord = {
    id: `tool_result_${randomUUID()}`,
    attempt: input.attempt,
    startedAt: recordedAt,
    finishedAt: recordedAt,
    latencyMs: 0,
    toolCallId: metadata.toolCallId,
    toolName: metadata.toolName,
    content,
    isError: outcome.isError,
    recordedAt,
  };
  const nextToolExecutions: WorkspaceRunToolExecution[] = [
    ...readExistingToolResultsFromOutputs(input.outputs),
  ];

  const toolExecution: WorkspaceRunToolExecution = {
    id: `tool_exec_${randomUUID()}`,
    attempt: input.attempt,
    status: outcome.isError ? "failed" : "succeeded",
    startedAt: recordedAt,
    finishedAt: recordedAt,
    latencyMs: 0,
    request,
    result: {
      content,
      isError: outcome.isError,
      recordedAt,
    },
  };

  const existingToolExecutions = Array.isArray(input.outputs.toolExecutions)
    ? (input.outputs.toolExecutions as WorkspaceRunToolExecution[])
    : [];
  const legacyToolResults = readExistingLegacyToolResults(input.outputs);
  const assistantContent = outcome.isError
    ? `${input.appName} recorded that ${metadata.toolName} ${outcome.summary} and will not execute it.`
    : `${input.appName} completed ${metadata.toolName} after approval.`;
  const nextOutputs: Record<string, unknown> = {
    ...input.outputs,
    assistant: {
      ...(typeof input.outputs.assistant === "object" &&
      input.outputs.assistant !== null &&
      !Array.isArray(input.outputs.assistant)
        ? (input.outputs.assistant as Record<string, unknown>)
        : {}),
      content: assistantContent,
      status: "completed",
    },
    toolExecutions: [...existingToolExecutions, toolExecution],
    toolResults: [...legacyToolResults, resultRecord],
  };

  return {
    assistantMessage: {
      id: buildConversationMessageId(),
      role: "assistant",
      content: assistantContent,
      status: "completed",
      createdAt: recordedAt,
    },
    nextOutputs,
    nextToolExecutions: [...nextToolExecutions, toolExecution],
    toolMessage: {
      id: buildConversationMessageId(),
      role: "tool",
      content,
      status: outcome.isError ? "failed" : "completed",
      createdAt: recordedAt,
      toolCallId: metadata.toolCallId,
      toolName: metadata.toolName,
    },
  };
}

function readExistingToolResultsFromOutputs(
  outputs: Record<string, unknown>,
): WorkspaceRunToolExecution[] {
  if (!Array.isArray(outputs.toolExecutions)) {
    return [];
  }

  return outputs.toolExecutions.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const execution = entry as WorkspaceRunToolExecution;
    return execution.request ? [execution] : [];
  });
}
