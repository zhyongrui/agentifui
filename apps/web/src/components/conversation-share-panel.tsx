'use client';

import type {
  WorkspaceConversationShare,
  WorkspaceConversationShareAccess,
  WorkspaceGroup,
} from '@agentifui/shared/apps';
import Link from 'next/link';
import { startTransition, useEffect, useState } from 'react';

import { useI18n } from './i18n-provider';
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

function listShareAccessModes(): WorkspaceConversationShareAccess[] {
  return ['read_only', 'commenter', 'editor'];
}

export function ConversationSharePanel({
  activeGroupId,
  conversationId,
  sessionToken,
}: ConversationSharePanelProps) {
  const { locale } = useI18n();
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [shares, setShares] = useState<WorkspaceConversationShare[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(activeGroupId);
  const [selectedAccess, setSelectedAccess] =
    useState<WorkspaceConversationShareAccess>('read_only');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingRevokeShareId, setPendingRevokeShareId] = useState<string | null>(null);
  const copy =
    locale === 'zh-CN'
      ? {
          title: '共享链接',
          lead: '给现有工作群组创建共享链接，并指定只读、可评论或可编辑权限。',
          loadError: '共享面板加载失败，请稍后重试。',
          createError: '共享链接创建失败，请稍后重试。',
          revokeError: '共享链接撤销失败，请稍后重试。',
          loading: '正在加载共享状态...',
          groupLabel: '共享群组',
          accessLabel: '共享权限',
          create: '创建共享链接',
          creating: '创建中...',
          open: '打开共享视图',
          revoke: '撤销',
          revoking: '撤销中...',
          emptyTitle: '还没有共享链接。',
          emptyLead: '创建一个按群组授权的共享链接，让其他成员查看、评论或协作编辑这段会话。',
          access: {
            read_only: { label: '只读', description: '只能查看转录、产物和评论线程。' },
            commenter: { label: '可评论', description: '可以在共享视图里添加评论。' },
            editor: { label: '可编辑', description: '可以评论，并修改标题、置顶和归档状态。' },
          } satisfies Record<WorkspaceConversationShareAccess, { label: string; description: string }>,
        }
      : {
          title: 'Shares',
          lead:
            'Create a group-scoped share link and choose whether collaborators can only read, comment, or edit metadata.',
          loadError: 'The share panel could not be loaded. Please retry.',
          createError: 'The share could not be created. Please retry.',
          revokeError: 'The share could not be revoked. Please retry.',
          loading: 'Loading share state...',
          groupLabel: 'Share group',
          accessLabel: 'Share access',
          create: 'Create share',
          creating: 'Creating...',
          open: 'Open shared view',
          revoke: 'Revoke',
          revoking: 'Revoking...',
          emptyTitle: 'No shares yet.',
          emptyLead:
            'Create a group-scoped share to let another member inspect, comment on, or edit this transcript.',
          access: {
            read_only: {
              label: 'Read-only',
              description: 'Can only inspect the transcript, artifacts, and comments.',
            },
            commenter: {
              label: 'Commenter',
              description: 'Can add comments from shared surfaces.',
            },
            editor: {
              label: 'Editor',
              description: 'Can comment and edit title, pin, or archive metadata.',
            },
          } satisfies Record<WorkspaceConversationShareAccess, { label: string; description: string }>,
        };

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
          setSelectedGroupId((currentValue) =>
            currentValue || catalogResult.data.defaultActiveGroupId || activeGroupId,
          );
          setShares(sharesResult.data.shares);
        } catch {
          if (!cancelled) {
            setError(copy.loadError);
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
  }, [activeGroupId, conversationId, copy.loadError, sessionToken]);

  async function handleCreateShare() {
    if (!selectedGroupId || isCreating) {
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const result = await createWorkspaceConversationShare(sessionToken, conversationId, {
        groupId: selectedGroupId,
        access: selectedAccess,
      });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setShares((currentShares) => {
        const nextShares = currentShares.filter((share) => share.id !== result.data.id);

        return [result.data, ...nextShares];
      });
    } catch {
      setError(copy.createError);
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

      setShares((currentShares) =>
        currentShares.map((share) => (share.id === result.data.id ? result.data : share)),
      );
    } catch {
      setError(copy.revokeError);
    } finally {
      setPendingRevokeShareId(null);
    }
  }

  return (
    <section className="chat-panel">
      <div className="chat-panel-header">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.lead}</p>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {isLoading ? (
        <p className="chat-composer-hint">{copy.loading}</p>
      ) : (
        <>
          <div className="share-panel-create">
            <label className="field" htmlFor="conversation-share-group">
              {copy.groupLabel}
            </label>
            <select
              id="conversation-share-group"
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <label className="field" htmlFor="conversation-share-access">
              {copy.accessLabel}
            </label>
            <select
              id="conversation-share-access"
              value={selectedAccess}
              onChange={(event) =>
                setSelectedAccess(event.target.value as WorkspaceConversationShareAccess)
              }
            >
              {listShareAccessModes().map((access) => (
                <option key={access} value={access}>
                  {copy.access[access].label}
                </option>
              ))}
            </select>
            <p className="chat-composer-hint">{copy.access[selectedAccess].description}</p>
            <button
              className="primary"
              type="button"
              onClick={() => void handleCreateShare()}
              disabled={groups.length === 0 || !selectedGroupId || isCreating}
            >
              {isCreating ? copy.creating : copy.create}
            </button>
          </div>

          {shares.length === 0 ? (
            <div className="chat-empty-state">
              <strong>{copy.emptyTitle}</strong>
              <p>{copy.emptyLead}</p>
            </div>
          ) : (
            <div className="share-panel-list">
              {shares.map((share) => (
                <article key={share.id} className="chat-meta-card">
                  <span>{share.group.name}</span>
                  <strong>{share.status}</strong>
                  <p>
                    {copy.access[share.access].label}
                    {' · '}
                    {copy.access[share.access].description}
                  </p>
                  <p>{share.shareUrl}</p>
                  <div className="actions">
                    <Link className="secondary" href={share.shareUrl}>
                      {copy.open}
                    </Link>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void handleRevokeShare(share.id)}
                      disabled={share.status === 'revoked' || pendingRevokeShareId === share.id}
                    >
                      {pendingRevokeShareId === share.id ? copy.revoking : copy.revoke}
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
