'use client';

import type {
  WorkspaceApp,
  WorkspaceConversationListAttachmentFilter,
  WorkspaceConversationListFeedbackFilter,
  WorkspaceConversationListItem,
  WorkspaceConversationListStatusFilter,
  WorkspaceGroup,
} from '@agentifui/shared/apps';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useState } from 'react';

import { MainSectionNav } from '../../../components/main-section-nav';
import { WorkspaceRuntimeDegradedBanner } from '../../../components/workspace-runtime-health';
import {
  fetchWorkspaceCatalog,
  fetchWorkspaceConversationList,
  updateWorkspaceConversation,
} from '../../../lib/apps-client';
import { clearAuthSession } from '../../../lib/auth-session';
import {
  fetchGatewayHealth,
  type GatewayRuntimeHealthSnapshot,
} from '../../../lib/gateway-health-client';
import { useProtectedSession } from '../../../lib/use-protected-session';

function formatConversationTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatFeedbackSummary(item: WorkspaceConversationListItem) {
  const { positiveCount, negativeCount } = item.feedbackSummary;

  if (positiveCount === 0 && negativeCount === 0) {
    return 'No feedback';
  }

  return `Feedback +${positiveCount} / -${negativeCount}`;
}

type HistoryFilters = {
  attachment: '' | WorkspaceConversationListAttachmentFilter;
  appId: string;
  feedback: '' | WorkspaceConversationListFeedbackFilter;
  groupId: string;
  query: string;
  status: '' | WorkspaceConversationListStatusFilter;
  tag: string;
};

type ConversationAction =
  | 'archive'
  | 'delete'
  | 'pin'
  | 'rename'
  | 'restore'
  | 'unpin';

export default function ChatHistoryPage() {
  const router = useRouter();
  const { session, isLoading } = useProtectedSession('/chat');
  const [apps, setApps] = useState<WorkspaceApp[]>([]);
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [items, setItems] = useState<WorkspaceConversationListItem[]>([]);
  const [filters, setFilters] = useState<HistoryFilters>({
    attachment: '',
    appId: '',
    feedback: '',
    groupId: '',
    query: '',
    status: '',
    tag: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [activeAction, setActiveAction] = useState<{
    action: ConversationAction;
    conversationId: string;
  } | null>(null);
  const [gatewayRuntime, setGatewayRuntime] = useState<GatewayRuntimeHealthSnapshot | null>(null);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    startTransition(() => {
      void (async () => {
        setIsRefreshing(true);
        setError(null);

        try {
          const [catalogResult, listResult, healthResult] = await Promise.all([
            fetchWorkspaceCatalog(session.sessionToken),
            fetchWorkspaceConversationList(session.sessionToken, {
              attachment: filters.attachment || null,
              appId: filters.appId || null,
              feedback: filters.feedback || null,
              groupId: filters.groupId || null,
              query: filters.query.trim() || null,
              limit: 20,
              status: filters.status || null,
              tag: filters.tag || null,
            }),
            fetchGatewayHealth(),
          ]);

          if (cancelled) {
            return;
          }

          if (!catalogResult.ok) {
            if (catalogResult.error.code === 'WORKSPACE_UNAUTHORIZED') {
              clearAuthSession(window.sessionStorage);
              router.replace('/login');
              return;
            }

            setError(catalogResult.error.message);
            return;
          }

          if (!listResult.ok) {
            if (listResult.error.code === 'WORKSPACE_UNAUTHORIZED') {
              clearAuthSession(window.sessionStorage);
              router.replace('/login');
              return;
            }

            setError(listResult.error.message);
            return;
          }

          setApps(catalogResult.data.apps);
          setGroups(catalogResult.data.groups);
          setItems(listResult.data.items);
          setGatewayRuntime(healthResult?.runtime ?? null);
        } catch {
          if (!cancelled) {
            setError('The conversation history could not be loaded. Please retry.');
          }
        } finally {
          if (!cancelled) {
            setIsRefreshing(false);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [
    filters.appId,
    filters.attachment,
    filters.feedback,
    filters.groupId,
    filters.query,
    filters.status,
    filters.tag,
    refreshKey,
    router,
    session,
  ]);

  async function handleConversationUpdate(
    conversationId: string,
    input: {
      pinned?: boolean;
      status?: WorkspaceConversationListItem['status'];
      title?: string;
    },
    action: ConversationAction
  ) {
    if (!session) {
      return;
    }

    setActiveAction({
      action,
      conversationId,
    });
    setError(null);

    try {
      const result = await updateWorkspaceConversation(
        session.sessionToken,
        conversationId,
        input
      );

      if (!result.ok) {
        if (result.error.code === 'WORKSPACE_UNAUTHORIZED') {
          clearAuthSession(window.sessionStorage);
          router.replace('/login');
          return;
        }

        setError(result.error.message);
        return;
      }

      if (action === 'rename') {
        setRenamingConversationId(null);
      }

      setRefreshKey(current => current + 1);
    } catch {
      setError('The conversation update could not be saved. Please retry.');
    } finally {
      setActiveAction(current =>
        current?.conversationId === conversationId ? null : current
      );
    }
  }

  function startRename(item: WorkspaceConversationListItem) {
    setRenamingConversationId(item.id);
    setRenameDrafts(current => ({
      ...current,
      [item.id]: current[item.id] ?? item.title,
    }));
    setError(null);
  }

  function isActionPending(conversationId: string, action?: ConversationAction) {
    if (!activeAction || activeAction.conversationId !== conversationId) {
      return false;
    }

    return action ? activeAction.action === action : true;
  }

  if (isLoading) {
    return <p className="lead">Checking your session...</p>;
  }

  const tagOptions = [...new Set(apps.flatMap(app => app.tags))].sort((left, right) =>
    left.localeCompare(right)
  );
  const appTagsByAppId = new Map(apps.map(app => [app.id, app.tags]));
  const activeFilterCount = [
    filters.query,
    filters.appId,
    filters.groupId,
    filters.status,
    filters.tag,
    filters.attachment,
    filters.feedback,
  ].filter(Boolean).length;

  return (
    <div className="stack">
      <MainSectionNav showSecurity />

      <header className="hero compact">
        <div>
          <span className="eyebrow">P2-A6</span>
          <h1>Conversation history</h1>
          <p className="lead">
            Search persisted conversation history with structured filters for app tags, attachment
            usage, message feedback, and conversation status.
          </p>
        </div>
      </header>

      <WorkspaceRuntimeDegradedBanner context="history" snapshot={gatewayRuntime} />

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Recent conversations</h2>
            <p>History is user-scoped, pinned conversations stay at the top, and structured filters narrow transcript search without leaving the workspace boundary.</p>
          </div>
          <span className="workspace-badge">{isRefreshing ? 'Refreshing' : `${items.length} items`}</span>
        </div>

        <div className="conversation-history-filters">
          <label className="field" htmlFor="history-query">
            Search
          </label>
          <input
            id="history-query"
            className="chat-composer-input"
            value={filters.query}
            placeholder="Search title, prompt, or reply text..."
            onChange={event =>
              setFilters(current => ({
                ...current,
                query: event.target.value,
              }))
            }
          />

          <label className="field" htmlFor="history-app">
            App
          </label>
          <select
            id="history-app"
            value={filters.appId}
            onChange={event =>
              setFilters(current => ({
                ...current,
                appId: event.target.value,
              }))
            }
          >
            <option value="">All apps</option>
            {apps.map(app => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>

          <label className="field" htmlFor="history-group">
            Group
          </label>
          <select
            id="history-group"
            value={filters.groupId}
            onChange={event =>
              setFilters(current => ({
                ...current,
                groupId: event.target.value,
              }))
            }
          >
            <option value="">All groups</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>

          <label className="field" htmlFor="history-status">
            Status
          </label>
          <select
            id="history-status"
            value={filters.status}
            onChange={event =>
              setFilters(current => ({
                ...current,
                status: event.target.value as HistoryFilters['status'],
              }))
            }
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>

          <label className="field" htmlFor="history-tag">
            Tag
          </label>
          <select
            id="history-tag"
            value={filters.tag}
            onChange={event =>
              setFilters(current => ({
                ...current,
                tag: event.target.value,
              }))
            }
          >
            <option value="">All tags</option>
            {tagOptions.map(tag => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>

          <label className="field" htmlFor="history-attachments">
            Attachments
          </label>
          <select
            id="history-attachments"
            value={filters.attachment}
            onChange={event =>
              setFilters(current => ({
                ...current,
                attachment: event.target.value as HistoryFilters['attachment'],
              }))
            }
          >
            <option value="">All conversations</option>
            <option value="with_attachments">With attachments</option>
          </select>

          <label className="field" htmlFor="history-feedback">
            Feedback
          </label>
          <select
            id="history-feedback"
            value={filters.feedback}
            onChange={event =>
              setFilters(current => ({
                ...current,
                feedback: event.target.value as HistoryFilters['feedback'],
              }))
            }
          >
            <option value="">All feedback states</option>
            <option value="any">Any feedback</option>
            <option value="positive">Helpful</option>
            <option value="negative">Needs work</option>
          </select>
        </div>

        <div className="tag-row">
          <span className="tag tag-muted">{activeFilterCount} active filters</span>
          {filters.tag ? <span className="tag">Tag {filters.tag}</span> : null}
          {filters.status ? <span className="tag">Status {filters.status}</span> : null}
          {filters.attachment ? <span className="tag">With attachments</span> : null}
          {filters.feedback ? <span className="tag">Feedback {filters.feedback}</span> : null}
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        {items.length === 0 ? (
          <div className="chat-empty-state">
            <strong>No conversations match the current filters.</strong>
            <p>Start a new workspace conversation from the Apps workspace and it will appear here.</p>
          </div>
        ) : (
          <div className="conversation-history-list">
            {items.map(item => (
              <article key={item.id} className="conversation-history-card">
                <div className="conversation-history-card-header">
                  <div>
                    <h3>{item.title}</h3>
                    <p>
                      {item.app.name} · {item.activeGroup.name}
                    </p>
                  </div>
                  <span className={`status-chip status-${item.run.status}`}>{item.run.status}</span>
                </div>

                <div className="tag-row">
                  {item.pinned ? <span className="tag">Pinned</span> : null}
                  {item.status === 'archived' ? <span className="tag tag-muted">Archived</span> : null}
                  {(appTagsByAppId.get(item.app.id) ?? []).map(tag => (
                    <span key={`${item.id}-${tag}`} className="tag tag-muted">
                      {tag}
                    </span>
                  ))}
                  <span className="tag">{item.run.triggeredFrom}</span>
                  <span className="tag tag-muted">{item.messageCount} messages</span>
                  <span className="tag tag-muted">{item.attachmentCount} attachments</span>
                  <span className="tag tag-muted">{formatFeedbackSummary(item)}</span>
                  <span className="tag tag-muted">{item.run.totalTokens} tokens</span>
                </div>

                {renamingConversationId === item.id ? (
                  <div className="conversation-management-inline">
                    <label className="field" htmlFor={`conversation-title-${item.id}`}>
                      Conversation title
                    </label>
                    <input
                      id={`conversation-title-${item.id}`}
                      className="chat-composer-input"
                      value={renameDrafts[item.id] ?? item.title}
                      onChange={event =>
                        setRenameDrafts(current => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                    />
                    <div className="actions">
                      <button
                        className="primary"
                        type="button"
                        disabled={
                          isActionPending(item.id) ||
                          !(renameDrafts[item.id] ?? item.title).trim()
                        }
                        onClick={() =>
                          void handleConversationUpdate(
                            item.id,
                            {
                              title: (renameDrafts[item.id] ?? item.title).trim(),
                            },
                            'rename'
                          )
                        }
                      >
                        {isActionPending(item.id, 'rename') ? 'Saving...' : 'Save title'}
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        disabled={isActionPending(item.id)}
                        onClick={() => setRenamingConversationId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <p className="conversation-history-preview">
                  {item.lastMessagePreview ?? 'No transcript content has been persisted yet.'}
                </p>

                <div className="conversation-history-meta">
                  <span>Updated {formatConversationTimestamp(item.updatedAt)}</span>
                  <span>Status {item.status}</span>
                  <span>Trace {item.run.traceId}</span>
                </div>

                <div className="actions">
                  <Link className="primary" href={`/chat/${item.id}`}>
                    Open conversation
                  </Link>
                  <button
                    className="secondary"
                    type="button"
                    disabled={isActionPending(item.id)}
                    onClick={() =>
                      void handleConversationUpdate(
                        item.id,
                        {
                          pinned: !item.pinned,
                        },
                        item.pinned ? 'unpin' : 'pin'
                      )
                    }
                  >
                    {isActionPending(item.id, item.pinned ? 'unpin' : 'pin')
                      ? 'Saving...'
                      : item.pinned
                        ? 'Unpin'
                        : 'Pin'}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={isActionPending(item.id)}
                    onClick={() => startRename(item)}
                  >
                    Rename
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={isActionPending(item.id)}
                    onClick={() =>
                      void handleConversationUpdate(
                        item.id,
                        {
                          status: item.status === 'archived' ? 'active' : 'archived',
                        },
                        item.status === 'archived' ? 'restore' : 'archive'
                      )
                    }
                  >
                    {isActionPending(item.id, item.status === 'archived' ? 'restore' : 'archive')
                      ? 'Saving...'
                      : item.status === 'archived'
                        ? 'Restore'
                        : 'Archive'}
                  </button>
                  <button
                    className="secondary danger"
                    type="button"
                    disabled={isActionPending(item.id)}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete "${item.title}" from workspace history? This hides the conversation and its runs from normal workspace reads.`
                        )
                      ) {
                        void handleConversationUpdate(
                          item.id,
                          {
                            status: 'deleted',
                          },
                          'delete'
                        );
                      }
                    }}
                  >
                    {isActionPending(item.id, 'delete') ? 'Deleting...' : 'Delete'}
                  </button>
                  <Link className="secondary" href="/apps">
                    Launch another app
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
