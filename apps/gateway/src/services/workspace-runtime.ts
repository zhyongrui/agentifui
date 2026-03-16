import type {
  WorkspaceArtifact,
  WorkspaceCitation,
  WorkspaceConversation,
  WorkspaceConversationAttachment,
  WorkspaceHitlStep,
  WorkspaceRuntimeCapabilities,
  WorkspaceRunRuntime,
  WorkspaceSafetySignal,
  WorkspaceSourceBlock,
} from "@agentifui/shared/apps";
import type { ChatCompletionMessage } from "@agentifui/shared/chat";
import type { KnowledgeRetrievalResult } from "@agentifui/shared";
import { randomUUID } from "node:crypto";

import { resolveWorkspaceAppRuntimeId } from "./workspace-catalog-fixtures.js";
import { buildPlaceholderHitlSteps } from "./workspace-hitl.js";
import { resolveSafetySignals } from "./workspace-safety.js";

export type WorkspaceRuntimeAdapterId =
  | "placeholder"
  | "placeholder_structured";

export type WorkspaceRuntimeAdapterHealth = {
  id: WorkspaceRuntimeAdapterId;
  label: string;
  status: "available" | "degraded";
  capabilities: WorkspaceRuntimeCapabilities;
};

export type WorkspaceRuntimeHealthSnapshot = {
  overallStatus: "available" | "degraded";
  runtimes: WorkspaceRuntimeAdapterHealth[];
};

export type WorkspaceRuntimeInvocationInput = {
  appId: string;
  attachments: WorkspaceConversationAttachment[];
  conversation: WorkspaceConversation;
  latestPrompt: string;
  messages: ChatCompletionMessage[];
  requestedModel: string;
  retrieval: KnowledgeRetrievalResult | null;
  runtimeInput: Record<string, unknown> | null;
};

export type WorkspaceRuntimeInvocationFailure = {
  code: "runtime_unavailable" | "provider_error";
  message: string;
  detail: string | null;
  retryable: boolean;
  runtime: WorkspaceRunRuntime | null;
};

export type WorkspaceRuntimeInvocationOutput = {
  assistantText: string;
  artifacts?: WorkspaceArtifact[];
  citations?: WorkspaceCitation[];
  model?: string;
  pendingActions?: WorkspaceHitlStep[];
  runtime: WorkspaceRunRuntime;
  safetySignals?: WorkspaceSafetySignal[];
  sourceBlocks?: WorkspaceSourceBlock[];
  suggestedPrompts?: string[];
};

export type WorkspaceRuntimeInvocationResult =
  | {
      ok: true;
      data: WorkspaceRuntimeInvocationOutput;
    }
  | {
      ok: false;
      error: WorkspaceRuntimeInvocationFailure;
    };

type WorkspaceRuntimeAdapter = {
  getHealth(): WorkspaceRuntimeAdapterHealth;
  invoke(
    input: WorkspaceRuntimeInvocationInput,
  ): Promise<WorkspaceRuntimeInvocationResult>;
};

export type WorkspaceRuntimeService = {
  getHealthSnapshot(): WorkspaceRuntimeHealthSnapshot;
  invoke(
    input: WorkspaceRuntimeInvocationInput,
  ): Promise<WorkspaceRuntimeInvocationResult>;
};

function extractMessageText(message: ChatCompletionMessage) {
  if (typeof message.content === "string") {
    return message.content.trim();
  }

  return message.content
    .map((part) => {
      if (part.type === "text") {
        return part.text ?? "";
      }

      return `[image:${part.image_url?.url ?? "unknown"}]`;
    })
    .join(" ")
    .trim();
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function normalizeSuggestedPrompts(prompts: string[]) {
  return [
    ...new Set(
      prompts
        .map((prompt) => prompt.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  ].slice(0, 3);
}

function buildSuggestedPrompts(latestPrompt: string) {
  const normalizedPrompt = latestPrompt.replace(/\s+/g, " ").trim();
  const topic =
    normalizedPrompt.length > 0
      ? normalizedPrompt.slice(0, 72)
      : "this workspace task";

  return normalizeSuggestedPrompts([
    `Summarize the key takeaways about "${topic}".`,
    `List the next checks I should run for "${topic}".`,
    `Draft a short stakeholder update about "${topic}".`,
  ]);
}

function truncateArtifactText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function buildArtifactTitle(appName: string, latestPrompt: string) {
  const promptTitle = truncateArtifactText(latestPrompt, 48);
  return promptTitle.length > 0 ? promptTitle : `${appName} response`;
}

function buildSourceLabel(index: number) {
  return `S${index + 1}`;
}

function buildAssistantArtifacts(input: {
  appName: string;
  assistantText: string;
  createdAt: string;
  latestPrompt: string;
}): WorkspaceArtifact[] {
  const content = input.assistantText.trim();

  if (content.length === 0) {
    return [];
  }

  return [
    {
      id: `artifact_${randomUUID()}`,
      title: buildArtifactTitle(input.appName, input.latestPrompt),
      kind: "markdown",
      source: "assistant_response",
      status: "draft",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      summary: truncateArtifactText(content, 120),
      mimeType: "text/markdown",
      sizeBytes: Buffer.byteLength(content, "utf8"),
      content,
    },
  ];
}

function buildAssistantSources(input: {
  attachments: WorkspaceConversationAttachment[];
  conversation: WorkspaceConversation;
  latestPrompt: string;
}) {
  const sourceBlocks: WorkspaceSourceBlock[] = [
    {
      id: `source_${randomUUID()}`,
      kind: "workspace_context",
      title: `${input.conversation.app.name} workspace context`,
      href: null,
      snippet: `Attributed group ${input.conversation.activeGroup.name}. Latest request: ${
        input.latestPrompt || "Continue the current workspace task."
      }`,
      metadata: {
        groupId: input.conversation.activeGroup.id,
        groupName: input.conversation.activeGroup.name,
        traceId: input.conversation.run.traceId,
      },
    },
    {
      id: `source_${randomUUID()}`,
      kind: "app_reference",
      title: `${input.conversation.app.name} app summary`,
      href: null,
      snippet: input.conversation.app.summary,
      metadata: {
        appId: input.conversation.app.id,
        appSlug: input.conversation.app.slug,
        appKind: input.conversation.app.kind,
      },
    },
    ...input.attachments.map((attachment) => ({
      id: `source_${randomUUID()}`,
      kind: "attachment" as const,
      title: attachment.fileName,
      href: null,
      snippet: `${attachment.contentType} · ${attachment.sizeBytes} bytes`,
      metadata: {
        attachmentId: attachment.id,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes.toString(),
      },
    })),
  ];

  return {
    citations: sourceBlocks.map((sourceBlock, index) => ({
      id: `citation_${randomUUID()}`,
      label: buildSourceLabel(index),
      title: sourceBlock.title,
      sourceBlockId: sourceBlock.id,
      href: sourceBlock.href,
      snippet: sourceBlock.snippet,
    })),
    sourceBlocks,
  };
}

function buildPlaceholderAssistantText(
  conversation: WorkspaceConversation,
  messages: ChatCompletionMessage[],
  attachments: WorkspaceConversationAttachment[],
) {
  const latestPrompt = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const requestSummary = latestPrompt ? extractMessageText(latestPrompt) : "";
  const attachmentSummary =
    attachments.length > 0
      ? `Attachments: ${attachments
          .map(
            (file) =>
              `${file.fileName} (${file.contentType}, ${file.sizeBytes} bytes)`,
          )
          .join(", ")}.`
      : null;

  return [
    `${conversation.app.name} is now reachable through the AgentifUI gateway.`,
    `Request: ${requestSummary || "Continue the current workspace task."}`,
    attachmentSummary,
    `Context: attributed group ${conversation.activeGroup.name}, trace ${conversation.run.traceId}.`,
    "This is the Phase 1 protocol response path that R7 wires onto the persisted conversation/run boundary.",
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join("\n\n");
}

function buildStructuredAssistantText(
  conversation: WorkspaceConversation,
  latestPrompt: string,
  retrieval: KnowledgeRetrievalResult | null,
) {
  const requestSummary = latestPrompt || "Continue the current runbook task.";
  const retrievalSummary =
    retrieval && retrieval.matches.length > 0
      ? `Grounding: retrieved ${retrieval.matches.length} knowledge chunk${retrieval.matches.length === 1 ? '' : 's'} for this request.`
      : null;

  return [
    `${conversation.app.name} translated the request into a structured execution outline.`,
    `Request: ${requestSummary}`,
    retrievalSummary,
    `Context: attributed group ${conversation.activeGroup.name}, trace ${conversation.run.traceId}.`,
    "Plan:",
    "1. Confirm prerequisites and owners.",
    "2. Execute the SOP in ordered stages.",
    "3. Record follow-up checks and evidence before handoff.",
  ].join("\n\n");
}

function buildRuntimeMetadata(input: WorkspaceRuntimeAdapterHealth): WorkspaceRunRuntime {
  return {
    id: input.id,
    label: input.label,
    status: input.status,
    capabilities: input.capabilities,
    invokedAt: new Date().toISOString(),
  };
}

function createPlaceholderAdapter(input: {
  id: WorkspaceRuntimeAdapterId;
  label: string;
  status?: WorkspaceRuntimeAdapterHealth["status"];
  structured?: boolean;
}): WorkspaceRuntimeAdapter {
  const health: WorkspaceRuntimeAdapterHealth = {
    id: input.id,
    label: input.label,
    status: input.status ?? "available",
    capabilities: {
      streaming: true,
      citations: true,
      artifacts: true,
      safety: true,
      pendingActions: true,
      files: true,
    },
  };

  return {
    getHealth() {
      return health;
    },
    async invoke(runtimeInput) {
      const latestPrompt = runtimeInput.latestPrompt;
      const assistantText = input.structured
        ? buildStructuredAssistantText(
            runtimeInput.conversation,
            latestPrompt,
            runtimeInput.retrieval,
          )
        : buildPlaceholderAssistantText(
            runtimeInput.conversation,
            runtimeInput.messages,
            runtimeInput.attachments,
          );
      const createdAt = new Date().toISOString();
      const { citations, sourceBlocks } = buildAssistantSources({
        attachments: runtimeInput.attachments,
        conversation: runtimeInput.conversation,
        latestPrompt,
      });
      const safetySignals = resolveSafetySignals({
        latestPrompt,
        recordedAt: createdAt,
        runtimeInput: runtimeInput.runtimeInput,
      });
      const suggestedPrompts = buildSuggestedPrompts(latestPrompt);
      const pendingActions = buildPlaceholderHitlSteps({
        appId: runtimeInput.appId,
        conversationId: runtimeInput.conversation.id,
        createdAt,
        latestPrompt,
        runId: runtimeInput.conversation.run.id,
      });

      return {
        ok: true,
        data: {
          assistantText,
          artifacts: buildAssistantArtifacts({
            appName: runtimeInput.conversation.app.name,
            assistantText,
            createdAt,
            latestPrompt,
          }),
          citations,
          model: runtimeInput.requestedModel,
          pendingActions,
          runtime: buildRuntimeMetadata(health),
          safetySignals,
          sourceBlocks,
          suggestedPrompts,
        },
      };
    },
  };
}

export function createWorkspaceRuntimeService(input: {
  adapters?: Partial<Record<WorkspaceRuntimeAdapterId, WorkspaceRuntimeAdapter>>;
  degradedRuntimeIds?: string[];
  resolveAppRuntimeId?: (appId: string) => WorkspaceRuntimeAdapterId;
} = {}): WorkspaceRuntimeService {
  const degradedRuntimeIds = new Set(input.degradedRuntimeIds ?? []);
  const adapters: Record<WorkspaceRuntimeAdapterId, WorkspaceRuntimeAdapter> = {
    placeholder: createPlaceholderAdapter({
      id: "placeholder",
      label: "Placeholder Runtime",
      status: degradedRuntimeIds.has("placeholder") ? "degraded" : "available",
    }),
    placeholder_structured: createPlaceholderAdapter({
      id: "placeholder_structured",
      label: "Structured Placeholder Runtime",
      status: degradedRuntimeIds.has("placeholder_structured")
        ? "degraded"
        : "available",
      structured: true,
    }),
    ...input.adapters,
  };

  return {
    getHealthSnapshot() {
      const runtimes = Object.values(adapters).map((adapter) =>
        adapter.getHealth(),
      );

      return {
        overallStatus: runtimes.some((runtime) => runtime.status === "degraded")
          ? "degraded"
          : "available",
        runtimes,
      };
    },
    async invoke(runtimeInput) {
      const runtimeId =
        input.resolveAppRuntimeId?.(runtimeInput.appId) ??
        resolveWorkspaceAppRuntimeId(runtimeInput.appId);
      const adapter = adapters[runtimeId];

      if (!adapter) {
        return {
          ok: false,
          error: {
            code: "runtime_unavailable",
            message: `The runtime adapter "${runtimeId}" is not configured.`,
            detail: "Register the adapter before routing this app to it.",
            retryable: false,
            runtime: null,
          },
        };
      }

      const health = adapter.getHealth();

      if (health.status !== "available") {
        return {
          ok: false,
          error: {
            code: "runtime_unavailable",
            message: `${health.label} is currently degraded.`,
            detail: "Wait for the adapter health probe to recover before retrying.",
            retryable: true,
            runtime: buildRuntimeMetadata(health),
          },
        };
      }

      return adapter.invoke(runtimeInput);
    },
  };
}

export function summarizeRuntimePrompt(messages: ChatCompletionMessage[]) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  return latestUserMessage ? extractMessageText(latestUserMessage) : "";
}

export function estimateRuntimePromptTokens(messages: ChatCompletionMessage[]) {
  return messages.reduce(
    (total, message) => total + estimateTokens(extractMessageText(message)),
    0,
  );
}

export function estimateRuntimeCompletionTokens(text: string) {
  return estimateTokens(text);
}
