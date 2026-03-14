'use client';

import type {
  WorkspaceApp,
  WorkspaceConversationListItem,
  WorkspaceGroup,
} from '@agentifui/shared/apps';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useState } from 'react';

import { MainSectionNav } from '../../../components/main-section-nav';
import {
  fetchWorkspaceCatalog,
  fetchWorkspaceConversationList,
  updateWorkspaceConversation,
} from '../../../lib/apps-client';
import { clearAuthSession } from '../../../lib/auth-session';
import { useProtectedSession } from '../../../lib/use-protected-session';

function formatConversationTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

type HistoryFilters = {
  appId: string;
  groupId: string;
  query: string;
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
    appId: '',
    groupId: '',
    query: '',
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
          const [catalogResult, listResult] = await Promise.all([
            fetchWorkspaceCatalog(session.sessionToken),
            fetchWorkspaceConversationList(session.sessionToken, {
              appId: filters.appId || null,
              groupId: filters.groupId || null,
              query: filters.query.trim() || null,
              limit: 20,
            }),
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
  }, [filters.appId, filters.groupId, filters.query, refreshKey, router, session]);

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

  return (
    <div className="stack">
      <MainSectionNav showSecurity />

      <header className="hero compact">
        <div>
          <span className="eyebrow">P2-A5</span>
          <h1>Conversation history</h1>
          <p className="lead">
            Reopen prior workspace conversations, pin important threads, archive dormant work, and
            rename or delete conversation records without leaving the workspace boundary.
          </p>
        </div>
      </header>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Recent conversations</h2>
            <p>History is user-scoped, pinned conversations stay at the top, and deleted items disappear from normal reads.</p>
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
                  <span className="tag">{item.run.triggeredFrom}</span>
                  <span className="tag tag-muted">{item.messageCount} messages</span>
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
