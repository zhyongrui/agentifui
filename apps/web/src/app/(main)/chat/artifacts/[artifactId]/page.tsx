"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useI18n } from "../../../../../components/i18n-provider";
import { MainSectionNav } from "../../../../../components/main-section-nav";
import { WorkspaceCommentThread } from "../../../../../components/workspace-comments";
import { SectionSkeleton } from "../../../../../components/section-state";
import {
  WorkspaceArtifactPreview,
  formatWorkspaceArtifactSize,
} from "../../../../../components/workspace-artifacts";
import {
  createWorkspaceComment,
  createWorkspaceSharedComment,
  downloadWorkspaceArtifact,
  fetchWorkspaceArtifact,
} from "../../../../../lib/apps-client";
import { clearAuthSession } from "../../../../../lib/auth-session";
import { useProtectedSession } from "../../../../../lib/use-protected-session";

function readSearchParam(value: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

export default function ArtifactPreviewPage() {
  const params = useParams<{ artifactId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, formatDateTime } = useI18n();
  const { session, isLoading } = useProtectedSession("/chat/artifacts");
  const [payload, setPayload] = useState<Awaited<
    ReturnType<typeof fetchWorkspaceArtifact>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const artifactId =
    typeof params?.artifactId === "string" ? params.artifactId.trim() : "";
  const conversationId = readSearchParam(searchParams.get("conversationId"));
  const runId = readSearchParam(searchParams.get("runId"));
  const shareId = readSearchParam(searchParams.get("shareId"));
  const shareAccess = readSearchParam(searchParams.get("shareAccess"));
  const canCommentFromShare = shareAccess === "commenter" || shareAccess === "editor";
  const copy =
    locale === "zh-CN"
      ? {
          missingId: "缺少产物标识。",
          loadFailed: "产物预览加载失败，请稍后重试。",
          downloadFailed: "产物下载失败，请稍后重试。",
          checking: "正在检查登录状态...",
          backToConversation: "返回会话",
          chatHistory: "对话历史",
          loading: "正在加载产物预览...",
          leadShared: "当前预览来自共享会话边界。",
          leadOwner: "当前预览来自所有者可见的工作台产物边界。",
          sharedPreview: "共享预览",
          artifactPreview: "产物预览",
          artifactId: "产物 ID",
          persistedLead: "保存在工作台产物边界下。",
          mimeType: "Mime 类型",
          created: "创建时间",
          updated: "更新时间",
          summary: "摘要",
          noSummary: "未记录摘要",
          source: "来源",
          download: "下载产物",
          downloading: "下载中...",
          renderedArtifact: "渲染后的产物",
          comments: "产物评论",
          commentInput: "评论内容",
          addComment: "添加评论",
          addingComment: "提交中...",
          noComments: "还没有评论，先记录一下复核意见。",
          commentMentionHint: "可用 @邮箱 提及已具备此共享会话访问权的协作者。",
          previewLead: '预览直接使用持久化产物载荷，而不是转录摘要，因此表格、JSON、文本、Markdown 和链接输出都可以复用同一路由渲染。',
          backToShared: "返回共享会话",
          backToApps: "返回应用工作台",
        }
      : {
          missingId: "Artifact id is missing.",
          loadFailed: "The artifact preview could not be loaded. Please retry.",
          downloadFailed: "The artifact download could not be completed. Please retry.",
          checking: "Checking your session...",
          backToConversation: "Back to conversation",
          chatHistory: "Chat history",
          loading: "Loading artifact preview...",
          leadShared: "This preview is being opened through a shared conversation boundary.",
          leadOwner: "This preview is being opened through the owner-scoped workspace artifact boundary.",
          sharedPreview: "Shared preview",
          artifactPreview: "Artifact preview",
          artifactId: "Artifact id",
          persistedLead: "Persisted under the workspace artifact boundary.",
          mimeType: "Mime type",
          created: "Created",
          updated: "Updated",
          summary: "Summary",
          noSummary: "No summary recorded",
          source: "Source",
          download: "Download artifact",
          downloading: "Downloading...",
          renderedArtifact: "Rendered artifact",
          comments: "Artifact comments",
          commentInput: "Comment",
          addComment: "Add comment",
          addingComment: "Saving...",
          noComments: "No comments yet.",
          commentMentionHint:
            "Use @email to mention collaborators who already have access to this shared conversation.",
          previewLead: 'The preview uses the persisted artifact payload, not the transcript summary, so tables, JSON, text, markdown, and link outputs can all render from the same workspace route.',
          backToShared: "Back to shared conversation",
          backToApps: "Back to Apps workspace",
        };

  useEffect(() => {
    if (!session || !artifactId) {
      setPayload(null);
      setError(artifactId ? null : copy.missingId);
      return;
    }

    let cancelled = false;

    void (async () => {
      setError(null);

      try {
        const result = await fetchWorkspaceArtifact(
          session.sessionToken,
          artifactId,
          {
            shareId,
          }
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
          setError(
            copy.loadFailed,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artifactId, router, session, shareId]);

  async function handleDownloadArtifact() {
    if (!session || !artifactId || isDownloading) {
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const result = await downloadWorkspaceArtifact(session.sessionToken, artifactId, {
        shareId,
      });

      if ("error" in result) {
        if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
          clearAuthSession(window.sessionStorage);
          router.replace("/login");
          return;
        }

        setDownloadError(result.error.message);
        return;
      }

      const objectUrl = window.URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = result.metadata.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadError(copy.downloadFailed);
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleCreateComment(content: string) {
    if (
      !session ||
      !artifactId ||
      ((!conversationId && !shareId) || isCommentSubmitting)
    ) {
      return;
    }

    setIsCommentSubmitting(true);
    setCommentError(null);

    try {
      const result = shareId
        ? await createWorkspaceSharedComment(session.sessionToken, shareId, {
            targetType: "artifact",
            targetId: artifactId,
            content,
          })
        : await createWorkspaceComment(session.sessionToken, conversationId!, {
            targetType: "artifact",
            targetId: artifactId,
            content,
          });

      if (!result.ok) {
        if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
          clearAuthSession(window.sessionStorage);
          router.replace("/login");
          return;
        }

        setCommentError(result.error.message);
        return;
      }

      setPayload((current) =>
        current && current.ok
          ? {
              ...current,
              data: {
                ...current.data,
                comments: result.data.thread,
              },
            }
          : current,
      );
    } catch {
      setCommentError(copy.loadFailed);
    } finally {
      setIsCommentSubmitting(false);
    }
  }

  if (isLoading) {
    return <SectionSkeleton blocks={4} lead={copy.checking} title={copy.artifactPreview} />;
  }

  if (error) {
    return (
      <div className="chat-surface stack">
        <MainSectionNav showSecurity />
        <div className="notice error">{error}</div>
        <div className="actions">
          {conversationId ? (
            <Link className="secondary" href={`/chat/${conversationId}`}>
              {copy.backToConversation}
            </Link>
          ) : null}
          <Link className="secondary" href="/chat">
            {copy.chatHistory}
          </Link>
        </div>
      </div>
    );
  }

  if (!payload || !payload.ok) {
    return <SectionSkeleton blocks={5} lead={copy.loading} title={copy.artifactPreview} />;
  }

  const artifact = payload.data;

  return (
    <div className="chat-surface stack">
      <MainSectionNav showSecurity />

      <header className="chat-header">
        <div>
          <span className="eyebrow">P2-B3 Artifact Preview</span>
          <h1>{artifact.title}</h1>
          <p className="lead">
            {shareId
              ? copy.leadShared
              : copy.leadOwner}
          </p>
        </div>
        <div className="workspace-badges">
          <span className="workspace-badge">{artifact.kind}</span>
          <span className="workspace-badge">{artifact.status}</span>
          <span className="workspace-badge">{artifact.source}</span>
          {shareId ? <span className="workspace-badge">{copy.sharedPreview}</span> : null}
          {runId ? <span className="workspace-badge">Run {runId}</span> : null}
        </div>
      </header>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>{copy.artifactPreview}</h2>
            <p>{copy.previewLead}</p>
          </div>
        </div>

        <div className="chat-meta-grid">
          <article className="chat-meta-card">
            <span>{copy.artifactId}</span>
            <strong>{artifact.id}</strong>
            <p>{copy.persistedLead}</p>
          </article>
          <article className="chat-meta-card">
            <span>{copy.mimeType}</span>
            <strong>{artifact.mimeType ?? "n/a"}</strong>
            <p>{formatWorkspaceArtifactSize(artifact.sizeBytes)}</p>
          </article>
          <article className="chat-meta-card">
            <span>{copy.created}</span>
            <strong>{formatDateTime(artifact.createdAt)}</strong>
            <p>{copy.updated} {formatDateTime(artifact.updatedAt)}</p>
          </article>
          <article className="chat-meta-card">
            <span>{copy.summary}</span>
            <strong>{artifact.summary ?? copy.noSummary}</strong>
            <p>{copy.source} {artifact.source}</p>
          </article>
        </div>

        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={() => void handleDownloadArtifact()}
            disabled={isDownloading}
          >
            {isDownloading ? copy.downloading : copy.download}
          </button>
          {downloadError ? <span className="chat-composer-hint">{downloadError}</span> : null}
        </div>

        <article className="chat-bubble assistant artifact-preview-surface">
          <div className="chat-bubble-meta">
            <span className="chat-bubble-label">{copy.renderedArtifact}</span>
            <span className={`chat-bubble-status status-${artifact.status}`}>
              {artifact.status}
            </span>
          </div>
          <WorkspaceArtifactPreview artifact={artifact} />
        </article>
        <WorkspaceCommentThread
          title={copy.comments}
          comments={artifact.comments ?? []}
          locale={locale}
          emptyText={copy.noComments}
          helperText={copy.commentMentionHint}
          textareaLabel={copy.commentInput}
          submitLabel={copy.addComment}
          submittingLabel={copy.addingComment}
          isSubmitting={isCommentSubmitting}
          submitError={commentError}
          readOnly={shareId ? !canCommentFromShare : false}
          onSubmit={shareId && !canCommentFromShare ? undefined : handleCreateComment}
        />
      </section>

      <div className="actions">
        {shareId ? (
          <Link className="secondary" href={`/chat/shared/${shareId}`}>
            {copy.backToShared}
          </Link>
        ) : null}
        {!shareId && conversationId ? (
          <Link className="secondary" href={`/chat/${conversationId}`}>
            {copy.backToConversation}
          </Link>
        ) : null}
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
