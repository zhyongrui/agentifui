'use client';

import type { WorkspaceConversation } from '@agentifui/shared/apps';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { MainSectionNav } from '../../../../components/main-section-nav';
import { fetchWorkspaceConversation } from '../../../../lib/apps-client';
import { clearAuthSession } from '../../../../lib/auth-session';
import { useProtectedSession } from '../../../../lib/use-protected-session';

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const { session, isLoading } = useProtectedSession('/chat');
  const [conversation, setConversation] = useState<WorkspaceConversation | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const conversationId =
    typeof params?.conversationId === 'string' ? params.conversationId.trim() : '';

  useEffect(() => {
    if (!session || !conversationId) {
      setConversation(null);
      setConversationError(conversationId ? null : 'Conversation id is missing.');
      return;
    }

    let isCancelled = false;

    setIsConversationLoading(true);
    setConversationError(null);

    fetchWorkspaceConversation(session.sessionToken, conversationId)
      .then(result => {
        if (isCancelled) {
          return;
        }

        if (!result.ok) {
          setConversation(null);

          if (result.error.code === 'WORKSPACE_UNAUTHORIZED') {
            clearAuthSession(window.sessionStorage);
            router.replace('/login');
            return;
          }

          if (result.error.code === 'WORKSPACE_FORBIDDEN') {
            router.replace('/auth/pending');
            return;
          }

          if (result.error.code === 'WORKSPACE_NOT_FOUND') {
            setConversationError('The requested workspace conversation could not be found.');
            return;
          }

          setConversationError(result.error.message);
          return;
        }

        setConversation(result.data);
      })
      .catch(() => {
        if (!isCancelled) {
          setConversation(null);
          setConversationError('Conversation bootstrap failed. Please retry from the apps workspace.');
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

  return (
    <div className="chat-surface stack">
      <MainSectionNav showSecurity />

      <header className="chat-header">
        <div>
          <span className="eyebrow">R6-B Conversation Surface</span>
          <h1>{conversation.title}</h1>
          <p className="lead">
            {conversation.app.name} has been promoted from workspace launch into a real conversation
            shell. Full streaming chat and message history will land in `S2-2`.
          </p>
        </div>
        <div className="workspace-badges">
          <span className="workspace-badge">Conversation {conversation.id}</span>
          <span className="workspace-badge">Run {conversation.run.id}</span>
          <span className="workspace-badge">Trace {conversation.run.traceId}</span>
        </div>
      </header>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Bootstrap context</h2>
            <p>
              The launch flow created the conversation, active group attribution and initial run
              record.
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
            <span>Run status</span>
            <strong>{conversation.run.status}</strong>
            <p>Type: {conversation.run.type}</p>
          </article>
          <article className="chat-meta-card">
            <span>Launch source</span>
            <strong>{conversation.launchId ?? 'n/a'}</strong>
            <p>Created at {new Date(conversation.createdAt).toLocaleString()}</p>
          </article>
        </div>
      </section>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Next slice placeholder</h2>
            <p>The message stream is not connected yet, but the IDs needed by `S2-2 / S2-3` exist.</p>
          </div>
        </div>

        <div className="chat-placeholder">
          <article className="chat-bubble user">
            <span className="chat-bubble-label">{session.user.displayName}</span>
            <p>Workspace launch created this conversation shell for {conversation.app.name}.</p>
          </article>
          <article className="chat-bubble assistant">
            <span className="chat-bubble-label">System</span>
            <p>
              The conversation is ready. Streaming responses, message persistence and run progress
              will be attached in the next stage.
            </p>
          </article>
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
