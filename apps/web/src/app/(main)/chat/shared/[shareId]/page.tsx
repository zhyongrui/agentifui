"use client";

import type { WorkspaceConversationPresence } from "@agentifui/shared/apps";
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
  fetchWorkspaceSharedConversation,
  fetchWorkspaceSharedConversationPresence,
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
            "这是一个只读共享工作台会话。你可以查看转录、附件和持久化产物，但不能在这里发送新消息。",
          shareLabel: "共享",
          groupLabel: "群组",
          sharedConversation: "共享会话",
          sharedLead: (groupName: string) => `这段转录当前以只读方式共享给 ${groupName}。`,
          workspaceUser: "工作台用户",
          toolCalls: "工具调用",
          suggested: "建议的下一步提问",
          comments: "共享评论",
          noComments: "当前没有共享评论。",
          safety: "共享安全提示",
          citations: "共享引用",
          artifacts: "共享产物",
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
            "This is a read-only shared workspace conversation. You can inspect the transcript, attachments, and persisted artifacts, but you cannot send new messages from this surface.",
          shareLabel: "Share",
          groupLabel: "Group",
          sharedConversation: "Shared conversation",
          sharedLead: (groupName: string) =>
            `This transcript is currently shared read-only with ${groupName}.`,
          workspaceUser: "Workspace user",
          toolCalls: "Tool calls",
          suggested: "Suggested next prompts",
          comments: "Shared comments",
          noComments: "No shared comments yet.",
          safety: "Shared safety signals",
          citations: "Shared citations",
          artifacts: "Shared artifacts",
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
            <p>{copy.sharedLead(share.group.name)}</p>
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
                  />
                </div>
              ) : null}
              <WorkspaceCommentThread
                title={copy.comments}
                comments={message.comments ?? []}
                locale={locale}
                emptyText={copy.noComments}
                textareaLabel={copy.comments}
                submitLabel={copy.comments}
                submittingLabel={copy.comments}
                readOnly
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
