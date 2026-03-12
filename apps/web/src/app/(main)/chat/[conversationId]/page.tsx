'use client';

import type {
  WorkspaceConversation,
  WorkspaceConversationMessage,
} from '@agentifui/shared/apps';
import type { ChatCompletionMessage, ChatGatewayErrorResponse } from '@agentifui/shared/chat';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';

import { MainSectionNav } from '../../../../components/main-section-nav';
import { fetchWorkspaceConversation } from '../../../../lib/apps-client';
import { clearAuthSession } from '../../../../lib/auth-session';
import { stopChatCompletion, streamChatCompletion } from '../../../../lib/chat-client';
import { useProtectedSession } from '../../../../lib/use-protected-session';

function toGatewayMessages(messages: WorkspaceConversationMessage[]): ChatCompletionMessage[] {
  return messages.map(message => ({
    role: message.role,
    content: message.content,
  }));
}

function isGatewayErrorResponse(error: unknown): error is ChatGatewayErrorResponse {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as { error?: unknown }).error === 'object'
  );
}

function buildLocalMessage(
  input: Pick<WorkspaceConversationMessage, 'role' | 'content' | 'status'>
): WorkspaceConversationMessage {
  return {
    id: `local_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    role: input.role,
    content: input.content,
    status: input.status,
    createdAt: new Date().toISOString(),
  };
}

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const { session, isLoading } = useProtectedSession('/chat');
  const [conversation, setConversation] = useState<WorkspaceConversation | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [messages, setMessages] = useState<WorkspaceConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [lastTraceId, setLastTraceId] = useState<string | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);
  const conversationId =
    typeof params?.conversationId === 'string' ? params.conversationId.trim() : '';

  async function loadConversation(
    sessionToken: string,
    options: {
      withSpinner: boolean;
      syncMessages: boolean;
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

      if (options.syncMessages) {
        setMessages(result.data.messages);
      }
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
    activeAssistantMessageIdRef.current = null;
    stopRequestedRef.current = false;
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
        setMessages(result.data.messages);
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

    if (!session || !conversation || !nextDraft || isStreaming) {
      return;
    }

    const userMessage = buildLocalMessage({
      role: 'user',
      content: nextDraft,
      status: 'completed',
    });
    const assistantMessage = buildLocalMessage({
      role: 'assistant',
      content: '',
      status: 'streaming',
    });
    const nextMessages = [...messages, userMessage];

    activeAssistantMessageIdRef.current = assistantMessage.id;
    stopRequestedRef.current = false;
    setComposerError(null);
    setDraft('');
    setIsStreaming(true);
    setIsStopping(false);
    setMessages([...nextMessages, assistantMessage]);
    setConversation(currentConversation =>
      currentConversation
        ? {
            ...currentConversation,
            run: {
              ...currentConversation.run,
              status: 'running',
            },
          }
        : currentConversation
    );

    try {
      await streamChatCompletion(
        session.sessionToken,
        {
          app_id: conversation.app.id,
          conversation_id: conversation.id,
          messages: toGatewayMessages(nextMessages),
        },
        {
          onMetadata: metadata => {
            setLastTraceId(metadata.traceId);
          },
          onChunk: chunk => {
            if (chunk.trace_id) {
              setLastTraceId(chunk.trace_id);
            }

            const delta = chunk.choices[0]?.delta;
            const finishReason = chunk.choices[0]?.finish_reason;

            if (delta?.content) {
              setMessages(currentMessages =>
                currentMessages.map(message =>
                  message.id === activeAssistantMessageIdRef.current
                    ? {
                        ...message,
                        content: `${message.content}${delta.content ?? ''}`,
                        status: 'streaming',
                      }
                    : message
                )
              );
            }

            if (finishReason) {
              setMessages(currentMessages =>
                currentMessages.map(message =>
                  message.id === activeAssistantMessageIdRef.current
                    ? {
                        ...message,
                        status: stopRequestedRef.current ? 'stopped' : 'completed',
                      }
                    : message
                )
              );
            }
          },
        },
        {
          activeGroupId: conversation.activeGroup.id,
        }
      );

      await loadConversation(session.sessionToken, {
        withSpinner: false,
        syncMessages: true,
      });
    } catch (error) {
      if (isGatewayErrorResponse(error)) {
        if (error.error.code === 'invalid_token') {
          clearAuthSession(window.sessionStorage);
          router.replace('/login');
          return;
        }

        if (error.error.code === 'conversation_not_found') {
          setConversationError(
            'This conversation is no longer available. Return to the apps workspace and relaunch it.'
          );
          return;
        }

        setComposerError(error.error.message);
      } else {
        setComposerError('The chat gateway stream failed. Please retry.');
      }

      setMessages(currentMessages =>
        currentMessages
          .filter(message => message.id !== activeAssistantMessageIdRef.current)
          .map(message =>
            message.id === activeAssistantMessageIdRef.current
              ? {
                  ...message,
                  status: 'failed',
                }
              : message
          )
      );
      setConversation(currentConversation =>
        currentConversation
          ? {
              ...currentConversation,
              run: {
                ...currentConversation.run,
                status: 'failed',
              },
            }
          : currentConversation
      );
    } finally {
      activeAssistantMessageIdRef.current = null;
      stopRequestedRef.current = false;
      setIsStreaming(false);
      setIsStopping(false);
    }
  }

  async function handleStop() {
    if (!session || !conversation || !isStreaming || isStopping) {
      return;
    }

    setComposerError(null);
    setIsStopping(true);
    stopRequestedRef.current = true;

    try {
      const result = await stopChatCompletion(session.sessionToken, conversation.run.id);

      if ('error' in result) {
        setComposerError(result.error.message);
        stopRequestedRef.current = false;
      }
    } catch {
      setComposerError('The stop request failed. Please retry.');
      stopRequestedRef.current = false;
    } finally {
      setIsStopping(false);
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
          <span className="eyebrow">R8 Streaming Chat</span>
          <h1>{conversation.title}</h1>
          <p className="lead">
            The conversation surface now consumes the gateway SSE stream directly, exposes a stop
            action and restores transcript history from persisted workspace state.
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
              Streaming updates now arrive incrementally from `/v1/chat/completions`, and the
              restored transcript comes from the persisted workspace conversation payload.
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
            <span>Transcript</span>
            <strong>{messages.length} messages</strong>
            <p>History is rehydrated from the workspace conversation response.</p>
          </article>
        </div>
      </section>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Conversation</h2>
            <p>
              Send a prompt to stream an assistant response. Refreshing the page now reloads the
              transcript from the persisted conversation record.
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
                <div className="chat-bubble-meta">
                  <span className="chat-bubble-label">
                    {message.role === 'user' ? session.user.displayName : conversation.app.name}
                  </span>
                  <span className={`chat-bubble-status status-${message.status}`}>
                    {message.status}
                  </span>
                </div>
                <p>{message.content || (message.status === 'streaming' ? 'Streaming...' : '')}</p>
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
            disabled={isStreaming}
          />
          <div className="actions">
            <button
              className="primary"
              type="submit"
              disabled={isStreaming || draft.trim().length === 0}
            >
              {isStreaming ? 'Streaming...' : 'Send message'}
            </button>
            {isStreaming ? (
              <button
                className="secondary"
                type="button"
                onClick={handleStop}
                disabled={isStopping}
              >
                {isStopping ? 'Stopping...' : 'Stop response'}
              </button>
            ) : null}
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
