"use client";

import type {
  WorkspaceConversationPresence,
  WorkspaceConversationShareAccess,
  WorkspaceConversationStatus,
} from "@agentifui/shared/apps";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ChatMarkdown } from "../../../../../components/chat-markdown";
import { useI18n } from "../../../../../components/i18n-provider";
import { MainSectionNav } from "../../../../../components/main-section-nav";
import { WorkspaceCommentThread } from "../../../../../components/workspace-comments";
import { WorkspaceSafetySignalList } from "../../../../../components/workspace-safety";
import { WorkspaceArtifactLinkList } from "../../../../../components/workspace-artifacts";
import { WorkspaceCitationList } from "../../../../../components/workspace-sources";
import { WorkspaceToolCallSummaryList } from "../../../../../components/workspace-tool-summary";
import {
  createWorkspaceSharedComment,
  fetchWorkspaceSharedConversation,
  fetchWorkspaceSharedConversationPresence,
  updateWorkspaceSharedConversation,
  updateWorkspaceSharedConversationPresence,
} from "../../../../../lib/apps-client";
import { clearAuthSession } from "../../../../../lib/auth-session";
import {
  readOrCreateWorkspacePresenceSessionId,
  summarizeWorkspacePresence,
} from "../../../../../lib/workspace-presence";
import { localizeWorkspaceApp } from "../../../../../lib/workspace-localization";
import { useProtectedSession } from "../../../../../lib/use-protected-session";

function describeSharedMessageLabel(input: {
  appName: string;
  locale: string;
  role: "user" | "assistant" | "tool";
  toolName?: string;
  workspaceUser: string;
}) {
  if (input.role === "user") {
    return input.workspaceUser;
  }

  if (input.role === "tool") {
    return input.locale === "zh-CN"
      ? `工具 · ${input.toolName ?? "tool"}`
      : `Tool · ${input.toolName ?? "tool"}`;
  }

  return input.appName;
}

function describePresenceState(
  locale: string,
  state: "active" | "idle",
) {
  if (locale === "zh-CN") {
    return state === "active" ? "在线" : "空闲";
  }

  return state === "active" ? "Active" : "Idle";
}

function describePresenceSurface(
  locale: string,
  surface: "conversation" | "shared_conversation",
) {
  if (locale === "zh-CN") {
    return surface === "shared_conversation" ? "共享视图" : "所有者视图";
  }

  return surface === "shared_conversation" ? "Shared view" : "Owner view";
}

function describeShareAccess(
  locale: string,
  access: WorkspaceConversationShareAccess,
) {
  if (locale === "zh-CN") {
    if (access === "commenter") {
      return "可评论";
    }

    if (access === "editor") {
      return "可编辑";
    }

    return "只读";
  }

  if (access === "commenter") {
    return "Commenter";
  }

  if (access === "editor") {
    return "Editor";
  }

  return "Read-only";
}

export default function SharedConversationPage() {
  const params = useParams<{ shareId: string }>();
  const router = useRouter();
  const { locale } = useI18n();
  const { session, isLoading } = useProtectedSession("/chat/shared");
  const [payload, setPayload] = useState<Awaited<
    ReturnType<typeof fetchWorkspaceSharedConversation>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presence, setPresence] = useState<WorkspaceConversationPresence | null>(
    null,
  );
  const [lastLiveSyncAt, setLastLiveSyncAt] = useState<string | null>(null);
  const [presenceSessionId, setPresenceSessionId] = useState<string | null>(null);
  const [commentErrorByTargetId, setCommentErrorByTargetId] = useState<Record<string, string | null>>({});
  const [submittingCommentTargetId, setSubmittingCommentTargetId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftStatus, setDraftStatus] = useState<WorkspaceConversationStatus>("active");
  const [draftPinned, setDraftPinned] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isMetadataSubmitting, setIsMetadataSubmitting] = useState(false);
  const shareId =
    typeof params?.shareId === "string" ? params.shareId.trim() : "";
  const copy =
    locale === "zh-CN"
      ? {
          missingShareId: "缺少共享标识。",
          loadFailed: "共享会话加载失败，请稍后重试。",
          checking: "正在检查登录状态...",
          loading: "正在加载共享会话...",
          back: "返回应用工作台",
          lead:
            "这是一个共享工作台会话。你可以查看转录、附件和持久化产物；权限更高的协作者还可以评论或调整会话元数据。",
          shareLabel: "共享",
          groupLabel: "群组",
          accessLabel: "权限",
          sharedConversation: "共享会话",
          sharedLead: (groupName: string, accessLabel: string) =>
            `这段转录当前以${accessLabel}方式共享给 ${groupName}。`,
          workspaceUser: "工作台用户",
          toolCalls: "工具调用",
          suggested: "建议的下一步提问",
          comments: "共享评论",
          noComments: "当前没有共享评论。",
          addComment: "添加评论",
          addingComment: "提交中...",
          commentInput: "评论内容",
          commentHint: "可用 @邮箱 提及已具备此会话访问权的协作者。",
          safety: "共享安全提示",
          citations: "共享引用",
          artifacts: "共享产物",
          metadataTitle: "共享协作设置",
          metadataLead: "编辑者可以在共享视图里调整标题、置顶和归档状态。",
          conversationTitle: "会话标题",
          conversationStatus: "会话状态",
          pinned: "置顶会话",
          saveMetadata: "保存会话设置",
          savingMetadata: "保存中...",
          active: "活跃",
          archived: "已归档",
          liveSync: "协作视图",
          viewers: "位查看者",
          activeViewers: "位在线查看者",
          lastSynced: "最近同步",
          viewerPresence: "协作者视图",
          you: "你",
          noViewers: "当前没有其他查看者在线。",
        }
      : {
          missingShareId: "Share id is missing.",
          loadFailed: "The shared conversation could not be loaded. Please retry.",
          checking: "Checking your session...",
          loading: "Loading shared conversation...",
          back: "Back to Apps workspace",
          lead:
            "This is a shared workspace conversation. You can inspect the transcript, attachments, and persisted artifacts, and higher-permission collaborators can comment or edit metadata.",
          shareLabel: "Share",
          groupLabel: "Group",
          accessLabel: "Access",
          sharedConversation: "Shared conversation",
          sharedLead: (groupName: string, accessLabel: string) =>
            `This transcript is currently shared with ${groupName} as ${accessLabel}.`,
          workspaceUser: "Workspace user",
          toolCalls: "Tool calls",
          suggested: "Suggested next prompts",
          comments: "Shared comments",
          noComments: "No shared comments yet.",
          addComment: "Add comment",
          addingComment: "Saving...",
          commentInput: "Comment",
          commentHint:
            "Use @email to mention collaborators who already have access to this conversation.",
          safety: "Shared safety signals",
          citations: "Shared citations",
          artifacts: "Shared artifacts",
          metadataTitle: "Shared collaboration settings",
          metadataLead:
            "Editors can adjust the conversation title, pin state, and archive status directly from this surface.",
          conversationTitle: "Conversation title",
          conversationStatus: "Conversation status",
          pinned: "Pin conversation",
          saveMetadata: "Save conversation settings",
          savingMetadata: "Saving...",
          active: "Active",
          archived: "Archived",
          liveSync: "Live view",
          viewers: "viewers",
          activeViewers: "active viewers",
          lastSynced: "Last synced",
          viewerPresence: "Viewer presence",
          you: "You",
          noViewers: "No other viewers are currently active on this shared surface.",
        };

  useEffect(() => {
    if (!session || !shareId) {
      setPayload(null);
      setPresence(null);
      setError(shareId ? null : copy.missingShareId);
      return;
    }

    let cancelled = false;

    void (async () => {
      setError(null);

      try {
        const result = await fetchWorkspaceSharedConversation(
          session.sessionToken,
          shareId,
        );

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
            clearAuthSession(window.sessionStorage);
            router.replace("/login");
            return;
          }

          setError(result.error.message);
          return;
        }

        setPayload(result);
      } catch {
        if (!cancelled) {
          setError(copy.loadFailed);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, session, shareId]);

  useEffect(() => {
    if (!payload || !payload.ok) {
      return;
    }

    setDraftTitle(payload.data.conversation.title);
    setDraftStatus(payload.data.conversation.status);
    setDraftPinned(payload.data.conversation.pinned);
  }, [payload]);

  useEffect(() => {
    if (!shareId) {
      setPresenceSessionId(null);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    setPresenceSessionId(
      readOrCreateWorkspacePresenceSessionId(
        window.sessionStorage,
        `shared:${shareId}`,
      ),
    );
  }, [shareId]);

  useEffect(() => {
    if (!session || !shareId || !presenceSessionId) {
      return;
    }

    let cancelled = false;

    const syncPresence = async (state: "active" | "idle") => {
      try {
        const result = await updateWorkspaceSharedConversationPresence(
          session.sessionToken,
          shareId,
          {
            sessionId: presenceSessionId,
            state,
            surface: "shared_conversation",
          },
        );

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
            clearAuthSession(window.sessionStorage);
            router.replace("/login");
          }
          return;
        }

        setPresence(result.data);
        setLastLiveSyncAt(new Date().toISOString());
      } catch {
        if (cancelled) {
          return;
        }

        try {
          const fallback = await fetchWorkspaceSharedConversationPresence(
            session.sessionToken,
            shareId,
          );

          if (!cancelled && fallback.ok) {
            setPresence(fallback.data);
          }
        } catch {
          // Ignore transient presence heartbeat failures on the read-only surface.
        }
      }
    };

    const tick = async () => {
      const nextState =
        document.visibilityState === "visible" ? "active" : "idle";
      await syncPresence(nextState);
    };

    const handleVisibilityChange = () => {
      void tick();
    };

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, 10_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [presenceSessionId, router, session, shareId]);

  async function handleCreateSharedComment(targetId: string, content: string) {
    if (!session || !payload || !payload.ok || submittingCommentTargetId) {
      return;
    }

    setSubmittingCommentTargetId(targetId);
    setCommentErrorByTargetId((current) => ({
      ...current,
      [targetId]: null,
    }));

    try {
      const result = await createWorkspaceSharedComment(session.sessionToken, shareId, {
        targetType: "message",
        targetId,
        content,
      });

      if (!result.ok) {
        if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
          clearAuthSession(window.sessionStorage);
          router.replace("/login");
          return;
        }

        setCommentErrorByTargetId((current) => ({
          ...current,
          [targetId]: result.error.message,
        }));
        return;
      }

      setPayload((current) => {
        if (!current || !current.ok) {
          return current;
        }

        return {
          ...current,
          data: {
            ...current.data,
            conversation: {
              ...current.data.conversation,
              messages: current.data.conversation.messages.map((message) =>
                message.id === targetId
                  ? {
                      ...message,
                      comments: result.data.thread,
                    }
                  : message,
              ),
            },
          },
        };
      });
    } catch {
      setCommentErrorByTargetId((current) => ({
        ...current,
        [targetId]: copy.loadFailed,
      }));
    } finally {
      setSubmittingCommentTargetId(null);
    }
  }

  async function handleSaveSharedConversationSettings() {
    if (!session || !payload || !payload.ok || isMetadataSubmitting) {
      return;
    }

    setMetadataError(null);
    setIsMetadataSubmitting(true);

    try {
      const result = await updateWorkspaceSharedConversation(session.sessionToken, shareId, {
        title: draftTitle,
        status: draftStatus,
        pinned: draftPinned,
      });

      if (!result.ok) {
        if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
          clearAuthSession(window.sessionStorage);
          router.replace("/login");
          return;
        }

        setMetadataError(result.error.message);
        return;
      }

      setPayload((current) =>
        current && current.ok
          ? {
              ...current,
              data: {
                ...current.data,
                conversation: result.data,
              },
            }
          : current,
      );
    } catch {
      setMetadataError(copy.loadFailed);
    } finally {
      setIsMetadataSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="lead">{copy.checking}</p>;
  }

  if (error) {
    return (
      <div className="stack">
        <MainSectionNav showSecurity />
        <div className="notice error">{error}</div>
        <div className="actions">
          <Link className="secondary" href="/apps">
            {copy.back}
          </Link>
        </div>
      </div>
    );
  }

  if (!payload || !payload.ok) {
    return <p className="lead">{copy.loading}</p>;
  }

  const { conversation, share } = payload.data;
  const localizedApp = localizeWorkspaceApp(conversation.app, locale);
  const presenceSummary = summarizeWorkspacePresence(presence);
  const visibleViewers = presence?.viewers ?? [];
  const shareAccessLabel = describeShareAccess(locale, share.access);
  const canComment = share.access !== "read_only";
  const canEditConversation = share.access === "editor";
  const metadataChanged =
    draftTitle !== conversation.title ||
    draftStatus !== conversation.status ||
    draftPinned !== conversation.pinned;

  return (
    <div className="chat-surface stack">
      <MainSectionNav showSecurity />

      <header className="chat-header">
        <div>
          <span className="eyebrow">R12 Sharing</span>
          <h1>{conversation.title}</h1>
          <p className="lead">{copy.lead}</p>
        </div>
        <div className="workspace-badges">
          <span className="workspace-badge">{copy.shareLabel} {share.id}</span>
          <span className="workspace-badge">{copy.groupLabel} {share.group.name}</span>
          <span className="workspace-badge">{copy.accessLabel} {shareAccessLabel}</span>
          <span className="workspace-badge">{share.status}</span>
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
            <h2>{copy.sharedConversation}</h2>
            <p>{copy.sharedLead(share.group.name, shareAccessLabel)}</p>
          </div>
        </div>

        <div className="workspace-presence-section">
          <span className="chat-suggested-prompts-label">{copy.viewerPresence}</span>
          {visibleViewers.length > 0 ? (
            <div className="workspace-presence-list">
              {visibleViewers.map((viewer) => (
                <span
                  key={viewer.sessionId}
                  className={`workspace-presence-chip${
                    viewer.isCurrentUser ? " is-current" : ""
                  }`}
                >
                  <strong>
                    {viewer.displayName}
                    {viewer.isCurrentUser ? ` · ${copy.you}` : ""}
                  </strong>
                  <span className="workspace-presence-meta">
                    {describePresenceState(locale, viewer.state)} ·{" "}
                    {describePresenceSurface(locale, viewer.surface)}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="chat-presence-empty">{copy.noViewers}</p>
          )}
        </div>

        {canEditConversation ? (
          <section className="workspace-comment-thread">
            <div className="workspace-comment-thread-header">
              <h3>{copy.metadataTitle}</h3>
              <span>{shareAccessLabel}</span>
            </div>
            <p className="workspace-comment-helper">{copy.metadataLead}</p>
            <div className="share-panel-create">
              <label className="field">
                {copy.conversationTitle}
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />
              </label>
              <label className="field">
                {copy.conversationStatus}
                <select
                  value={draftStatus}
                  onChange={(event) =>
                    setDraftStatus(event.target.value as WorkspaceConversationStatus)
                  }
                >
                  <option value="active">{copy.active}</option>
                  <option value="archived">{copy.archived}</option>
                </select>
              </label>
              <label className="field">
                <input
                  type="checkbox"
                  checked={draftPinned}
                  onChange={(event) => setDraftPinned(event.target.checked)}
                />
                {' '}
                {copy.pinned}
              </label>
              {metadataError ? <div className="notice error">{metadataError}</div> : null}
              <button
                className="primary"
                type="button"
                onClick={() => void handleSaveSharedConversationSettings()}
                disabled={draftTitle.trim().length === 0 || !metadataChanged || isMetadataSubmitting}
              >
                {isMetadataSubmitting ? copy.savingMetadata : copy.saveMetadata}
              </button>
            </div>
          </section>
        ) : null}

        <div className="chat-placeholder">
          {conversation.messages.map((message) => (
            <article key={message.id} className={`chat-bubble ${message.role}`}>
              <div className="chat-bubble-meta">
                <span className="chat-bubble-label">
                  {describeSharedMessageLabel({
                    appName: localizedApp.name,
                    locale,
                    role: message.role,
                    toolName: message.toolName,
                    workspaceUser: copy.workspaceUser,
                  })}
                </span>
                <span className={`chat-bubble-status status-${message.status}`}>
                  {message.status}
                </span>
              </div>
              <ChatMarkdown content={message.content} />
              {message.toolCalls && message.toolCalls.length > 0 ? (
                <WorkspaceToolCallSummaryList
                  locale={locale}
                  title={copy.toolCalls}
                  toolCalls={message.toolCalls}
                />
              ) : null}
              {message.role === "assistant" &&
              message.status === "completed" &&
              message.suggestedPrompts &&
              message.suggestedPrompts.length > 0 ? (
                <div className="chat-suggested-prompts">
                  <span className="chat-suggested-prompts-label">
                    {copy.suggested}
                  </span>
                  <div className="chat-suggested-prompt-list">
                    {message.suggestedPrompts.map((prompt) => (
                      <span
                        key={`${message.id}-${prompt}`}
                        className="suggested-prompt-chip"
                      >
                        {prompt}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {message.safetySignals && message.safetySignals.length > 0 ? (
                <WorkspaceSafetySignalList
                  signals={message.safetySignals}
                  title={copy.safety}
                  publicView
                />
              ) : null}
              {message.citations && message.citations.length > 0 ? (
                <WorkspaceCitationList
                  citations={message.citations}
                  title={copy.citations}
                />
              ) : null}
              {message.attachments && message.attachments.length > 0 ? (
                <ul className="chat-attachment-list">
                  {message.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      {attachment.fileName} · {attachment.contentType} ·{" "}
                      {attachment.sizeBytes} B
                    </li>
                  ))}
                </ul>
              ) : null}
              {message.artifacts && message.artifacts.length > 0 ? (
                <div className="chat-artifact-section">
                  <span className="chat-suggested-prompts-label">
                    {copy.artifacts}
                  </span>
                  <WorkspaceArtifactLinkList
                    artifacts={message.artifacts}
                    conversationId={conversation.id}
                    shareId={share.id}
                    shareAccess={share.access}
                  />
                </div>
              ) : null}
              <WorkspaceCommentThread
                title={copy.comments}
                comments={message.comments ?? []}
                locale={locale}
                emptyText={copy.noComments}
                helperText={canComment ? copy.commentHint : undefined}
                textareaLabel={copy.commentInput}
                submitLabel={copy.addComment}
                submittingLabel={copy.addingComment}
                isSubmitting={submittingCommentTargetId === message.id}
                submitError={commentErrorByTargetId[message.id] ?? null}
                readOnly={!canComment}
                onSubmit={
                  canComment
                    ? async (content) => {
                        await handleCreateSharedComment(message.id, content);
                      }
                    : undefined
                }
              />
            </article>
          ))}
        </div>
      </section>

      <div className="actions">
        <Link className="secondary" href="/apps">
          {copy.back}
        </Link>
      </div>
    </div>
  );
}
