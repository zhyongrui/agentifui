'use client';

import type { WorkspaceConversation } from '@agentifui/shared/apps';
import type { ChatCompletionMessage, ChatGatewayErrorResponse } from '@agentifui/shared/chat';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

import { MainSectionNav } from '../../../../components/main-section-nav';
import { fetchWorkspaceConversation } from '../../../../lib/apps-client';
import { clearAuthSession } from '../../../../lib/auth-session';
import { createChatCompletion } from '../../../../lib/chat-client';
import { useProtectedSession } from '../../../../lib/use-protected-session';

type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

function toGatewayMessages(messages: ConversationMessage[]): ChatCompletionMessage[] {
  return messages.map(message => ({
    role: message.role,
    content: message.content,
  }));
}

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const { session, isLoading } = useProtectedSession('/chat');
  const [conversation, setConversation] = useState<WorkspaceConversation | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [lastTraceId, setLastTraceId] = useState<string | null>(null);
  const conversationId =
    typeof params?.conversationId === 'string' ? params.conversationId.trim() : '';

  async function loadConversation(
    sessionToken: string,
    options: {
      withSpinner: boolean;
    }
  ) {
    if (options.withSpinner) {
      setIsConversationLoading(true);
    }

    setConversationError(null);

    try {
      const result = await fetchWorkspaceConversation(sessionToken, conversationId);

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
      setLastTraceId(result.data.run.traceId);
    } catch {
      setConversation(null);
      setConversationError('Conversation bootstrap failed. Please retry from the apps workspace.');
    } finally {
      if (options.withSpinner) {
        setIsConversationLoading(false);
      }
    }
  }

  useEffect(() => {
    setMessages([]);
    setDraft('');
    setComposerError(null);
    setLastTraceId(null);
  }, [conversationId]);

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
        setLastTraceId(result.data.run.traceId);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextDraft = draft.trim();

    if (!session || !conversation || !nextDraft || isSending) {
      return;
    }

    const previousMessages = messages;
    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: nextDraft,
    };
    const nextMessages = [...previousMessages, userMessage];

    setComposerError(null);
    setMessages(nextMessages);
    setDraft('');
    setIsSending(true);

    try {
      const result = await createChatCompletion(
        session.sessionToken,
        {
          app_id: conversation.app.id,
          conversation_id: conversation.id,
          messages: toGatewayMessages(nextMessages),
          stream: false,
        },
        {
          activeGroupId: conversation.activeGroup.id,
        }
      );

      if ('error' in result) {
        const gatewayError = result as ChatGatewayErrorResponse;

        setMessages(previousMessages);
        setDraft(nextDraft);

        if (gatewayError.error.code === 'invalid_token') {
          clearAuthSession(window.sessionStorage);
          router.replace('/login');
          return;
        }

        if (gatewayError.error.code === 'conversation_not_found') {
          setConversationError('This conversation is no longer available. Return to the apps workspace and relaunch it.');
          return;
        }

        setComposerError(gatewayError.error.message);
        return;
      }

      const assistantContent = result.choices[0]?.message.content?.trim() || 'The gateway returned an empty assistant message.';

      setMessages([
        ...nextMessages,
        {
          id: result.id,
          role: 'assistant',
          content: assistantContent,
        },
      ]);
      setLastTraceId(result.trace_id);

      await loadConversation(session.sessionToken, {
        withSpinner: false,
      });
    } catch {
      setMessages(previousMessages);
      setDraft(nextDraft);
      setComposerError('The chat gateway request failed. Please retry.');
    } finally {
      setIsSending(false);
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

  return (
    <div className="chat-surface stack">
      <MainSectionNav showSecurity />

      <header className="chat-header">
        <div>
          <span className="eyebrow">R7 Gateway Protocol</span>
          <h1>{conversation.title}</h1>
          <p className="lead">
            The workspace launch shell is now wired into `/v1/chat/completions`. This page uses
            blocking completions today and leaves SSE rendering for the next UI slice.
          </p>
        </div>
        <div className="workspace-badges">
          <span className="workspace-badge">Conversation {conversation.id}</span>
          <span className="workspace-badge">Run {conversation.run.id}</span>
          <span className="workspace-badge">Trace {lastTraceId ?? conversation.run.traceId}</span>
        </div>
      </header>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Gateway context</h2>
            <p>
              The gateway now validates the workspace session, resolves the persisted conversation,
              returns an OpenAI-compatible payload and keeps the trace id stable.
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
            <h2>Conversation</h2>
            <p>
              Send a prompt to exercise the new gateway path. The current transcript is local UI
              state; message persistence lands in the next execution slice.
            </p>
          </div>
        </div>

        {composerError ? <div className="notice error">{composerError}</div> : null}

        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <strong>No messages yet.</strong>
            <p>Start with a prompt like "Summarize the current policy changes for my team."</p>
          </div>
        ) : (
          <div className="chat-placeholder">
            {messages.map(message => (
              <article key={message.id} className={`chat-bubble ${message.role}`}>
                <span className="chat-bubble-label">
                  {message.role === 'user' ? session.user.displayName : conversation.app.name}
                </span>
                <p>{message.content}</p>
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
            className="chat-composer-input"
            rows={4}
            placeholder={`Ask ${conversation.app.name} to work on something concrete...`}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            disabled={isSending}
          />
          <div className="actions">
            <button className="primary" type="submit" disabled={isSending || draft.trim().length === 0}>
              {isSending ? 'Sending...' : 'Send message'}
            </button>
          </div>
        </form>
      </section>

      <div className="actions">
        <Link className="secondary" href="/apps">
          Back to Apps workspace
        </Link>
      </div>
    </div>
  );
}
