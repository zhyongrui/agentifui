'use client';

import {
  WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES,
  WORKSPACE_ATTACHMENT_MAX_BYTES,
} from '@agentifui/shared/apps';
import type {
  WorkspaceConversation,
  WorkspaceConversationAttachment,
  WorkspaceConversationMessage,
  WorkspaceRun,
  WorkspaceRunSummary,
} from '@agentifui/shared/apps';
import type { ChatCompletionMessage, ChatGatewayErrorResponse } from '@agentifui/shared/chat';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { MainSectionNav } from '../../../../components/main-section-nav';
import {
  fetchWorkspaceConversation,
  fetchWorkspaceConversationRuns,
  fetchWorkspaceRun,
  uploadWorkspaceConversationFile,
} from '../../../../lib/apps-client';
import { clearAuthSession } from '../../../../lib/auth-session';
import { stopChatCompletion, streamChatCompletion } from '../../../../lib/chat-client';
import { useProtectedSession } from '../../../../lib/use-protected-session';

function toGatewayMessages(messages: WorkspaceConversationMessage[]): ChatCompletionMessage[] {
  return messages.map(message => ({
    role: message.role,
    content: message.content,
  }));
}

function toGatewayFileReferences(attachments: WorkspaceConversationAttachment[]) {
  return attachments.map(attachment => ({
    type: 'local' as const,
    file_id: attachment.id,
    transfer_method: 'local_file' as const,
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
  input: Pick<WorkspaceConversationMessage, 'role' | 'content' | 'status'> & {
    attachments?: WorkspaceConversationAttachment[];
  }
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
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .flatMap(part => {
      if (typeof part !== 'object' || part === null) {
        return [];
      }

      const value = part as Record<string, unknown>;
      return value.type === 'text' && typeof value.text === 'string' ? [value.text] : [];
    })
    .join('\n');
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
    attachment =>
      `${attachment.fileName} (${attachment.contentType}, ${formatAttachmentSize(attachment.sizeBytes)})`
  );
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function buildReplayMessages(run: WorkspaceRun): Array<{ id: string; role: string; content: string }> {
  const rawMessages = run.inputs.messages;

  if (!Array.isArray(rawMessages)) {
    return [];
  }

  return rawMessages.flatMap((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const message = entry as Record<string, unknown>;

    if (typeof message.role !== 'string') {
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

  if (typeof assistant !== 'object' || assistant === null) {
    return '';
  }

  const content = (assistant as Record<string, unknown>).content;

  return typeof content === 'string' ? content : '';
}

function buildReplayAttachments(run: WorkspaceRun): WorkspaceConversationAttachment[] {
  const rawAttachments = run.inputs.attachments;

  if (!Array.isArray(rawAttachments)) {
    return [];
  }

  return rawAttachments.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const attachment = entry as Record<string, unknown>;

    if (
      typeof attachment.id !== 'string' ||
      typeof attachment.fileName !== 'string' ||
      typeof attachment.contentType !== 'string' ||
      typeof attachment.sizeBytes !== 'number' ||
      typeof attachment.uploadedAt !== 'string'
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

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const { session, isLoading } = useProtectedSession('/chat');
  const [conversation, setConversation] = useState<WorkspaceConversation | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [messages, setMessages] = useState<WorkspaceConversationMessage[]>([]);
  const [runs, setRuns] = useState<WorkspaceRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<WorkspaceRun | null>(null);
  const [draft, setDraft] = useState('');
  const [draftAttachments, setDraftAttachments] = useState<WorkspaceConversationAttachment[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [isAwaitingRunMetadata, setIsAwaitingRunMetadata] = useState(false);
  const [lastTraceId, setLastTraceId] = useState<string | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);
  const conversationId =
    typeof params?.conversationId === 'string' ? params.conversationId.trim() : '';

  async function loadRunDetail(sessionToken: string, runId: string) {
    const result = await fetchWorkspaceRun(sessionToken, runId);

    if (!result.ok) {
      setSelectedRun(null);
      return;
    }

    setSelectedRun(result.data);
  }

  async function loadRunTracking(sessionToken: string, preferredRunId?: string | null) {
    const result = await fetchWorkspaceConversationRuns(sessionToken, conversationId);

    if (!result.ok) {
      setRuns([]);
      setSelectedRun(null);
      return;
    }

    setRuns(result.data.runs);

    const nextRunId = preferredRunId ?? selectedRun?.id ?? result.data.runs[0]?.id ?? null;

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
      activeRunIdRef.current = result.data.run.id;

      if (options.syncMessages) {
        setMessages(result.data.messages);
      }

      await loadRunTracking(sessionToken, options.preferredRunId ?? result.data.run.id);
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
    setRuns([]);
    setSelectedRun(null);
    setDraft('');
    setDraftAttachments([]);
    setComposerError(null);
    setLastTraceId(null);
    activeAssistantMessageIdRef.current = null;
    activeRunIdRef.current = null;
    stopRequestedRef.current = false;
    setIsUploadingAttachments(false);
    setIsAwaitingRunMetadata(false);
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

    loadConversation(session.sessionToken, {
      withSpinner: false,
      syncMessages: true,
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

  async function handleAttachmentSelect(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (!session || !conversation || selectedFiles.length === 0) {
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
          !(WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES as readonly string[]).includes(contentType)
        ) {
          setComposerError(`Unsupported attachment type: ${file.name}.`);
          continue;
        }

        if (file.size > WORKSPACE_ATTACHMENT_MAX_BYTES) {
          setComposerError(
            `${file.name} exceeds the ${formatAttachmentSize(WORKSPACE_ATTACHMENT_MAX_BYTES)} limit.`
          );
          continue;
        }

        const result = await uploadWorkspaceConversationFile(session.sessionToken, conversation.id, {
          fileName: file.name,
          contentType,
          base64Data: await fileToBase64(file),
        });

        if (!result.ok) {
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
            setConversationError(
              'This conversation is no longer available. Return to the apps workspace and relaunch it.'
            );
            return;
          }

          setComposerError(result.error.message);
          continue;
        }

        uploadedAttachments.push(result.data);
      }

      if (uploadedAttachments.length > 0) {
        setDraftAttachments(currentAttachments => [...currentAttachments, ...uploadedAttachments]);
      }
    } catch {
      setComposerError('The attachment upload failed. Please retry.');
    } finally {
      setIsUploadingAttachments(false);
    }
  }

  function handleAttachmentRemove(attachmentId: string) {
    setDraftAttachments(currentAttachments =>
      currentAttachments.filter(attachment => attachment.id !== attachmentId)
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextDraft = draft.trim();
    const nextAttachments = draftAttachments;

    if (
      !session ||
      !conversation ||
      isStreaming ||
      isUploadingAttachments ||
      (nextDraft.length === 0 && nextAttachments.length === 0)
    ) {
      return;
    }

    const messageContent =
      nextDraft.length > 0
        ? nextDraft
        : `Attached ${nextAttachments.length} file${nextAttachments.length === 1 ? '' : 's'}.`;
    const userMessage = buildLocalMessage({
      role: 'user',
      content: messageContent,
      status: 'completed',
      attachments: nextAttachments,
    });
    const assistantMessage = buildLocalMessage({
      role: 'assistant',
      content: '',
      status: 'streaming',
    });
    const nextMessages = [...messages, userMessage];

    activeAssistantMessageIdRef.current = assistantMessage.id;
    activeRunIdRef.current = null;
    stopRequestedRef.current = false;
    setComposerError(null);
    setDraft('');
    setDraftAttachments([]);
    setIsStreaming(true);
    setIsStopping(false);
    setIsAwaitingRunMetadata(true);
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
          files: toGatewayFileReferences(nextAttachments),
        },
        {
          onMetadata: metadata => {
            setLastTraceId(metadata.traceId);
            activeRunIdRef.current = metadata.runId;
            setIsAwaitingRunMetadata(false);
            setConversation(currentConversation =>
              currentConversation
                ? {
                    ...currentConversation,
                    run: {
                      ...currentConversation.run,
                      id: metadata.runId,
                      traceId: metadata.traceId,
                      status: 'running',
                      triggeredFrom: 'chat_completion',
                    },
                  }
                : currentConversation
            );
          },
          onChunk: chunk => {
            activeRunIdRef.current = chunk.id;
            setIsAwaitingRunMetadata(false);

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
        preferredRunId: activeRunIdRef.current,
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
        currentMessages.filter(message => message.id !== activeAssistantMessageIdRef.current)
      );
      setConversation(currentConversation =>
        currentConversation
          ? {
              ...currentConversation,
              run: {
                ...currentConversation.run,
                id: activeRunIdRef.current ?? currentConversation.run.id,
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
      setIsAwaitingRunMetadata(false);
    }
  }

  async function handleStop() {
    if (!session || !conversation || !isStreaming || isStopping) {
      return;
    }

    const runId = activeRunIdRef.current;

    if (!runId) {
      setComposerError('The active run is still initializing. Retry stop in a moment.');
      return;
    }

    setComposerError(null);
    setIsStopping(true);
    stopRequestedRef.current = true;

    try {
      const result = await stopChatCompletion(session.sessionToken, runId);

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

  async function handleRunSelect(runId: string) {
    if (!session) {
      return;
    }

    await loadRunDetail(session.sessionToken, runId);
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
  const replayAssistant = selectedRun ? buildAssistantReplay(selectedRun) : '';
  const replayAttachments = selectedRun ? buildReplayAttachments(selectedRun) : [];

  return (
    <div className="chat-surface stack">
      <MainSectionNav showSecurity />

      <header className="chat-header">
        <div>
          <span className="eyebrow">R12 Attachments</span>
          <h1>{conversation.title}</h1>
          <p className="lead">
            The conversation surface now keeps independent runs per completion, supports live stop
            control and can bind uploaded workspace attachments onto the persisted chat boundary.
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
              The latest conversation snapshot still comes from workspace state, and each
              completion now lands in its own queryable run record.
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
            <p>
              Type: {conversation.run.type} · Trigger: {conversation.run.triggeredFrom}
            </p>
          </article>
          <article className="chat-meta-card">
            <span>Transcript</span>
            <strong>{messages.length} messages</strong>
            <p>History is rehydrated from the workspace conversation response.</p>
          </article>
          <article className="chat-meta-card">
            <span>Run history</span>
            <strong>{runs.length} runs</strong>
            <p>Each completion is now tracked separately for replay.</p>
          </article>
        </div>
      </section>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Conversation</h2>
            <p>
              Send a prompt to stream an assistant response. Refreshing the page now reloads both
              the transcript and the latest run from persisted workspace state.
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
                {message.attachments && message.attachments.length > 0 ? (
                  <ul className="chat-attachment-list">
                    {message.attachments.map(attachment => (
                      <li key={attachment.id}>
                        {attachment.fileName} · {attachment.contentType} ·{' '}
                        {formatAttachmentSize(attachment.sizeBytes)}
                      </li>
                    ))}
                  </ul>
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
            className="chat-composer-input"
            rows={4}
            placeholder={`Ask ${conversation.app.name} to work on something concrete...`}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            disabled={isStreaming}
          />
          <label className="field" htmlFor="chat-attachment">
            Attachments
          </label>
          <input
            id="chat-attachment"
            type="file"
            multiple
            accept={WORKSPACE_ATTACHMENT_ACCEPTED_CONTENT_TYPES.join(',')}
            onChange={event => void handleAttachmentSelect(event)}
            disabled={isStreaming || isUploadingAttachments}
          />
          <p className="chat-composer-hint">
            Up to {formatAttachmentSize(WORKSPACE_ATTACHMENT_MAX_BYTES)} per file. Supported: text,
            JSON, CSV, PDF, PNG, JPEG, WEBP, GIF.
          </p>
          {draftAttachments.length > 0 ? (
            <div className="chat-attachment-draft-list">
              {draftAttachments.map(attachment => (
                <div key={attachment.id} className="chat-attachment-chip">
                  <span>{attachmentsToText([attachment])[0]}</span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleAttachmentRemove(attachment.id)}
                    disabled={isStreaming}
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
                isUploadingAttachments ||
                (draft.trim().length === 0 && draftAttachments.length === 0)
              }
            >
              {isUploadingAttachments
                ? 'Uploading...'
                : isStreaming
                  ? 'Streaming...'
                  : 'Send message'}
            </button>
            {isStreaming ? (
              <button
                className="secondary"
                type="button"
                onClick={handleStop}
                disabled={isStopping || isAwaitingRunMetadata}
              >
                {isStopping
                  ? 'Stopping...'
                  : isAwaitingRunMetadata
                    ? 'Starting...'
                    : 'Stop response'}
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
              Queryable run records are ordered newest first. Select one to inspect the stored
              request snapshot, assistant output and usage counters.
            </p>
          </div>
        </div>

        <div className="run-history-grid">
          <div className="run-history-list">
            {runs.length === 0 ? (
              <div className="chat-empty-state">
                <strong>No runs recorded yet.</strong>
                <p>The first completion will create the initial replayable run record.</p>
              </div>
            ) : (
              runs.map(run => (
                <button
                  key={run.id}
                  type="button"
                  className={`run-history-item ${selectedRun?.id === run.id ? 'selected' : ''}`}
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
                      Prompt {selectedRun.usage.promptTokens} · Completion{' '}
                      {selectedRun.usage.completionTokens}
                    </p>
                  </article>
                  <article className="chat-meta-card">
                    <span>Timing</span>
                    <strong>{selectedRun.elapsedTime} ms</strong>
                    <p>{selectedRun.finishedAt ?? 'in progress'}</p>
                  </article>
                  <article className="chat-meta-card">
                    <span>Attached files</span>
                    <strong>{replayAttachments.length}</strong>
                    <p>Run inputs keep attachment metadata for replay and follow-on audit work.</p>
                  </article>
                </div>

                <div className="run-replay-stack">
                  <article className="chat-bubble user">
                    <div className="chat-bubble-meta">
                      <span className="chat-bubble-label">Prompt snapshot</span>
                      <span className={`chat-bubble-status status-${selectedRun.status}`}>
                        {selectedRun.status}
                      </span>
                    </div>
                    <p>
                      {replayMessages.map(message => `${message.role}: ${message.content}`).join('\n\n') ||
                        'No prompt snapshot was stored for this run.'}
                    </p>
                  </article>
                  {replayAttachments.length > 0 ? (
                    <article className="chat-bubble user">
                      <div className="chat-bubble-meta">
                        <span className="chat-bubble-label">Attached files</span>
                        <span className={`chat-bubble-status status-${selectedRun.status}`}>
                          {selectedRun.status}
                        </span>
                      </div>
                      <p>{attachmentsToText(replayAttachments).join('\n')}</p>
                    </article>
                  ) : null}
                  <article className="chat-bubble assistant">
                    <div className="chat-bubble-meta">
                      <span className="chat-bubble-label">Assistant output</span>
                      <span className={`chat-bubble-status status-${selectedRun.status}`}>
                        {selectedRun.status}
                      </span>
                    </div>
                    <p>{replayAssistant || 'No assistant output was stored for this run.'}</p>
                  </article>
                </div>
              </>
            ) : (
              <div className="chat-empty-state">
                <strong>Select a run.</strong>
                <p>The latest run will be loaded automatically after the first completion.</p>
              </div>
            )}
          </div>
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
