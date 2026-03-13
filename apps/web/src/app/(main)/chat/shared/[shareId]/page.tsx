'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { MainSectionNav } from '../../../../../components/main-section-nav';
import { fetchWorkspaceSharedConversation } from '../../../../../lib/apps-client';
import { clearAuthSession } from '../../../../../lib/auth-session';
import { useProtectedSession } from '../../../../../lib/use-protected-session';

export default function SharedConversationPage() {
  const params = useParams<{ shareId: string }>();
  const router = useRouter();
  const { session, isLoading } = useProtectedSession('/chat/shared');
  const [payload, setPayload] = useState<Awaited<
    ReturnType<typeof fetchWorkspaceSharedConversation>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shareId = typeof params?.shareId === 'string' ? params.shareId.trim() : '';

  useEffect(() => {
    if (!session || !shareId) {
      setPayload(null);
      setError(shareId ? null : 'Share id is missing.');
      return;
    }

    let cancelled = false;

    void (async () => {
      setError(null);

      try {
        const result = await fetchWorkspaceSharedConversation(session.sessionToken, shareId);

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          if (result.error.code === 'WORKSPACE_UNAUTHORIZED') {
            clearAuthSession(window.sessionStorage);
            router.replace('/login');
            return;
          }

          setError(result.error.message);
          return;
        }

        setPayload(result);
      } catch {
        if (!cancelled) {
          setError('The shared conversation could not be loaded. Please retry.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, session, shareId]);

  if (isLoading) {
    return <p className="lead">Checking your session...</p>;
  }

  if (error) {
    return (
      <div className="stack">
        <MainSectionNav showSecurity />
        <div className="notice error">{error}</div>
        <div className="actions">
          <Link className="secondary" href="/apps">
            Back to Apps workspace
          </Link>
        </div>
      </div>
    );
  }

  if (!payload || !payload.ok) {
    return <p className="lead">Loading shared conversation...</p>;
  }

  const { conversation, share } = payload.data;

  return (
    <div className="chat-surface stack">
      <MainSectionNav showSecurity />

      <header className="chat-header">
        <div>
          <span className="eyebrow">R12 Sharing</span>
          <h1>{conversation.title}</h1>
          <p className="lead">
            This is a read-only shared workspace conversation. You can inspect the transcript and
            attached files, but you cannot send new messages from this surface.
          </p>
        </div>
        <div className="workspace-badges">
          <span className="workspace-badge">Share {share.id}</span>
          <span className="workspace-badge">Group {share.group.name}</span>
          <span className="workspace-badge">{share.status}</span>
        </div>
      </header>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Shared conversation</h2>
            <p>This transcript is currently shared read-only with {share.group.name}.</p>
          </div>
        </div>

        <div className="chat-placeholder">
          {conversation.messages.map(message => (
            <article key={message.id} className={`chat-bubble ${message.role}`}>
              <div className="chat-bubble-meta">
                <span className="chat-bubble-label">
                  {message.role === 'user' ? 'Workspace user' : conversation.app.name}
                </span>
                <span className={`chat-bubble-status status-${message.status}`}>
                  {message.status}
                </span>
              </div>
              <p>{message.content}</p>
              {message.attachments && message.attachments.length > 0 ? (
                <ul className="chat-attachment-list">
                  {message.attachments.map(attachment => (
                    <li key={attachment.id}>
                      {attachment.fileName} · {attachment.contentType} · {attachment.sizeBytes} B
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <div className="actions">
        <Link className="secondary" href="/apps">
          Back to Apps workspace
        </Link>
      </div>
    </div>
  );
}
