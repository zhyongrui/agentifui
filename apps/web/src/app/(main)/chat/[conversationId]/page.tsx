"use client";

import {
  getQuotaSeverity,
  isWorkspaceRunDegraded,
  listQuotaAlerts,
  WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES,
  WORKSPACE_ATTACHMENT_MAX_BYTES,
} from "@agentifui/shared/apps";
import type {
  QuotaServiceState,
  QuotaUsage,
  WorkspaceConversation,
  WorkspaceConversationAttachment,
  WorkspaceConversationPresence,
  WorkspaceHitlStep,
  WorkspaceConversationMessage,
  WorkspaceErrorResponse,
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

import { useI18n } from "../../../../components/i18n-provider";
import { MainSectionNav } from "../../../../components/main-section-nav";
import { ChatMarkdown } from "../../../../components/chat-markdown";
import { ConversationSharePanel } from "../../../../components/conversation-share-panel";
import { WorkspaceCommentThread } from "../../../../components/workspace-comments";
import { WorkspaceArtifactLinkList } from "../../../../components/workspace-artifacts";
import {
  WorkspaceRuntimeDegradedBanner,
} from "../../../../components/workspace-runtime-health";
import {
  WorkspaceSafetyBanner,
  WorkspaceSafetySignalList,
} from "../../../../components/workspace-safety";
import {
  WorkspaceCitationList,
  WorkspaceSourceBlockList,
} from "../../../../components/workspace-sources";
import {
  WorkspaceToolCallSummaryList,
  WorkspaceToolExecutionSummaryList,
} from "../../../../components/workspace-tool-summary";
import {
  fetchWorkspaceCatalog,
  createWorkspaceComment,
  fetchWorkspaceConversation,
  fetchWorkspaceConversationPresence,
  fetchWorkspacePendingActions,
  fetchWorkspaceConversationRuns,
  fetchWorkspaceRun,
  respondToWorkspacePendingAction,
  updateWorkspaceConversationPresence,
  updateWorkspaceConversation,
  updateWorkspaceConversationMessageFeedback,
  uploadWorkspaceConversationFile,
} from "../../../../lib/apps-client";
import { clearAuthSession } from "../../../../lib/auth-session";
import {
  fetchGatewayHealth,
  type GatewayRuntimeHealthSnapshot,
} from "../../../../lib/gateway-health-client";
import {
  stopChatCompletion,
  streamChatCompletion,
} from "../../../../lib/chat-client";
import {
  localizeAppStatus,
  localizeWorkspaceApp,
} from "../../../../lib/workspace-localization";
import {
  readOrCreateWorkspacePresenceSessionId,
  summarizeWorkspacePresence,
} from "../../../../lib/workspace-presence";
import { useProtectedSession } from "../../../../lib/use-protected-session";

function toGatewayMessages(
  messages: WorkspaceConversationMessage[],
): ChatCompletionMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolName ? { name: message.toolName } : {}),
    ...(message.toolCalls && message.toolCalls.length > 0
      ? { tool_calls: message.toolCalls }
      : {}),
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

function buildCommentTargetKey(targetType: "artifact" | "message" | "run", targetId: string) {
  return `${targetType}:${targetId}`;
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

function isWorkspaceRuntimeDegradedError(
  error: WorkspaceErrorResponse["error"],
): boolean {
  return (
    typeof error.details === "object" &&
    error.details !== null &&
    (error.details as { reason?: unknown }).reason === "runtime_degraded"
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

function buildPendingActionDraftValues(
  items: WorkspaceHitlStep[],
  currentDrafts: Record<string, Record<string, string>>,
) {
  const nextDrafts: Record<string, Record<string, string>> = {};

  for (const item of items) {
    if (item.kind !== "input_request") {
      continue;
    }

    nextDrafts[item.id] = Object.fromEntries(
      item.fields.map((field) => [
        field.id,
        item.response?.values?.[field.id] ??
          currentDrafts[item.id]?.[field.id] ??
          field.defaultValue ??
          "",
      ]),
    );
  }

  return nextDrafts;
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

function findLatestSafetySignals(messages: WorkspaceConversationMessage[]) {
  const latestAssistantMessage = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" && (message.safetySignals?.length ?? 0) > 0,
    );

  return latestAssistantMessage?.safetySignals ?? [];
}

function describeTranscriptMessageLabel(input: {
  appName: string;
  locale: string;
  message: WorkspaceConversationMessage;
  userLabel: string;
}) {
  if (input.message.role === "user") {
    return input.userLabel;
  }

  if (input.message.role === "tool") {
    return input.locale === "zh-CN"
      ? `工具 · ${input.message.toolName ?? "tool"}`
      : `Tool · ${input.message.toolName ?? "tool"}`;
  }

  return input.appName;
}

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const { locale } = useI18n();
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
  const [presence, setPresence] = useState<WorkspaceConversationPresence | null>(
    null,
  );
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
  const [lastLiveSyncAt, setLastLiveSyncAt] = useState<string | null>(null);
  const [presenceSessionId, setPresenceSessionId] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<WorkspaceHitlStep[]>([]);
  const [pendingActionError, setPendingActionError] = useState<string | null>(
    null,
  );
  const [activePendingActionId, setActivePendingActionId] = useState<
    string | null
  >(null);
  const [pendingActionDrafts, setPendingActionDrafts] = useState<
    Record<string, Record<string, string>>
  >({});
  const [titleDraft, setTitleDraft] = useState("");
  const [conversationActionError, setConversationActionError] = useState<
    string | null
  >(null);
  const [commentErrorByTarget, setCommentErrorByTarget] = useState<
    Record<string, string>
  >({});
  const [activeCommentTarget, setActiveCommentTarget] = useState<string | null>(
    null,
  );
  const [activeConversationAction, setActiveConversationAction] = useState<
    "archive" | "delete" | "pin" | "rename" | "restore" | "unpin" | null
  >(null);
  const [gatewayRuntime, setGatewayRuntime] =
    useState<GatewayRuntimeHealthSnapshot | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const copiedMessageResetRef = useRef<number | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);
  const conversationId =
    typeof params?.conversationId === "string"
      ? params.conversationId.trim()
      : "";
  const copy =
    locale === "zh-CN"
      ? {
          checking: "正在检查登录状态...",
          loading: "正在加载对话界面...",
          backToApps: "返回应用工作台",
          lead: "当前会话会在同一个工作台边界内持久化引用、来源块、产物和运行回放。",
          conversation: "会话",
          status: "状态",
          pinned: "已置顶",
          run: "运行",
          trace: "链路追踪",
          gatewayContext: "网关上下文",
          gatewayLead: "最新会话快照来自工作台状态，每次 completion 都会落到可查询的独立运行记录。",
          liveSync: "实时同步",
          viewers: "查看者",
          activeViewers: "活跃查看",
          lastSynced: "上次同步",
          app: "应用",
          attributedGroup: "归属群组",
          conversationState: "会话状态",
          pinnedHistory: "已在历史中置顶。",
          notPinnedHistory: "未在历史中置顶。",
          runStatus: "运行状态",
          transcript: "转录",
          runHistory: "运行历史",
          conversationTitle: "会话标题",
          streaming: "流式输出中...",
          copied: "已复制",
          copy: "复制",
          quote: "引用",
          retry: "重试",
          regenerate: "重新生成",
          savingFeedback: "正在保存反馈...",
          rateReply: "给这条回复打分。",
          helpful: "有帮助",
          needsWork: "待改进",
          followUp: "试试继续追问",
          toolCalls: "工具调用",
          toolExecutions: "工具执行",
          toolExecutionLead: "工具尝试、结果和耗时现在会持久化在 run 边界内。",
          attempt: "第",
          attemptSuffix: "次尝试",
          latencyUnavailable: "无耗时",
          resultStored: "结果已保存",
          errorResult: "错误结果",
          artifacts: "产物",
          message: "消息",
          askPlaceholder: (name: string) => `让 ${name} 处理一个具体问题...`,
          attachments: "附件",
          attachmentHint: `单个文件最多 ${formatAttachmentSize(WORKSPACE_ATTACHMENT_MAX_BYTES)}。支持：文本、JSON、CSV、PDF、PNG、JPEG、WEBP、GIF。`,
          remove: "移除",
          uploading: "上传中...",
          send: "发送消息",
          stopping: "停止中...",
          starting: "启动中...",
          stopResponse: "停止回复",
          runHistoryLead: "可查询的运行记录按最新优先排序。选择一条即可查看请求快照、输出内容和用量统计。",
          noRuns: "还没有运行记录。",
          noRunsLead: "第一次 completion 会创建首条可回放运行记录。",
          selectRun: "请选择一条运行。",
          selectRunLead: "第一次 completion 后会自动加载最新运行。",
          chatHistory: "对话历史",
          comments: "评论线程",
          messageComments: "消息评论",
          runComments: "运行评论",
          addComment: "添加评论",
          addingComment: "提交中...",
          commentInput: "评论内容",
          noComments: "还没有评论，先留下一条上下文备注。",
          commentMentionHint: "可用 @邮箱 提及已共享访问该会话的协作者。",
        }
      : {
          checking: "Checking your session...",
          loading: "Loading conversation surface...",
          backToApps: "Back to Apps workspace",
          lead: "The conversation surface now keeps persisted citations, source blocks, artifacts, and run replay on the same workspace boundary.",
          conversation: "Conversation",
          status: "Status",
          pinned: "Pinned",
          run: "Run",
          trace: "Trace",
          gatewayContext: "Gateway context",
          gatewayLead: "The latest conversation snapshot still comes from workspace state, and each completion now lands in its own queryable run record.",
          liveSync: "Live sync",
          viewers: "viewers",
          activeViewers: "active viewers",
          lastSynced: "Last synced",
          app: "App",
          attributedGroup: "Attributed group",
          conversationState: "Conversation state",
          pinnedHistory: "Pinned in history.",
          notPinnedHistory: "Not pinned in history.",
          runStatus: "Run status",
          transcript: "Transcript",
          runHistory: "Run history",
          conversationTitle: "Conversation title",
          streaming: "Streaming...",
          copied: "Copied",
          copy: "Copy",
          quote: "Quote",
          retry: "Retry",
          regenerate: "Regenerate",
          savingFeedback: "Saving feedback...",
          rateReply: "Rate this reply.",
          helpful: "Helpful",
          needsWork: "Needs work",
          followUp: "Try a follow-up",
          toolCalls: "Tool calls",
          toolExecutions: "Tool executions",
          toolExecutionLead:
            "Tool attempts, results, and latency now live on the run boundary.",
          attempt: "Attempt ",
          attemptSuffix: "",
          latencyUnavailable: "latency n/a",
          resultStored: "result stored",
          errorResult: "error result",
          artifacts: "Artifacts",
          message: "Message",
          askPlaceholder: (name: string) => `Ask ${name} to work on something concrete...`,
          attachments: "Attachments",
          attachmentHint: `Up to ${formatAttachmentSize(WORKSPACE_ATTACHMENT_MAX_BYTES)} per file. Supported: text, JSON, CSV, PDF, PNG, JPEG, WEBP, GIF.`,
          remove: "Remove",
          uploading: "Uploading...",
          send: "Send message",
          stopping: "Stopping...",
          starting: "Starting...",
          stopResponse: "Stop response",
          runHistoryLead: "Queryable run records are ordered newest first. Select one to inspect the stored request snapshot, assistant output and usage counters.",
          noRuns: "No runs recorded yet.",
          noRunsLead: "The first completion will create the initial replayable run record.",
          selectRun: "Select a run.",
          selectRunLead: "The latest run will be loaded automatically after the first completion.",
          chatHistory: "Chat history",
          comments: "Comment thread",
          messageComments: "Message comments",
          runComments: "Run comments",
          addComment: "Add comment",
          addingComment: "Saving...",
          commentInput: "Comment",
          noComments: "No comments yet.",
          commentMentionHint:
            "Use @email to mention collaborators who already have access to the shared conversation.",
        };

  async function refreshGatewayRuntimeHealth() {
    const health = await fetchGatewayHealth();
    setGatewayRuntime(health?.runtime ?? null);
  }

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

  async function loadPendingActions(sessionToken: string) {
    const result = await fetchWorkspacePendingActions(
      sessionToken,
      conversationId,
    );

    if (!result.ok) {
      setPendingActions([]);
      setPendingActionDrafts({});

      if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
        clearAuthSession(window.sessionStorage);
        router.replace("/login");
        return;
      }

      if (result.error.code === "WORKSPACE_FORBIDDEN") {
        router.replace("/auth/pending");
        return;
      }

      if (result.error.code !== "WORKSPACE_NOT_FOUND") {
        setPendingActionError(result.error.message);
      }

      return;
    }

    setPendingActionError(null);
    setPendingActions(result.data.items);
    setPendingActionDrafts((currentDrafts) =>
      buildPendingActionDraftValues(result.data.items, currentDrafts),
    );
  }

  async function refreshPresence(
    sessionToken: string,
    input: {
      activeRunId?: string | null;
      state?: "active" | "idle";
    } = {},
  ) {
    if (!presenceSessionId) {
      return;
    }

    const result = await updateWorkspaceConversationPresence(
      sessionToken,
      conversationId,
      {
        sessionId: presenceSessionId,
        state: input.state ?? "active",
        activeRunId:
          input.activeRunId === undefined ? undefined : input.activeRunId,
      },
    );

    if (result.ok) {
      setPresence(result.data);
      setLastLiveSyncAt(new Date().toISOString());
    }
  }

  async function loadPresence(sessionToken: string) {
    const result = await fetchWorkspaceConversationPresence(
      sessionToken,
      conversationId,
    );

    if (result.ok) {
      setPresence(result.data);
    }
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
      const [result, gatewayHealth] = await Promise.all([
        fetchWorkspaceConversation(sessionToken, conversationId),
        fetchGatewayHealth(),
      ]);

      setGatewayRuntime(gatewayHealth?.runtime ?? null);

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

      await loadPendingActions(sessionToken);
      await loadRunTracking(
        sessionToken,
        options.preferredRunId ?? result.data.run.id,
      );
      if (presenceSessionId) {
        await refreshPresence(sessionToken, {
          activeRunId: options.preferredRunId ?? result.data.run.id,
          state:
            typeof document !== "undefined" &&
            document.visibilityState === "hidden"
              ? "idle"
              : "active",
        });
      } else {
        await loadPresence(sessionToken);
      }
      setLastLiveSyncAt(new Date().toISOString());
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
    setPresence(null);
    setQuotaUsages([]);
    setQuotaServiceState("available");
    setDraft("");
    setDraftAttachments([]);
    setComposerError(null);
    setLastTraceId(null);
    setLastLiveSyncAt(null);
    setPresenceSessionId(null);
    setPendingActions([]);
    setPendingActionError(null);
    setActivePendingActionId(null);
    setPendingActionDrafts({});
    setTitleDraft("");
    setConversationActionError(null);
    setActiveConversationAction(null);
    setActiveFeedbackMessageId(null);
    setCopiedMessageId(null);
    setGatewayRuntime(null);
    activeAssistantMessageIdRef.current = null;
    activeRunIdRef.current = null;
    stopRequestedRef.current = false;
    setIsUploadingAttachments(false);
    setIsAwaitingRunMetadata(false);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    setPresenceSessionId(
      readOrCreateWorkspacePresenceSessionId(window.sessionStorage, conversationId),
    );
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

  useEffect(() => {
    if (!session || !conversationId || !presenceSessionId) {
      return;
    }

    let isCancelled = false;
    let pollInFlight = false;

    const tick = async () => {
      if (isCancelled || pollInFlight) {
        return;
      }

      pollInFlight = true;

      try {
        const nextState =
          document.visibilityState === "hidden" ? "idle" : "active";

        if (
          nextState === "active" &&
          !isStreaming &&
          !isStopping &&
          activePendingActionId === null
        ) {
          await loadConversation(session.sessionToken, {
            withSpinner: false,
            syncMessages: true,
            preferredRunId: selectedRun?.id ?? activeRunIdRef.current,
          });
        } else {
          await refreshPresence(session.sessionToken, {
            activeRunId: activeRunIdRef.current,
            state: nextState,
          });
        }
      } finally {
        pollInFlight = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void tick();
    }, 10_000);
    const handleVisibilityChange = () => {
      void tick();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void tick();

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activePendingActionId,
    conversationId,
    isStopping,
    isStreaming,
    presenceSessionId,
    selectedRun?.id,
    session,
  ]);

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
      gatewayRuntime?.overallStatus === "degraded" ||
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
            if (isWorkspaceRuntimeDegradedError(result.error)) {
              setComposerError(result.error.message);
              await refreshGatewayRuntimeHealth();
              continue;
            }

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
            const citations = chunk.citations;
            const safetySignals = chunk.safety_signals;
            const toolCalls = delta?.tool_calls;

            if (
              delta?.content ||
              finishReason ||
              (suggestedPrompts && suggestedPrompts.length > 0) ||
              (citations && citations.length > 0) ||
              (safetySignals && safetySignals.length > 0) ||
              (toolCalls && toolCalls.length > 0)
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
                        citations:
                          citations && citations.length > 0
                            ? citations
                            : message.citations,
                        safetySignals:
                          safetySignals && safetySignals.length > 0
                            ? safetySignals
                            : message.safetySignals,
                        toolCalls:
                          toolCalls && toolCalls.length > 0
                            ? toolCalls
                            : message.toolCalls,
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
      await refreshGatewayRuntimeHealth();

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
      gatewayRuntime?.overallStatus === "degraded" ||
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

  function handlePendingActionFieldChange(
    stepId: string,
    fieldId: string,
    value: string,
  ) {
    setPendingActionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [stepId]: {
        ...currentDrafts[stepId],
        [fieldId]: value,
      },
    }));
  }

  async function handlePendingActionRespond(
    step: WorkspaceHitlStep,
    action: "approve" | "reject" | "submit" | "cancel",
  ) {
    if (!session || !conversation) {
      return;
    }

    if (gatewayRuntime?.overallStatus === "degraded") {
      setPendingActionError(
        "Workspace runtime is currently degraded. Pending actions are temporarily read-only.",
      );
      return;
    }

    setPendingActionError(null);
    setActivePendingActionId(step.id);

    try {
      const result = await respondToWorkspacePendingAction(
        session.sessionToken,
        conversation.id,
        step.id,
        action === "submit"
          ? {
              action,
              values: pendingActionDrafts[step.id] ?? {},
            }
          : {
              action,
            },
      );

      if (!result.ok) {
        if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
          clearAuthSession(window.sessionStorage);
          router.replace("/login");
          return;
        }

        if (result.error.code === "WORKSPACE_FORBIDDEN") {
          if (isWorkspaceRuntimeDegradedError(result.error)) {
            setPendingActionError(result.error.message);
            await refreshGatewayRuntimeHealth();
            return;
          }

          router.replace("/auth/pending");
          return;
        }

        if (result.error.code === "WORKSPACE_NOT_FOUND") {
          setConversationError(
            "This conversation is no longer available. Return to the apps workspace and relaunch it.",
          );
          return;
        }

        setPendingActionError(result.error.message);
        return;
      }

      setPendingActions(result.data.items);
      setPendingActionDrafts((currentDrafts) =>
        buildPendingActionDraftValues(result.data.items, currentDrafts),
      );
      await loadConversation(session.sessionToken, {
        preferredRunId: result.data.runId,
        syncMessages: true,
        withSpinner: false,
      });
    } catch {
      setPendingActionError(
        "Saving the pending action response failed. Please retry.",
      );
    } finally {
      setActivePendingActionId((currentStepId) =>
        currentStepId === step.id ? null : currentStepId,
      );
    }
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
    if (gatewayRuntime?.overallStatus === "degraded") {
      return;
    }

    setDraft(prompt);
    setComposerError(null);
    composerInputRef.current?.focus();
  }

  function handleRetryMessage(message: WorkspaceConversationMessage) {
    if (
      message.role !== "user" ||
      gatewayRuntime?.overallStatus === "degraded"
    ) {
      return;
    }

    setDraft(message.content);
    setDraftAttachments(message.attachments ?? []);
    setComposerError(null);
    composerInputRef.current?.focus();
  }

  async function handleRegenerateMessage(messageId: string) {
    if (
      !conversation ||
      gatewayRuntime?.overallStatus === "degraded" ||
      isStreaming ||
      isUploadingAttachments
    ) {
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

  async function handleCreateComment(
    targetType: "message" | "run",
    targetId: string,
    content: string,
  ) {
    if (!session || !conversation) {
      return;
    }

    const targetKey = buildCommentTargetKey(targetType, targetId);
    setActiveCommentTarget(targetKey);
    setCommentErrorByTarget((current) => {
      const next = { ...current };
      delete next[targetKey];
      return next;
    });

    try {
      const result = await createWorkspaceComment(
        session.sessionToken,
        conversation.id,
        {
          targetType,
          targetId,
          content,
        },
      );

      if (!result.ok) {
        if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
          clearAuthSession(window.sessionStorage);
          router.replace("/login");
          return;
        }

        setCommentErrorByTarget((current) => ({
          ...current,
          [targetKey]: result.error.message,
        }));
        return;
      }

      if (targetType === "message") {
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === targetId
              ? { ...message, comments: result.data.thread }
              : message,
          ),
        );
      }

      setConversation((currentConversation) =>
        !currentConversation
          ? currentConversation
          : {
              ...currentConversation,
              messages: currentConversation.messages.map((message) =>
                targetType === "message" && message.id === targetId
                  ? { ...message, comments: result.data.thread }
                  : message,
              ),
            },
      );

      if (targetType === "run") {
        setSelectedRun((currentRun) =>
          currentRun && currentRun.id === targetId
            ? { ...currentRun, comments: result.data.thread }
            : currentRun,
        );
      }
    } catch {
      setCommentErrorByTarget((current) => ({
        ...current,
        [targetKey]:
          locale === "zh-CN"
            ? "评论提交失败，请稍后重试。"
            : "Comment submission failed. Please retry.",
      }));
    } finally {
      setActiveCommentTarget((currentTarget) =>
        currentTarget === targetKey ? null : currentTarget,
      );
    }
  }

  if (isLoading) {
    return <p className="lead">{copy.checking}</p>;
  }

  if (isConversationLoading) {
    return <p className="lead">{copy.loading}</p>;
  }

  if (conversationError) {
    return (
      <div className="stack">
        <MainSectionNav showSecurity />
        <div className="notice error">{conversationError}</div>
        <div className="actions">
          <Link className="secondary" href="/apps">
            {copy.backToApps}
          </Link>
        </div>
      </div>
    );
  }

  if (!session || !conversation) {
    return null;
  }

  const localizedApp = localizeWorkspaceApp(conversation.app, locale);

  const replayMessages = selectedRun ? buildReplayMessages(selectedRun) : [];
  const replayAssistant = selectedRun ? buildAssistantReplay(selectedRun) : "";
  const replayAttachments = selectedRun
    ? buildReplayAttachments(selectedRun)
    : [];
  const latestSafetySignals =
    selectedRun && selectedRun.id === conversation.run.id
      ? selectedRun.safetySignals
      : findLatestSafetySignals(messages);
  const quotaAlerts = listQuotaAlerts(quotaUsages);
  const isConversationArchived = conversation.status === "archived";
  const isRuntimeDegraded =
    gatewayRuntime?.overallStatus === "degraded" ||
    (selectedRun?.id === conversation.run.id && isWorkspaceRunDegraded(selectedRun));
  const isConversationReadOnly = isConversationArchived || isRuntimeDegraded;
  const presenceSummary = summarizeWorkspacePresence(presence);

  return (
    <div className="chat-surface stack">
      <MainSectionNav showSecurity />

      <header className="chat-header">
        <div>
          <span className="eyebrow">P2-D2</span>
          <h1>{conversation.title}</h1>
          <p className="lead">{copy.lead}</p>
        </div>
        <div className="workspace-badges">
          <span className="workspace-badge">
            {copy.conversation} {conversation.id}
          </span>
          <span className="workspace-badge">{copy.status} {conversation.status}</span>
          {conversation.pinned ? (
            <span className="workspace-badge">{copy.pinned}</span>
          ) : null}
          <span className="workspace-badge">{copy.run} {conversation.run.id}</span>
          <span className="workspace-badge">
            {copy.trace} {lastTraceId ?? conversation.run.traceId}
          </span>
          <span className="workspace-badge">
            {copy.liveSync} · {presenceSummary.total} {copy.viewers}
          </span>
          <span className="workspace-badge">
            {presenceSummary.active} {copy.activeViewers}
          </span>
          {lastLiveSyncAt ? (
            <span className="workspace-badge">
              {copy.lastSynced} {new Date(lastLiveSyncAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </header>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>{copy.gatewayContext}</h2>
            <p>{copy.gatewayLead}</p>
          </div>
          <span className={`status-chip status-${conversation.app.status}`}>
            {localizeAppStatus(conversation.app.status, locale)}
          </span>
        </div>

        <div className="chat-meta-grid">
          <article className="chat-meta-card">
            <span>{copy.app}</span>
            <strong>{localizedApp.name}</strong>
            <p>{localizedApp.summary}</p>
          </article>
          <article className="chat-meta-card">
            <span>{copy.attributedGroup}</span>
            <strong>{conversation.activeGroup.name}</strong>
            <p>{conversation.activeGroup.description}</p>
          </article>
          <article className="chat-meta-card">
            <span>{copy.conversationState}</span>
            <strong>{conversation.status}</strong>
            <p>{conversation.pinned ? copy.pinnedHistory : copy.notPinnedHistory}</p>
          </article>
          <article className="chat-meta-card">
            <span>{copy.runStatus}</span>
            <strong>{conversation.run.status}</strong>
            <p>
              Type: {conversation.run.type} · Trigger:{" "}
              {conversation.run.triggeredFrom}
            </p>
          </article>
          <article className="chat-meta-card">
            <span>{copy.transcript}</span>
            <strong>{messages.length} messages</strong>
            <p>
              History is rehydrated from the workspace conversation response.
            </p>
          </article>
          <article className="chat-meta-card">
            <span>{copy.runHistory}</span>
            <strong>{runs.length} runs</strong>
            <p>Each completion is now tracked separately for replay.</p>
          </article>
        </div>

        <div className="conversation-management-panel">
          <label className="field" htmlFor="conversation-title">
            {copy.conversationTitle}
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

        <WorkspaceRuntimeDegradedBanner
          context="conversation"
          snapshot={gatewayRuntime}
        />

        {composerError ? (
          <div className="notice error">{composerError}</div>
        ) : null}

        {pendingActionError ? (
          <div className="notice error">{pendingActionError}</div>
        ) : null}

        <WorkspaceSafetyBanner signals={latestSafetySignals} />

        {pendingActions.length > 0 ? (
          <div className="chat-placeholder">
            {pendingActions.map((step) => {
              const isPending = step.status === "pending";
              const isSubmitting = activePendingActionId === step.id;
              const draftValues = pendingActionDrafts[step.id] ?? {};

              return (
                <article key={step.id} className="chat-bubble assistant">
                  <div className="chat-bubble-meta">
                    <span className="chat-bubble-label">Pending action</span>
                    <span
                      className={`chat-bubble-status status-${isPending ? "streaming" : "completed"}`}
                    >
                      {step.status}
                    </span>
                  </div>
                  <p>
                    <strong>{step.title}</strong>
                  </p>
                  {step.description ? <p>{step.description}</p> : null}
                  <p>
                    Run {step.runId} · expires{" "}
                    {step.expiresAt
                      ? new Date(step.expiresAt).toLocaleString()
                      : "not set"}
                  </p>

                  {step.kind === "approval" ? (
                    <div className="actions">
                      <button
                        type="button"
                        className="primary"
                        disabled={isSubmitting || !isPending || isRuntimeDegraded}
                        onClick={() =>
                          void handlePendingActionRespond(step, "approve")
                        }
                      >
                        {isSubmitting ? "Saving..." : step.approveLabel}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={isSubmitting || !isPending || isRuntimeDegraded}
                        onClick={() =>
                          void handlePendingActionRespond(step, "reject")
                        }
                      >
                        {step.rejectLabel}
                      </button>
                      <button
                        type="button"
                        className="secondary danger"
                        disabled={isSubmitting || !isPending || isRuntimeDegraded}
                        onClick={() =>
                          void handlePendingActionRespond(step, "cancel")
                        }
                      >
                        Abandon
                      </button>
                    </div>
                  ) : (
                    <div className="stack">
                      {step.fields.map((field) => (
                        <label key={field.id} className="field">
                          <span>{field.label}</span>
                          {field.type === "textarea" ? (
                            <textarea
                              className="chat-composer-input"
                              rows={3}
                              placeholder={field.placeholder ?? ""}
                              value={draftValues[field.id] ?? ""}
                              onChange={(event) =>
                                handlePendingActionFieldChange(
                                  step.id,
                                  field.id,
                                  event.target.value,
                                )
                              }
                              disabled={isSubmitting || !isPending || isRuntimeDegraded}
                            />
                          ) : field.type === "select" ? (
                            <select
                              className="chat-composer-input"
                              value={draftValues[field.id] ?? ""}
                              onChange={(event) =>
                                handlePendingActionFieldChange(
                                  step.id,
                                  field.id,
                                  event.target.value,
                                )
                              }
                              disabled={isSubmitting || !isPending || isRuntimeDegraded}
                            >
                              <option value="">Select an option</option>
                              {field.options?.map((option) => (
                                <option key={option.id} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="chat-composer-input"
                              type="text"
                              placeholder={field.placeholder ?? ""}
                              value={draftValues[field.id] ?? ""}
                              onChange={(event) =>
                                handlePendingActionFieldChange(
                                  step.id,
                                  field.id,
                                  event.target.value,
                                )
                              }
                              disabled={isSubmitting || !isPending || isRuntimeDegraded}
                            />
                          )}
                          {field.helpText ? <small>{field.helpText}</small> : null}
                        </label>
                      ))}
                      <div className="actions">
                        <button
                          type="button"
                          className="primary"
                          disabled={isSubmitting || !isPending || isRuntimeDegraded}
                          onClick={() =>
                            void handlePendingActionRespond(step, "submit")
                          }
                        >
                          {isSubmitting ? "Saving..." : step.submitLabel}
                        </button>
                        <button
                          type="button"
                          className="secondary danger"
                          disabled={isSubmitting || !isPending || isRuntimeDegraded}
                          onClick={() =>
                            void handlePendingActionRespond(step, "cancel")
                          }
                        >
                          Abandon
                        </button>
                      </div>
                    </div>
                  )}

                  {step.response ? (
                    <div className="chat-feedback-row">
                      <span className="chat-feedback-note">
                        {step.response.action} by{" "}
                        {step.response.actorDisplayName ?? step.response.actorUserId} ·{" "}
                        {new Date(step.response.respondedAt).toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                  {step.response?.values ? (
                    <ul className="chat-attachment-list">
                      {Object.entries(step.response.values).map(
                        ([fieldId, value]) => (
                          <li key={`${step.id}-${fieldId}`}>
                            {fieldId}: {value || "(empty)"}
                          </li>
                        ),
                      )}
                    </ul>
                  ) : null}
                  {isRuntimeDegraded && isPending ? (
                    <div className="notice warning">
                      Runtime recovery is required before this pending action can
                      be submitted.
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
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
                    {describeTranscriptMessageLabel({
                      appName: localizedApp.name,
                      locale,
                      message,
                      userLabel: session.user.displayName,
                    })}
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
                    message.status === "streaming" ? copy.streaming : ""
                  }
                />
                {message.toolCalls && message.toolCalls.length > 0 ? (
                  <WorkspaceToolCallSummaryList
                    locale={locale}
                    title={copy.toolCalls}
                    toolCalls={message.toolCalls}
                  />
                ) : null}
                <div className="chat-message-actions">
                  <button
                    type="button"
                    className="message-action-button"
                    onClick={() =>
                      void handleCopyMessage(message.id, message.content)
                    }
                    disabled={message.content.trim().length === 0}
                  >
                    {copiedMessageId === message.id ? copy.copied : copy.copy}
                  </button>
                  <button
                    type="button"
                    className="message-action-button"
                    onClick={() => handleQuoteMessage(message)}
                    disabled={message.content.trim().length === 0}
                  >
                    {copy.quote}
                  </button>
                  {message.role === "user" ? (
                    <button
                      type="button"
                      className="message-action-button"
                      onClick={() => handleRetryMessage(message)}
                      disabled={
                        isStreaming ||
                        isUploadingAttachments ||
                        isConversationReadOnly
                      }
                    >
                      {copy.retry}
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
                        isConversationReadOnly
                      }
                    >
                      {copy.regenerate}
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
                        ? copy.savingFeedback
                        : message.feedback
                          ? `Marked ${describeFeedbackRating(message.feedback.rating)}.`
                          : copy.rateReply}
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
                        {copy.helpful}
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
                        {copy.needsWork}
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
                      {copy.followUp}
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
                            isConversationReadOnly
                          }
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {message.safetySignals && message.safetySignals.length > 0 ? (
                  <WorkspaceSafetySignalList signals={message.safetySignals} />
                ) : null}
                {message.citations && message.citations.length > 0 ? (
                  <WorkspaceCitationList citations={message.citations} />
                ) : null}
                {message.artifacts && message.artifacts.length > 0 ? (
                  <div className="chat-artifact-section">
                    <span className="chat-suggested-prompts-label">
                      {copy.artifacts}
                    </span>
                    <WorkspaceArtifactLinkList
                      artifacts={message.artifacts}
                      conversationId={conversation.id}
                    />
                  </div>
                ) : null}
                <WorkspaceCommentThread
                  title={copy.messageComments}
                  comments={message.comments ?? []}
                  locale={locale}
                  emptyText={copy.noComments}
                  helperText={copy.commentMentionHint}
                  textareaLabel={copy.commentInput}
                  submitLabel={copy.addComment}
                  submittingLabel={copy.addingComment}
                  isSubmitting={
                    activeCommentTarget ===
                    buildCommentTargetKey("message", message.id)
                  }
                  submitError={
                    commentErrorByTarget[
                      buildCommentTargetKey("message", message.id)
                    ] ?? null
                  }
                  onSubmit={
                    isConversationReadOnly
                      ? undefined
                      : async (content) => {
                          await handleCreateComment("message", message.id, content);
                        }
                  }
                />
              </article>
            ))}
          </div>
        )}

        <form className="chat-composer" onSubmit={handleSubmit}>
          <label className="field" htmlFor="chat-message">
            {copy.message}
          </label>
          <textarea
            id="chat-message"
            ref={composerInputRef}
            className="chat-composer-input"
            rows={4}
            placeholder={copy.askPlaceholder(localizedApp.name)}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={isStreaming || isConversationReadOnly}
          />
          <label className="field" htmlFor="chat-attachment">
            {copy.attachments}
          </label>
          <input
            id="chat-attachment"
            type="file"
            multiple
            accept={WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES.join(",")}
            onChange={(event) => void handleAttachmentSelect(event)}
            disabled={
              isStreaming || isUploadingAttachments || isConversationReadOnly
            }
          />
          <p className="chat-composer-hint">{copy.attachmentHint}</p>
          {draftAttachments.length > 0 ? (
            <div className="chat-attachment-draft-list">
              {draftAttachments.map((attachment) => (
                <div key={attachment.id} className="chat-attachment-chip">
                  <span>{attachmentsToText([attachment])[0]}</span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleAttachmentRemove(attachment.id)}
                    disabled={isStreaming || isConversationReadOnly}
                  >
                    {copy.remove}
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
                isConversationReadOnly ||
                isUploadingAttachments ||
                (draft.trim().length === 0 && draftAttachments.length === 0)
              }
            >
              {isUploadingAttachments
                ? copy.uploading
                : isStreaming
                  ? copy.streaming
                  : copy.send}
            </button>
            {isStreaming ? (
              <button
                className="secondary"
                type="button"
                onClick={handleStop}
                disabled={isStopping || isAwaitingRunMetadata}
              >
                {isStopping
                  ? copy.stopping
                  : isAwaitingRunMetadata
                    ? copy.starting
                    : copy.stopResponse}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Run history</h2>
            <p>{copy.runHistoryLead}</p>
          </div>
        </div>

        <div className="run-history-grid">
          <div className="run-history-list">
            {runs.length === 0 ? (
              <div className="chat-empty-state">
                <strong>{copy.noRuns}</strong>
                <p>{copy.noRunsLead}</p>
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
                  {selectedRun.runtime ? (
                    <article className="chat-meta-card">
                      <span>Runtime</span>
                      <strong>{selectedRun.runtime.label}</strong>
                      <p>
                        {selectedRun.runtime.id} · {selectedRun.runtime.status}
                      </p>
                    </article>
                  ) : null}
                  {selectedRun.failure ? (
                    <article className="chat-meta-card">
                      <span>Failure</span>
                      <strong>{selectedRun.failure.code}</strong>
                      <p>
                        {selectedRun.failure.stage} ·{" "}
                        {selectedRun.failure.retryable
                          ? "retryable"
                          : "manual follow-up"}
                      </p>
                    </article>
                  ) : null}
                  <article className="chat-meta-card">
                    <span>Attached files</span>
                    <strong>{replayAttachments.length}</strong>
                    <p>
                      Run inputs keep attachment metadata for replay and
                      follow-on audit work.
                    </p>
                  </article>
                  <article className="chat-meta-card">
                    <span>Artifacts</span>
                    <strong>{selectedRun.artifacts.length}</strong>
                    <p>
                      Structured outputs stay separately queryable from the
                      transcript summary boundary.
                    </p>
                  </article>
                  <article className="chat-meta-card">
                    <span>Sources</span>
                    <strong>
                      {selectedRun.citations.length} citations ·{" "}
                      {selectedRun.sourceBlocks.length} blocks
                    </strong>
                    <p>
                      Citation metadata and source blocks are replayable from
                      persisted run outputs.
                    </p>
                  </article>
                  {selectedRun.toolExecutions.length > 0 ? (
                    <article className="chat-meta-card">
                      <span>{copy.toolExecutions}</span>
                      <strong>{selectedRun.toolExecutions.length}</strong>
                      <p>{copy.toolExecutionLead}</p>
                    </article>
                  ) : null}
                  {selectedRun.safetySignals.length > 0 ? (
                    <article className="chat-meta-card">
                      <span>Safety signals</span>
                      <strong>{selectedRun.safetySignals.length}</strong>
                      <p>
                        {selectedRun.safetySignals.some(
                          (signal) => signal.severity === "critical",
                        )
                          ? "Critical review required"
                          : "Warning review suggested"}
                      </p>
                    </article>
                  ) : null}
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
                  {selectedRun.runtime ? (
                    <article className="chat-bubble assistant">
                      <div className="chat-bubble-meta">
                        <span className="chat-bubble-label">Runtime</span>
                        <span
                          className={`chat-bubble-status status-${selectedRun.status}`}
                        >
                          {selectedRun.status}
                        </span>
                      </div>
                      <p>
                        <strong>{selectedRun.runtime.label}</strong> ·{" "}
                        {selectedRun.runtime.id}
                      </p>
                      <p>
                        {selectedRun.runtime.status} · invoked{" "}
                        {new Date(selectedRun.runtime.invokedAt).toLocaleString()}
                      </p>
                      <p>
                        streaming{" "}
                        {selectedRun.runtime.capabilities.streaming ? "on" : "off"}
                        {" · "}citations{" "}
                        {selectedRun.runtime.capabilities.citations ? "on" : "off"}
                        {" · "}artifacts{" "}
                        {selectedRun.runtime.capabilities.artifacts ? "on" : "off"}
                      </p>
                    </article>
                  ) : null}
                  {selectedRun.safetySignals.length > 0 ? (
                    <article className="chat-bubble assistant">
                      <div className="chat-bubble-meta">
                        <span className="chat-bubble-label">Safety signals</span>
                        <span
                          className={`chat-bubble-status status-${selectedRun.status}`}
                        >
                          {selectedRun.status}
                        </span>
                      </div>
                      <WorkspaceSafetySignalList
                        signals={selectedRun.safetySignals}
                        title="Run safety signals"
                      />
                    </article>
                  ) : null}
                  {selectedRun.failure ? (
                    <article className="chat-bubble assistant">
                      <div className="chat-bubble-meta">
                        <span className="chat-bubble-label">Failure reason</span>
                        <span
                          className={`chat-bubble-status status-${selectedRun.status}`}
                        >
                          {selectedRun.status}
                        </span>
                      </div>
                      <p>
                        <strong>{selectedRun.failure.code}</strong> ·{" "}
                        {selectedRun.failure.stage}
                      </p>
                      <p>{selectedRun.failure.message}</p>
                      {selectedRun.failure.detail ? (
                        <p>{selectedRun.failure.detail}</p>
                      ) : null}
                      <p>
                        {selectedRun.failure.retryable
                          ? "This run can be retried."
                          : "This run needs manual follow-up."}
                      </p>
                    </article>
                  ) : null}
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
                  {selectedRun.artifacts.length > 0 ? (
                    <article className="chat-bubble assistant">
                      <div className="chat-bubble-meta">
                        <span className="chat-bubble-label">Artifacts</span>
                        <span
                          className={`chat-bubble-status status-${selectedRun.status}`}
                        >
                          {selectedRun.status}
                        </span>
                      </div>
                      <WorkspaceArtifactLinkList
                        artifacts={selectedRun.artifacts}
                        conversationId={conversation.id}
                        runId={selectedRun.id}
                      />
                    </article>
                  ) : null}
                  {selectedRun.citations.length > 0 ? (
                    <article className="chat-bubble assistant">
                      <div className="chat-bubble-meta">
                        <span className="chat-bubble-label">Citations</span>
                        <span
                          className={`chat-bubble-status status-${selectedRun.status}`}
                        >
                          {selectedRun.status}
                        </span>
                      </div>
                      <WorkspaceCitationList
                        citations={selectedRun.citations}
                        title="Replay citations"
                      />
                    </article>
                  ) : null}
                  {selectedRun.sourceBlocks.length > 0 ? (
                    <article className="chat-bubble assistant">
                      <div className="chat-bubble-meta">
                        <span className="chat-bubble-label">Source blocks</span>
                        <span
                          className={`chat-bubble-status status-${selectedRun.status}`}
                        >
                          {selectedRun.status}
                        </span>
                      </div>
                      <WorkspaceSourceBlockList
                        sourceBlocks={selectedRun.sourceBlocks}
                        title="Replay source blocks"
                      />
                    </article>
                  ) : null}
                  {selectedRun.toolExecutions.length > 0 ? (
                    <article className="chat-bubble assistant">
                      <div className="chat-bubble-meta">
                        <span className="chat-bubble-label">
                          {copy.toolExecutions}
                        </span>
                        <span
                          className={`chat-bubble-status status-${selectedRun.status}`}
                        >
                          {selectedRun.status}
                        </span>
                      </div>
                      <WorkspaceToolExecutionSummaryList
                        executions={selectedRun.toolExecutions}
                        locale={locale}
                      />
                    </article>
                  ) : null}
                  <WorkspaceCommentThread
                    title={copy.runComments}
                    comments={selectedRun.comments}
                    locale={locale}
                    emptyText={copy.noComments}
                    helperText={copy.commentMentionHint}
                    textareaLabel={copy.commentInput}
                    submitLabel={copy.addComment}
                    submittingLabel={copy.addingComment}
                    isSubmitting={
                      activeCommentTarget ===
                      buildCommentTargetKey("run", selectedRun.id)
                    }
                    submitError={
                      commentErrorByTarget[
                        buildCommentTargetKey("run", selectedRun.id)
                      ] ?? null
                    }
                    onSubmit={
                      isConversationReadOnly
                        ? undefined
                        : async (content) => {
                            await handleCreateComment("run", selectedRun.id, content);
                          }
                    }
                  />
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
                <strong>{copy.selectRun}</strong>
                <p>{copy.selectRunLead}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="actions">
        <Link className="secondary" href="/chat">
          {copy.chatHistory}
        </Link>
        <Link className="secondary" href="/apps">
          {copy.backToApps}
        </Link>
      </div>
    </div>
  );
}
