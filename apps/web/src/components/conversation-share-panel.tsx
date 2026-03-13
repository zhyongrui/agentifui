'use client';

import type { WorkspaceConversationShare, WorkspaceGroup } from '@agentifui/shared/apps';
import Link from 'next/link';
import { startTransition, useEffect, useState } from 'react';

import {
  createWorkspaceConversationShare,
  fetchWorkspaceCatalog,
  fetchWorkspaceConversationShares,
  revokeWorkspaceConversationShare,
} from '../lib/apps-client';

type ConversationSharePanelProps = {
  activeGroupId: string;
  conversationId: string;
  sessionToken: string;
};

export function ConversationSharePanel({
  activeGroupId,
  conversationId,
  sessionToken,
}: ConversationSharePanelProps) {
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [shares, setShares] = useState<WorkspaceConversationShare[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(activeGroupId);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingRevokeShareId, setPendingRevokeShareId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    startTransition(() => {
      void (async () => {
        setIsLoading(true);
        setError(null);

        try {
          const [catalogResult, sharesResult] = await Promise.all([
            fetchWorkspaceCatalog(sessionToken),
            fetchWorkspaceConversationShares(sessionToken, conversationId),
          ]);

          if (cancelled) {
            return;
          }

          if (!catalogResult.ok) {
            setError(catalogResult.error.message);
            return;
          }

          if (!sharesResult.ok) {
            setError(sharesResult.error.message);
            return;
          }

          setGroups(catalogResult.data.groups);
          setSelectedGroupId(currentValue =>
            currentValue || catalogResult.data.defaultActiveGroupId || activeGroupId
          );
          setShares(sharesResult.data.shares);
        } catch {
          if (!cancelled) {
            setError('The share panel could not be loaded. Please retry.');
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [activeGroupId, conversationId, sessionToken]);

  async function handleCreateShare() {
    if (!selectedGroupId || isCreating) {
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const result = await createWorkspaceConversationShare(sessionToken, conversationId, {
        groupId: selectedGroupId,
      });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setShares(currentShares => {
        const nextShares = currentShares.filter(share => share.id !== result.data.id);

        return [result.data, ...nextShares];
      });
    } catch {
      setError('The share could not be created. Please retry.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevokeShare(shareId: string) {
    if (pendingRevokeShareId) {
      return;
    }

    setError(null);
    setPendingRevokeShareId(shareId);

    try {
      const result = await revokeWorkspaceConversationShare(sessionToken, conversationId, shareId);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setShares(currentShares =>
        currentShares.map(share => (share.id === result.data.id ? result.data : share))
      );
    } catch {
      setError('The share could not be revoked. Please retry.');
    } finally {
      setPendingRevokeShareId(null);
    }
  }

  return (
    <section className="chat-panel">
      <div className="chat-panel-header">
        <div>
          <h2>Shares</h2>
          <p>Create a read-only workspace link for one of your current groups.</p>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {isLoading ? (
        <p className="chat-composer-hint">Loading share state...</p>
      ) : (
        <>
          <div className="share-panel-create">
            <label className="field" htmlFor="conversation-share-group">
              Share group
            </label>
            <select
              id="conversation-share-group"
              value={selectedGroupId}
              onChange={event => setSelectedGroupId(event.target.value)}
            >
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <button
              className="primary"
              type="button"
              onClick={() => void handleCreateShare()}
              disabled={groups.length === 0 || !selectedGroupId || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create read-only share'}
            </button>
          </div>

          {shares.length === 0 ? (
            <div className="chat-empty-state">
              <strong>No shares yet.</strong>
              <p>Create a group-scoped share to let another member open this transcript read-only.</p>
            </div>
          ) : (
            <div className="share-panel-list">
              {shares.map(share => (
                <article key={share.id} className="chat-meta-card">
                  <span>{share.group.name}</span>
                  <strong>{share.status}</strong>
                  <p>{share.shareUrl}</p>
                  <div className="actions">
                    <Link className="secondary" href={share.shareUrl}>
                      Open shared view
                    </Link>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void handleRevokeShare(share.id)}
                      disabled={share.status === 'revoked' || pendingRevokeShareId === share.id}
                    >
                      {pendingRevokeShareId === share.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
