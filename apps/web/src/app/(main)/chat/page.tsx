'use client';

import type { WorkspaceApp, WorkspaceConversationListItem, WorkspaceGroup } from '@agentifui/shared/apps';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useState } from 'react';

import { MainSectionNav } from '../../../components/main-section-nav';
import {
  fetchWorkspaceCatalog,
  fetchWorkspaceConversationList,
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
  }, [filters.appId, filters.groupId, filters.query, router, session]);

  if (isLoading) {
    return <p className="lead">Checking your session...</p>;
  }

  return (
    <div className="stack">
      <MainSectionNav showSecurity />

      <header className="hero compact">
        <div>
          <span className="eyebrow">R12 History</span>
          <h1>Conversation history</h1>
          <p className="lead">
            Reopen prior workspace conversations without relying on a single deep link. Filter by
            app, group or free-text prompt history.
          </p>
        </div>
      </header>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Recent conversations</h2>
            <p>History is ordered by most recently updated conversation and stays user-scoped.</p>
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
                  <span className="tag">{item.run.triggeredFrom}</span>
                  <span className="tag tag-muted">{item.messageCount} messages</span>
                  <span className="tag tag-muted">{item.run.totalTokens} tokens</span>
                </div>
                <p className="conversation-history-preview">
                  {item.lastMessagePreview ?? 'No transcript content has been persisted yet.'}
                </p>
                <div className="conversation-history-meta">
                  <span>Updated {formatConversationTimestamp(item.updatedAt)}</span>
                  <span>Trace {item.run.traceId}</span>
                </div>
                <div className="actions">
                  <Link className="primary" href={`/chat/${item.id}`}>
                    Open conversation
                  </Link>
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
