"use client";

import {
  getQuotaSeverity,
  listQuotaAlerts,
  WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES,
  WORKSPACE_ATTACHMENT_MAX_BYTES,
} from "@agentifui/shared/apps";
import type {
  QuotaServiceState,
  QuotaUsage,
  WorkspaceConversation,
  WorkspaceConversationAttachment,
  WorkspaceConversationMessage,
  WorkspaceMessageFeedbackRating,
  WorkspaceRun,
  WorkspaceRunSummary,
  WorkspaceRunTimelineEvent,
} from "@agentifui/shared/apps";
import type {
  ChatCompletionMessage,
  ChatGatewayErrorResponse,
} from "@agentifui/shared/chat";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { MainSectionNav } from "../../../../components/main-section-nav";
import { ChatMarkdown } from "../../../../components/chat-markdown";
import { ConversationSharePanel } from "../../../../components/conversation-share-panel";
import {
  fetchWorkspaceCatalog,
  fetchWorkspaceConversation,
  fetchWorkspaceConversationRuns,
  fetchWorkspaceRun,
  updateWorkspaceConversation,
  updateWorkspaceConversationMessageFeedback,
  uploadWorkspaceConversationFile,
} from "../../../../lib/apps-client";
import { clearAuthSession } from "../../../../lib/auth-session";
import {
  stopChatCompletion,
  streamChatCompletion,
} from "../../../../lib/chat-client";
import { useProtectedSession } from "../../../../lib/use-protected-session";

function toGatewayMessages(
  messages: WorkspaceConversationMessage[],
): ChatCompletionMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function toGatewayFileReferences(
  attachments: WorkspaceConversationAttachment[],
) {
  return attachments.map((attachment) => ({
    type: "local" as const,
    file_id: attachment.id,
    transfer_method: "local_file" as const,
  }));
}

function isGatewayErrorResponse(
  error: unknown,
): error is ChatGatewayErrorResponse {
  return (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof (error as { error?: unknown }).error === "object"
  );
}

function buildLocalMessage(
  input: Pick<WorkspaceConversationMessage, "role" | "content" | "status"> & {
    attachments?: WorkspaceConversationAttachment[];
  },
): WorkspaceConversationMessage {
  return {
    id: `local_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    role: input.role,
    content: input.content,
    status: input.status,
    createdAt: new Date().toISOString(),
    attachments: input.attachments,
  };
}

function formatReplayContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => {
      if (typeof part !== "object" || part === null) {
        return [];
      }

      const value = part as Record<string, unknown>;
      return value.type === "text" && typeof value.text === "string"
        ? [value.text]
        : [];
    })
    .join("\n");
}

function formatAttachmentSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.ceil(sizeBytes / 1024)} KB`;
  }

  return `${sizeBytes} B`;
}

function attachmentsToText(attachments: WorkspaceConversationAttachment[]) {
  return attachments.map(
    (attachment) =>
      `${attachment.fileName} (${attachment.contentType}, ${formatAttachmentSize(attachment.sizeBytes)})`,
  );
}

function describeFeedbackRating(rating: WorkspaceMessageFeedbackRating) {
  return rating === "positive" ? "helpful" : "needs work";
}

function quoteMessageContent(content: string) {
  return content
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function buildReplayMessages(
  run: WorkspaceRun,
): Array<{ id: string; role: string; content: string }> {
  const rawMessages = run.inputs.messages;

  if (!Array.isArray(rawMessages)) {
    return [];
  }

  return rawMessages.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const message = entry as Record<string, unknown>;

    if (typeof message.role !== "string") {
      return [];
    }

    return [
      {
        id: `${run.id}_${index}`,
        role: message.role,
        content: formatReplayContent(message.content),
      },
    ];
  });
}

function buildAssistantReplay(run: WorkspaceRun): string {
  const assistant = run.outputs.assistant;

  if (typeof assistant !== "object" || assistant === null) {
    return "";
  }

  const content = (assistant as Record<string, unknown>).content;

  return typeof content === "string" ? content : "";
}

function buildReplayAttachments(
  run: WorkspaceRun,
): WorkspaceConversationAttachment[] {
  const rawAttachments = run.inputs.attachments;

  if (!Array.isArray(rawAttachments)) {
    return [];
  }

  return rawAttachments.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const attachment = entry as Record<string, unknown>;

    if (
      typeof attachment.id !== "string" ||
      typeof attachment.fileName !== "string" ||
      typeof attachment.contentType !== "string" ||
      typeof attachment.sizeBytes !== "number" ||
      typeof attachment.uploadedAt !== "string"
    ) {
      return [];
    }

    return [
      {
        id: attachment.id,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        uploadedAt: attachment.uploadedAt,
      },
    ];
  });
}

const RUN_TIMELINE_EVENT_LABELS: Record<
  WorkspaceRunTimelineEvent["type"],
  string
> = {
  run_created: "Run created",
  input_recorded: "Inputs recorded",
  run_started: "Run started",
  stop_requested: "Stop requested",
  output_recorded: "Outputs recorded",
  run_succeeded: "Run succeeded",
  run_failed: "Run failed",
  run_stopped: "Run stopped",
};

function describeTimelineEvent(event: WorkspaceRunTimelineEvent) {
  if (event.type === "input_recorded" || event.type === "output_recorded") {
    const keys = Array.isArray(event.metadata.keys)
      ? event.metadata.keys.filter(
          (value): value is string => typeof value === "string",
        )
      : [];

    return keys.length > 0 ? keys.join(", ") : "payload stored";
  }

  if (event.type === "stop_requested") {
    return typeof event.metadata.stopType === "string"
      ? event.metadata.stopType
      : "manual";
  }

  if (event.type === "run_failed" && typeof event.metadata.error === "string") {
    return event.metadata.error;
  }

  return typeof event.metadata.traceId === "string"
    ? `trace ${event.metadata.traceId}`
    : "";
}

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const { session, isLoading } = useProtectedSession("/chat");
  const [conversation, setConversation] =
    useState<WorkspaceConversation | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(
    null,
  );
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [messages, setMessages] = useState<WorkspaceConversationMessage[]>([]);
  const [runs, setRuns] = useState<WorkspaceRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<WorkspaceRun | null>(null);
  const [quotaUsages, setQuotaUsages] = useState<QuotaUsage[]>([]);
  const [quotaServiceState, setQuotaServiceState] =
    useState<QuotaServiceState>("available");
  const [draft, setDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<
    WorkspaceConversationAttachment[]
  >([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [isAwaitingRunMetadata, setIsAwaitingRunMetadata] = useState(false);
  const [activeFeedbackMessageId, setActiveFeedbackMessageId] = useState<
    string | null
  >(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [lastTraceId, setLastTraceId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [conversationActionError, setConversationActionError] = useState<
    string | null
  >(null);
  const [activeConversationAction, setActiveConversationAction] = useState<
    "archive" | "delete" | "pin" | "rename" | "restore" | "unpin" | null
  >(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const copiedMessageResetRef = useRef<number | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);
  const conversationId =
    typeof params?.conversationId === "string"
      ? params.conversationId.trim()
      : "";

  async function loadRunDetail(sessionToken: string, runId: string) {
    const result = await fetchWorkspaceRun(sessionToken, runId);

    if (!result.ok) {
      setSelectedRun(null);
      return;
    }

    setSelectedRun(result.data);
  }

  async function loadRunTracking(
    sessionToken: string,
    preferredRunId?: string | null,
  ) {
    const result = await fetchWorkspaceConversationRuns(
      sessionToken,
      conversationId,
    );

    if (!result.ok) {
      setRuns([]);
      setSelectedRun(null);
      return;
    }

    setRuns(result.data.runs);

    const nextRunId =
      preferredRunId ?? selectedRun?.id ?? result.data.runs[0]?.id ?? null;

    if (!nextRunId) {
      setSelectedRun(null);
      return;
    }

    await loadRunDetail(sessionToken, nextRunId);
  }

  async function loadConversation(
    sessionToken: string,
    options: {
      withSpinner: boolean;
      syncMessages: boolean;
      preferredRunId?: string | null;
    },
  ) {
    if (options.withSpinner) {
      setIsConversationLoading(true);
    }

    setConversationError(null);

    try {
      const result = await fetchWorkspaceConversation(
        sessionToken,
        conversationId,
      );

      if (!result.ok) {
        setConversation(null);

        if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
          clearAuthSession(window.sessionStorage);
          router.replace("/login");
          return;
        }

        if (result.error.code === "WORKSPACE_FORBIDDEN") {
          router.replace("/auth/pending");
          return;
        }

        if (result.error.code === "WORKSPACE_NOT_FOUND") {
          setConversationError(
            "The requested workspace conversation could not be found.",
          );
          return;
        }

        setConversationError(result.error.message);
        return;
      }

      const catalogResult = await fetchWorkspaceCatalog(sessionToken);

      if (catalogResult.ok) {
        setQuotaServiceState(catalogResult.data.quotaServiceState);
        setQuotaUsages(
          catalogResult.data.quotaUsagesByGroupId[result.data.activeGroup.id] ??
            catalogResult.data.quotaUsagesByGroupId[
              catalogResult.data.defaultActiveGroupId
            ] ??
            [],
        );
      } else {
        setQuotaServiceState("available");
        setQuotaUsages([]);
      }

      setConversation(result.data);
      setTitleDraft(result.data.title);
      setLastTraceId(result.data.run.traceId);
      activeRunIdRef.current = result.data.run.id;

      if (options.syncMessages) {
        setMessages(result.data.messages);
      }

      await loadRunTracking(
        sessionToken,
        options.preferredRunId ?? result.data.run.id,
      );
    } catch {
      setConversation(null);
      setConversationError(
        "Conversation bootstrap failed. Please retry from the apps workspace.",
      );
    } finally {
      if (options.withSpinner) {
        setIsConversationLoading(false);
      }
    }
  }

  useEffect(() => {
    setMessages([]);
    setRuns([]);
    setSelectedRun(null);
    setQuotaUsages([]);
    setQuotaServiceState("available");
    setDraft("");
    setDraftAttachments([]);
    setComposerError(null);
    setLastTraceId(null);
    setTitleDraft("");
    setConversationActionError(null);
    setActiveConversationAction(null);
    setActiveFeedbackMessageId(null);
    setCopiedMessageId(null);
    activeAssistantMessageIdRef.current = null;
    activeRunIdRef.current = null;
    stopRequestedRef.current = false;
    setIsUploadingAttachments(false);
    setIsAwaitingRunMetadata(false);
  }, [conversationId]);

  useEffect(() => {
    return () => {
      if (copiedMessageResetRef.current) {
        window.clearTimeout(copiedMessageResetRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!session || !conversationId) {
      setConversation(null);
      setConversationError(
        conversationId ? null : "Conversation id is missing.",
      );
      return;
    }

    let isCancelled = false;

    setIsConversationLoading(true);
    setConversationError(null);

    loadConversation(session.sessionToken, {
      withSpinner: false,
      syncMessages: true,
    })
      .catch(() => {
        if (!isCancelled) {
          setConversation(null);
          setConversationError(
            "Conversation bootstrap failed. Please retry from the apps workspace.",
          );
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsConversationLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [conversationId, router, session]);

  async function handleConversationUpdateAction(
    action: "archive" | "delete" | "pin" | "rename" | "restore" | "unpin",
    input: {
      pinned?: boolean;
      status?: WorkspaceConversation["status"];
      title?: string;
    },
  ) {
    if (!session || !conversation) {
      return;
    }

    setConversationActionError(null);
    setActiveConversationAction(action);

    try {
      const result = await updateWorkspaceConversation(
        session.sessionToken,
        conversation.id,
        input,
      );

      if (!result.ok) {
        if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
          clearAuthSession(window.sessionStorage);
          router.replace("/login");
          return;
        }

        if (result.error.code === "WORKSPACE_NOT_FOUND") {
          router.replace("/chat");
          return;
        }

        setConversationActionError(result.error.message);
        return;
      }

      if (result.data.status === "deleted") {
        router.replace("/chat?deleted=1");
        return;
      }

      setConversation(result.data);
      setMessages(result.data.messages);
      setTitleDraft(result.data.title);
    } catch {
      setConversationActionError(
        "The conversation update could not be saved. Please retry.",
      );
    } finally {
      setActiveConversationAction(null);
    }
  }

  function isConversationActionPending(
    action?: "archive" | "delete" | "pin" | "rename" | "restore" | "unpin",
  ) {
    return action
      ? activeConversationAction === action
      : activeConversationAction !== null;
  }

  async function handleAttachmentSelect(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (
      !session ||
      !conversation ||
      conversation.status === "archived" ||
      selectedFiles.length === 0
    ) {
      return;
    }

    setComposerError(null);
    setIsUploadingAttachments(true);

    try {
      const uploadedAttachments: WorkspaceConversationAttachment[] = [];

      for (const file of selectedFiles) {
        const contentType = file.type.trim().toLowerCase();

        if (
          !contentType ||
          !(
            WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES as readonly string[]
          ).includes(contentType)
        ) {
          setComposerError(`Unsupported attachment type: ${file.name}.`);
          continue;
        }

        if (file.size > WORKSPACE_ATTACHMENT_MAX_BYTES) {
          setComposerError(
            `${file.name} exceeds the ${formatAttachmentSize(WORKSPACE_ATTACHMENT_MAX_BYTES)} limit.`,
          );
          continue;
        }

        const result = await uploadWorkspaceConversationFile(
          session.sessionToken,
          conversation.id,
          {
            fileName: file.name,
            contentType,
            base64Data: await fileToBase64(file),
          },
        );

        if (!result.ok) {
          if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
            clearAuthSession(window.sessionStorage);
            router.replace("/login");
            return;
          }

          if (result.error.code === "WORKSPACE_FORBIDDEN") {
            router.replace("/auth/pending");
            return;
          }

          if (result.error.code === "WORKSPACE_NOT_FOUND") {
            setConversationError(
              "This conversation is no longer available. Return to the apps workspace and relaunch it.",
            );
            return;
          }

          setComposerError(result.error.message);
          continue;
        }

        uploadedAttachments.push(result.data);
      }

      if (uploadedAttachments.length > 0) {
        setDraftAttachments((currentAttachments) => [
          ...currentAttachments,
          ...uploadedAttachments,
        ]);
      }
    } catch {
      setComposerError("The attachment upload failed. Please retry.");
    } finally {
      setIsUploadingAttachments(false);
    }
  }

  function handleAttachmentRemove(attachmentId: string) {
    setDraftAttachments((currentAttachments) =>
      currentAttachments.filter((attachment) => attachment.id !== attachmentId),
    );
  }

  async function runConversationStream(input: {
    requestMessages: WorkspaceConversationMessage[];
    optimisticMessages: WorkspaceConversationMessage[];
    latestUserAttachments: WorkspaceConversationAttachment[];
    failureMessages: WorkspaceConversationMessage[];
  }) {
    if (!session || !conversation) {
      return;
    }

    const assistantMessage =
      input.optimisticMessages[input.optimisticMessages.length - 1];

    if (!assistantMessage || assistantMessage.role !== "assistant") {
      return;
    }

    activeAssistantMessageIdRef.current = assistantMessage.id;
    activeRunIdRef.current = null;
    stopRequestedRef.current = false;
    setComposerError(null);
    setIsStreaming(true);
    setIsStopping(false);
    setIsAwaitingRunMetadata(true);
    setMessages(input.optimisticMessages);
    setConversation((currentConversation) =>
      currentConversation
        ? {
            ...currentConversation,
            run: {
              ...currentConversation.run,
              status: "running",
            },
          }
        : currentConversation,
    );

    try {
      await streamChatCompletion(
        session.sessionToken,
        {
          app_id: conversation.app.id,
          conversation_id: conversation.id,
          messages: toGatewayMessages(input.requestMessages),
          files: toGatewayFileReferences(input.latestUserAttachments),
        },
        {
          onMetadata: (metadata) => {
            setLastTraceId(metadata.traceId);
            activeRunIdRef.current = metadata.runId;
            setIsAwaitingRunMetadata(false);
            setConversation((currentConversation) =>
              currentConversation
                ? {
                    ...currentConversation,
                    run: {
                      ...currentConversation.run,
                      id: metadata.runId,
                      traceId: metadata.traceId,
                      status: "running",
                      triggeredFrom: "chat_completion",
                    },
                  }
                : currentConversation,
            );
          },
          onChunk: (chunk) => {
            activeRunIdRef.current = chunk.id;
            setIsAwaitingRunMetadata(false);

            if (chunk.trace_id) {
              setLastTraceId(chunk.trace_id);
            }

            const delta = chunk.choices[0]?.delta;
            const finishReason = chunk.choices[0]?.finish_reason;
            const suggestedPrompts = chunk.suggested_prompts;

            if (
              delta?.content ||
              finishReason ||
              (suggestedPrompts && suggestedPrompts.length > 0)
            ) {
              setMessages((currentMessages) =>
                currentMessages.map((message) =>
                  message.id === activeAssistantMessageIdRef.current
                    ? {
                        ...message,
                        content: delta?.content
                          ? `${message.content}${delta.content}`
                          : message.content,
                        suggestedPrompts:
                          suggestedPrompts && suggestedPrompts.length > 0
                            ? suggestedPrompts
                            : message.suggestedPrompts,
                        status: finishReason
                          ? stopRequestedRef.current
                            ? "stopped"
                            : "completed"
                          : delta?.content
                            ? "streaming"
                            : message.status,
                      }
                    : message,
                ),
              );
            }
          },
        },
        {
          activeGroupId: conversation.activeGroup.id,
        },
      );

      await loadConversation(session.sessionToken, {
        withSpinner: false,
        syncMessages: true,
        preferredRunId: activeRunIdRef.current,
      });
    } catch (error) {
      if (isGatewayErrorResponse(error)) {
        if (error.error.code === "invalid_token") {
          clearAuthSession(window.sessionStorage);
          router.replace("/login");
          return;
        }

        if (error.error.code === "conversation_not_found") {
          setConversationError(
            "This conversation is no longer available. Return to the apps workspace and relaunch it.",
          );
          return;
        }

        setComposerError(error.error.message);
      } else {
        setComposerError("The chat gateway stream failed. Please retry.");
      }

      setMessages(input.failureMessages);
      setConversation((currentConversation) =>
        currentConversation
          ? {
              ...currentConversation,
              run: {
                ...currentConversation.run,
                id: activeRunIdRef.current ?? currentConversation.run.id,
                status: "failed",
              },
            }
          : currentConversation,
      );
    } finally {
      activeAssistantMessageIdRef.current = null;
      stopRequestedRef.current = false;
      setIsStreaming(false);
      setIsStopping(false);
      setIsAwaitingRunMetadata(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextDraft = draft.trim();
    const nextAttachments = draftAttachments;

    if (
      !session ||
      !conversation ||
      conversation.status === "archived" ||
      isStreaming ||
      isUploadingAttachments ||
      (nextDraft.length === 0 && nextAttachments.length === 0)
    ) {
      return;
    }

    const messageContent =
      nextDraft.length > 0
        ? nextDraft
        : `Attached ${nextAttachments.length} file${nextAttachments.length === 1 ? "" : "s"}.`;
    const userMessage = buildLocalMessage({
      role: "user",
      content: messageContent,
      status: "completed",
      attachments: nextAttachments,
    });
    const assistantMessage = buildLocalMessage({
      role: "assistant",
      content: "",
      status: "streaming",
    });
    const nextMessages = [...messages, userMessage];

    setDraft("");
    setDraftAttachments([]);
    await runConversationStream({
      requestMessages: nextMessages,
      optimisticMessages: [...nextMessages, assistantMessage],
      latestUserAttachments: nextAttachments,
      failureMessages: messages,
    });
  }

  async function handleStop() {
    if (!session || !conversation || !isStreaming || isStopping) {
      return;
    }

    const runId = activeRunIdRef.current;

    if (!runId) {
      setComposerError(
        "The active run is still initializing. Retry stop in a moment.",
      );
      return;
    }

    setComposerError(null);
    setIsStopping(true);
    stopRequestedRef.current = true;

    try {
      const result = await stopChatCompletion(session.sessionToken, runId);

      if ("error" in result) {
        setComposerError(result.error.message);
        stopRequestedRef.current = false;
      }
    } catch {
      setComposerError("The stop request failed. Please retry.");
      stopRequestedRef.current = false;
    } finally {
      setIsStopping(false);
    }
  }

  async function handleRunSelect(runId: string) {
    if (!session) {
      return;
    }

    await loadRunDetail(session.sessionToken, runId);
  }

  async function handleCopyMessage(messageId: string, content: string) {
    if (!content.trim()) {
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setComposerError("Clipboard access is unavailable in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);

      if (copiedMessageResetRef.current) {
        window.clearTimeout(copiedMessageResetRef.current);
      }

      copiedMessageResetRef.current = window.setTimeout(() => {
        setCopiedMessageId((currentMessageId) =>
          currentMessageId === messageId ? null : currentMessageId,
        );
        copiedMessageResetRef.current = null;
      }, 1500);
    } catch {
      setComposerError("Copying message content failed. Please retry.");
    }
  }

  function handleQuoteMessage(message: WorkspaceConversationMessage) {
    if (!message.content.trim()) {
      return;
    }

    const quotedMessage = quoteMessageContent(message.content);

    setDraft((currentDraft) =>
      currentDraft.trim().length > 0
        ? `${currentDraft.trim()}\n\n${quotedMessage}`
        : `${quotedMessage}\n\n`,
    );
    setComposerError(null);
    composerInputRef.current?.focus();
  }

  function handleSuggestedPrompt(prompt: string) {
    setDraft(prompt);
    setComposerError(null);
    composerInputRef.current?.focus();
  }

  function handleRetryMessage(message: WorkspaceConversationMessage) {
    if (message.role !== "user") {
      return;
    }

    setDraft(message.content);
    setDraftAttachments(message.attachments ?? []);
    setComposerError(null);
    composerInputRef.current?.focus();
  }

  async function handleRegenerateMessage(messageId: string) {
    if (!conversation || isStreaming || isUploadingAttachments) {
      return;
    }

    const assistantIndex = messages.findIndex(
      (message) =>
        message.id === messageId &&
        message.role === "assistant" &&
        message.status === "completed",
    );

    if (assistantIndex < 0 || assistantIndex !== messages.length - 1) {
      setComposerError(
        "Only the latest completed assistant reply can be regenerated right now.",
      );
      return;
    }

    const requestMessages = messages.slice(0, assistantIndex);
    const latestUserMessage = [...requestMessages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserMessage) {
      setComposerError("No user message is available to regenerate.");
      return;
    }

    const assistantMessage = buildLocalMessage({
      role: "assistant",
      content: "",
      status: "streaming",
    });

    await runConversationStream({
      requestMessages,
      optimisticMessages: [...requestMessages, assistantMessage],
      latestUserAttachments: latestUserMessage.attachments ?? [],
      failureMessages: messages,
    });
  }

  function setMessageFeedback(
    messageId: string,
    feedback: WorkspaceConversationMessage["feedback"] | null,
  ) {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId ? { ...message, feedback } : message,
      ),
    );
    setConversation((currentConversation) =>
      currentConversation
        ? {
            ...currentConversation,
            updatedAt: new Date().toISOString(),
            messages: currentConversation.messages.map((message) =>
              message.id === messageId ? { ...message, feedback } : message,
            ),
          }
        : currentConversation,
    );
  }

  async function handleFeedback(
    messageId: string,
    rating: WorkspaceMessageFeedbackRating,
  ) {
    if (!session || !conversation) {
      return;
    }

    const message = messages.find((entry) => entry.id === messageId);

    if (
      !message ||
      message.role !== "assistant" ||
      message.status !== "completed"
    ) {
      return;
    }

    const nextRating = message.feedback?.rating === rating ? null : rating;
    const previousFeedback = message.feedback ?? null;

    setComposerError(null);
    setActiveFeedbackMessageId(messageId);
    setMessageFeedback(
      messageId,
      nextRating
        ? {
            rating: nextRating,
            updatedAt: new Date().toISOString(),
          }
        : null,
    );

    try {
      const result = await updateWorkspaceConversationMessageFeedback(
        session.sessionToken,
        conversation.id,
        messageId,
        {
          rating: nextRating,
        },
      );

      if (!result.ok) {
        setMessageFeedback(messageId, previousFeedback);

        if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
          clearAuthSession(window.sessionStorage);
          router.replace("/login");
          return;
        }

        if (result.error.code === "WORKSPACE_FORBIDDEN") {
          router.replace("/auth/pending");
          return;
        }

        if (result.error.code === "WORKSPACE_NOT_FOUND") {
          setConversationError(
            "This conversation is no longer available. Return to the apps workspace and relaunch it.",
          );
          return;
        }

        setComposerError(result.error.message);
        return;
      }

      setMessageFeedback(messageId, result.data.message.feedback ?? null);
    } catch {
      setMessageFeedback(messageId, previousFeedback);
      setComposerError("Saving message feedback failed. Please retry.");
    } finally {
      setActiveFeedbackMessageId((currentMessageId) =>
        currentMessageId === messageId ? null : currentMessageId,
      );
    }
  }

  if (isLoading) {
    return <p className="lead">Checking your session...</p>;
  }

  if (isConversationLoading) {
    return <p className="lead">Loading conversation surface...</p>;
  }

  if (conversationError) {
    return (
      <div className="stack">
        <MainSectionNav showSecurity />
        <div className="notice error">{conversationError}</div>
        <div className="actions">
          <Link className="secondary" href="/apps">
            Back to Apps workspace
          </Link>
        </div>
      </div>
    );
  }

  if (!session || !conversation) {
    return null;
  }

  const replayMessages = selectedRun ? buildReplayMessages(selectedRun) : [];
  const replayAssistant = selectedRun ? buildAssistantReplay(selectedRun) : "";
  const replayAttachments = selectedRun
    ? buildReplayAttachments(selectedRun)
    : [];
  const quotaAlerts = listQuotaAlerts(quotaUsages);
  const isConversationArchived = conversation.status === "archived";

  return (
    <div className="chat-surface stack">
      <MainSectionNav showSecurity />

      <header className="chat-header">
        <div>
          <span className="eyebrow">P2-A5</span>
          <h1>{conversation.title}</h1>
          <p className="lead">
            Rename, pin, archive, and delete conversation records without
            breaking the persisted run and transcript boundary.
          </p>
        </div>
        <div className="workspace-badges">
          <span className="workspace-badge">
            Conversation {conversation.id}
          </span>
          <span className="workspace-badge">Status {conversation.status}</span>
          {conversation.pinned ? (
            <span className="workspace-badge">Pinned</span>
          ) : null}
          <span className="workspace-badge">Run {conversation.run.id}</span>
          <span className="workspace-badge">
            Trace {lastTraceId ?? conversation.run.traceId}
          </span>
        </div>
      </header>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Gateway context</h2>
            <p>
              The latest conversation snapshot still comes from workspace state,
              and each completion now lands in its own queryable run record.
            </p>
          </div>
          <span className={`status-chip status-${conversation.app.status}`}>
            {conversation.app.status}
          </span>
        </div>

        <div className="chat-meta-grid">
          <article className="chat-meta-card">
            <span>App</span>
            <strong>{conversation.app.name}</strong>
            <p>{conversation.app.summary}</p>
          </article>
          <article className="chat-meta-card">
            <span>Attributed group</span>
            <strong>{conversation.activeGroup.name}</strong>
            <p>{conversation.activeGroup.description}</p>
          </article>
          <article className="chat-meta-card">
            <span>Conversation state</span>
            <strong>{conversation.status}</strong>
            <p>{conversation.pinned ? "Pinned in history." : "Not pinned in history."}</p>
          </article>
          <article className="chat-meta-card">
            <span>Run status</span>
            <strong>{conversation.run.status}</strong>
            <p>
              Type: {conversation.run.type} · Trigger:{" "}
              {conversation.run.triggeredFrom}
            </p>
          </article>
          <article className="chat-meta-card">
            <span>Transcript</span>
            <strong>{messages.length} messages</strong>
            <p>
              History is rehydrated from the workspace conversation response.
            </p>
          </article>
          <article className="chat-meta-card">
            <span>Run history</span>
            <strong>{runs.length} runs</strong>
            <p>Each completion is now tracked separately for replay.</p>
          </article>
        </div>

        <div className="conversation-management-panel">
          <label className="field" htmlFor="conversation-title">
            Conversation title
          </label>
          <input
            id="conversation-title"
            className="chat-composer-input"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            disabled={isConversationActionPending()}
          />
          {conversationActionError ? (
            <div className="notice error">{conversationActionError}</div>
          ) : null}
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={
                isConversationActionPending() || titleDraft.trim().length === 0
              }
              onClick={() =>
                void handleConversationUpdateAction("rename", {
                  title: titleDraft.trim(),
                })
              }
            >
              {isConversationActionPending("rename") ? "Saving..." : "Save title"}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={isConversationActionPending()}
              onClick={() =>
                void handleConversationUpdateAction(
                  conversation.pinned ? "unpin" : "pin",
                  {
                    pinned: !conversation.pinned,
                  },
                )
              }
            >
              {isConversationActionPending(conversation.pinned ? "unpin" : "pin")
                ? "Saving..."
                : conversation.pinned
                  ? "Unpin"
                  : "Pin"}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={isConversationActionPending()}
              onClick={() =>
                void handleConversationUpdateAction(
                  conversation.status === "archived" ? "restore" : "archive",
                  {
                    status:
                      conversation.status === "archived" ? "active" : "archived",
                  },
                )
              }
            >
              {isConversationActionPending(
                conversation.status === "archived" ? "restore" : "archive",
              )
                ? "Saving..."
                : conversation.status === "archived"
                  ? "Restore"
                  : "Archive"}
            </button>
            <button
              className="secondary danger"
              type="button"
              disabled={isConversationActionPending()}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${conversation.title}" from workspace history? This hides the conversation and its runs from normal workspace reads.`,
                  )
                ) {
                  void handleConversationUpdateAction("delete", {
                    status: "deleted",
                  });
                }
              }}
            >
              {isConversationActionPending("delete") ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </section>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Quota context</h2>
            <p>
              Workspace quota cards now come from persisted quota state plus
              recorded launch and run usage, instead of static fixture data.
            </p>
          </div>
        </div>

        {quotaServiceState === "degraded" ? (
          <div className="notice warning">
            Workspace quota is temporarily degraded. New launches may be blocked
            until the service recovers.
          </div>
        ) : null}

        <div className="quota-grid">
          {quotaUsages.map((usage) => (
            <article
              className={`quota-card quota-${getQuotaSeverity(usage)}`}
              key={usage.scope}
            >
              <div className="quota-card-header">
                <span>{usage.scopeLabel}</span>
                <strong>
                  {usage.used} / {usage.limit}
                </strong>
              </div>
              <div className="quota-progress">
                <div
                  className="quota-progress-bar"
                  style={{
                    width: `${Math.min(100, usage.limit > 0 ? (usage.used / usage.limit) * 100 : 100)}%`,
                  }}
                />
              </div>
              <div className="quota-card-meta">
                <span>{usage.scope}</span>
                <span>{usage.limit - usage.used} credits left</span>
              </div>
            </article>
          ))}
        </div>

        {quotaAlerts.length > 0 ? (
          <div className="notice warning">
            {quotaAlerts
              .map((alert) => `${alert.scopeLabel} is near capacity.`)
              .join(" ")}
          </div>
        ) : null}
      </section>

      <ConversationSharePanel
        activeGroupId={conversation.activeGroup.id}
        conversationId={conversation.id}
        sessionToken={session.sessionToken}
      />

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Conversation</h2>
            <p>
              Send a prompt to stream an assistant response. Refreshing the page
              now reloads both the transcript and the latest run from persisted
              workspace state. Archived conversations stay readable until you
              restore them.
            </p>
          </div>
        </div>

        {isConversationArchived ? (
          <div className="notice warning">
            This conversation is archived. Restore it to send new messages or
            attach files.
          </div>
        ) : null}

        {composerError ? (
          <div className="notice error">{composerError}</div>
        ) : null}

        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <strong>No messages yet.</strong>
            <p>
              Start with a prompt like "Summarize the current policy changes for
              my team."
            </p>
          </div>
        ) : (
          <div className="chat-placeholder">
            {messages.map((message, index) => (
              <article
                key={message.id}
                className={`chat-bubble ${message.role}`}
              >
                <div className="chat-bubble-meta">
                  <span className="chat-bubble-label">
                    {message.role === "user"
                      ? session.user.displayName
                      : conversation.app.name}
                  </span>
                  <span
                    className={`chat-bubble-status status-${message.status}`}
                  >
                    {message.status}
                  </span>
                </div>
                <ChatMarkdown
                  content={message.content}
                  emptyFallback={
                    message.status === "streaming" ? "Streaming..." : ""
                  }
                />
                <div className="chat-message-actions">
                  <button
                    type="button"
                    className="message-action-button"
                    onClick={() =>
                      void handleCopyMessage(message.id, message.content)
                    }
                    disabled={message.content.trim().length === 0}
                  >
                    {copiedMessageId === message.id ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    className="message-action-button"
                    onClick={() => handleQuoteMessage(message)}
                    disabled={message.content.trim().length === 0}
                  >
                    Quote
                  </button>
                  {message.role === "user" ? (
                    <button
                      type="button"
                      className="message-action-button"
                      onClick={() => handleRetryMessage(message)}
                      disabled={
                        isStreaming ||
                        isUploadingAttachments ||
                        isConversationArchived
                      }
                    >
                      Retry
                    </button>
                  ) : null}
                  {message.role === "assistant" &&
                  message.status === "completed" &&
                  index === messages.length - 1 ? (
                    <button
                      type="button"
                      className="message-action-button"
                      onClick={() => void handleRegenerateMessage(message.id)}
                      disabled={
                        isStreaming ||
                        isUploadingAttachments ||
                        isConversationArchived
                      }
                    >
                      Regenerate
                    </button>
                  ) : null}
                </div>
                {message.attachments && message.attachments.length > 0 ? (
                  <ul className="chat-attachment-list">
                    {message.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        {attachment.fileName} · {attachment.contentType} ·{" "}
                        {formatAttachmentSize(attachment.sizeBytes)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {message.role === "assistant" &&
                message.status === "completed" ? (
                  <div className="chat-feedback-row">
                    <span className="chat-feedback-note">
                      {activeFeedbackMessageId === message.id
                        ? "Saving feedback..."
                        : message.feedback
                          ? `Marked ${describeFeedbackRating(message.feedback.rating)}.`
                          : "Rate this reply."}
                    </span>
                    <div className="chat-feedback-actions">
                      <button
                        type="button"
                        className="feedback-button"
                        aria-pressed={message.feedback?.rating === "positive"}
                        onClick={() =>
                          void handleFeedback(message.id, "positive")
                        }
                        disabled={activeFeedbackMessageId !== null}
                      >
                        Helpful
                      </button>
                      <button
                        type="button"
                        className="feedback-button"
                        aria-pressed={message.feedback?.rating === "negative"}
                        onClick={() =>
                          void handleFeedback(message.id, "negative")
                        }
                        disabled={activeFeedbackMessageId !== null}
                      >
                        Needs work
                      </button>
                    </div>
                  </div>
                ) : null}
                {message.role === "assistant" &&
                message.status === "completed" &&
                message.suggestedPrompts &&
                message.suggestedPrompts.length > 0 ? (
                  <div className="chat-suggested-prompts">
                    <span className="chat-suggested-prompts-label">
                      Try a follow-up
                    </span>
                    <div className="chat-suggested-prompt-list">
                      {message.suggestedPrompts.map((prompt) => (
                        <button
                          key={`${message.id}-${prompt}`}
                          type="button"
                          className="suggested-prompt-button"
                          onClick={() => handleSuggestedPrompt(prompt)}
                          disabled={
                            isStreaming ||
                            isUploadingAttachments ||
                            isConversationArchived
                          }
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}

        <form className="chat-composer" onSubmit={handleSubmit}>
          <label className="field" htmlFor="chat-message">
            Message
          </label>
          <textarea
            id="chat-message"
            ref={composerInputRef}
            className="chat-composer-input"
            rows={4}
            placeholder={`Ask ${conversation.app.name} to work on something concrete...`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={isStreaming || isConversationArchived}
          />
          <label className="field" htmlFor="chat-attachment">
            Attachments
          </label>
          <input
            id="chat-attachment"
            type="file"
            multiple
            accept={WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES.join(",")}
            onChange={(event) => void handleAttachmentSelect(event)}
            disabled={
              isStreaming || isUploadingAttachments || isConversationArchived
            }
          />
          <p className="chat-composer-hint">
            Up to {formatAttachmentSize(WORKSPACE_ATTACHMENT_MAX_BYTES)} per
            file. Supported: text, JSON, CSV, PDF, PNG, JPEG, WEBP, GIF.
          </p>
          {draftAttachments.length > 0 ? (
            <div className="chat-attachment-draft-list">
              {draftAttachments.map((attachment) => (
                <div key={attachment.id} className="chat-attachment-chip">
                  <span>{attachmentsToText([attachment])[0]}</span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleAttachmentRemove(attachment.id)}
                    disabled={isStreaming || isConversationArchived}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="actions">
            <button
              className="primary"
              type="submit"
              disabled={
                isStreaming ||
                isConversationArchived ||
                isUploadingAttachments ||
                (draft.trim().length === 0 && draftAttachments.length === 0)
              }
            >
              {isUploadingAttachments
                ? "Uploading..."
                : isStreaming
                  ? "Streaming..."
                  : "Send message"}
            </button>
            {isStreaming ? (
              <button
                className="secondary"
                type="button"
                onClick={handleStop}
                disabled={isStopping || isAwaitingRunMetadata}
              >
                {isStopping
                  ? "Stopping..."
                  : isAwaitingRunMetadata
                    ? "Starting..."
                    : "Stop response"}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Run history</h2>
            <p>
              Queryable run records are ordered newest first. Select one to
              inspect the stored request snapshot, assistant output and usage
              counters.
            </p>
          </div>
        </div>

        <div className="run-history-grid">
          <div className="run-history-list">
            {runs.length === 0 ? (
              <div className="chat-empty-state">
                <strong>No runs recorded yet.</strong>
                <p>
                  The first completion will create the initial replayable run
                  record.
                </p>
              </div>
            ) : (
              runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className={`run-history-item ${selectedRun?.id === run.id ? "selected" : ""}`}
                  onClick={() => void handleRunSelect(run.id)}
                >
                  <strong>{run.id}</strong>
                  <span>{run.status}</span>
                  <span>{run.triggeredFrom}</span>
                </button>
              ))
            )}
          </div>

          <div className="run-history-detail">
            {selectedRun ? (
              <>
                <div className="chat-meta-grid">
                  <article className="chat-meta-card">
                    <span>Selected run</span>
                    <strong>{selectedRun.id}</strong>
                    <p>{selectedRun.status}</p>
                  </article>
                  <article className="chat-meta-card">
                    <span>Trace</span>
                    <strong>{selectedRun.traceId}</strong>
                    <p>{selectedRun.triggeredFrom}</p>
                  </article>
                  <article className="chat-meta-card">
                    <span>Usage</span>
                    <strong>{selectedRun.usage.totalTokens} tokens</strong>
                    <p>
                      Prompt {selectedRun.usage.promptTokens} · Completion{" "}
                      {selectedRun.usage.completionTokens}
                    </p>
                  </article>
                  <article className="chat-meta-card">
                    <span>Timing</span>
                    <strong>{selectedRun.elapsedTime} ms</strong>
                    <p>{selectedRun.finishedAt ?? "in progress"}</p>
                  </article>
                  <article className="chat-meta-card">
                    <span>Attached files</span>
                    <strong>{replayAttachments.length}</strong>
                    <p>
                      Run inputs keep attachment metadata for replay and
                      follow-on audit work.
                    </p>
                  </article>
                  <article className="chat-meta-card">
                    <span>Timeline events</span>
                    <strong>{selectedRun.timeline.length}</strong>
                    <p>
                      Run lifecycle events are persisted alongside replayable
                      inputs and outputs.
                    </p>
                  </article>
                </div>

                <div className="run-replay-stack">
                  {selectedRun.timeline.length > 0 ? (
                    <article className="chat-bubble assistant">
                      <div className="chat-bubble-meta">
                        <span className="chat-bubble-label">Run timeline</span>
                        <span
                          className={`chat-bubble-status status-${selectedRun.status}`}
                        >
                          {selectedRun.status}
                        </span>
                      </div>
                      <ul className="timeline-list">
                        {selectedRun.timeline.map((event) => (
                          <li key={event.id} className="timeline-item">
                            <strong>
                              {RUN_TIMELINE_EVENT_LABELS[event.type]}
                            </strong>
                            <span>
                              {new Date(event.createdAt).toLocaleString()}
                            </span>
                            <p>{describeTimelineEvent(event)}</p>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ) : null}
                  <article className="chat-bubble user">
                    <div className="chat-bubble-meta">
                      <span className="chat-bubble-label">Prompt snapshot</span>
                      <span
                        className={`chat-bubble-status status-${selectedRun.status}`}
                      >
                        {selectedRun.status}
                      </span>
                    </div>
                    <p>
                      {replayMessages
                        .map((message) => `${message.role}: ${message.content}`)
                        .join("\n\n") ||
                        "No prompt snapshot was stored for this run."}
                    </p>
                  </article>
                  {replayAttachments.length > 0 ? (
                    <article className="chat-bubble user">
                      <div className="chat-bubble-meta">
                        <span className="chat-bubble-label">
                          Attached files
                        </span>
                        <span
                          className={`chat-bubble-status status-${selectedRun.status}`}
                        >
                          {selectedRun.status}
                        </span>
                      </div>
                      <p>{attachmentsToText(replayAttachments).join("\n")}</p>
                    </article>
                  ) : null}
                  <article className="chat-bubble assistant">
                    <div className="chat-bubble-meta">
                      <span className="chat-bubble-label">
                        Assistant output
                      </span>
                      <span
                        className={`chat-bubble-status status-${selectedRun.status}`}
                      >
                        {selectedRun.status}
                      </span>
                    </div>
                    <ChatMarkdown
                      content={replayAssistant}
                      emptyFallback="No assistant output was stored for this run."
                    />
                  </article>
                </div>
              </>
            ) : (
              <div className="chat-empty-state">
                <strong>Select a run.</strong>
                <p>
                  The latest run will be loaded automatically after the first
                  completion.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="actions">
        <Link className="secondary" href="/chat">
          Chat history
        </Link>
        <Link className="secondary" href="/apps">
          Back to Apps workspace
        </Link>
      </div>
    </div>
  );
}
