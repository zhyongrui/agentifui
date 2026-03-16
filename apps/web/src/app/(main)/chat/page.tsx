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

import { useI18n } from '../../../components/i18n-provider';
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
import { localizeWorkspaceCatalogApps } from '../../../lib/workspace-localization';
import { useProtectedSession } from '../../../lib/use-protected-session';

function formatConversationTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatFeedbackSummary(item: WorkspaceConversationListItem, locale: 'zh-CN' | 'en-US') {
  const { positiveCount, negativeCount } = item.feedbackSummary;

  if (positiveCount === 0 && negativeCount === 0) {
    return locale === 'zh-CN' ? '暂无反馈' : 'No feedback';
  }

  return locale === 'zh-CN'
    ? `反馈 +${positiveCount} / -${negativeCount}`
    : `Feedback +${positiveCount} / -${negativeCount}`;
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
  const { locale } = useI18n();
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
  const copy =
    locale === 'zh-CN'
      ? {
          session: '正在检查登录状态...',
          loadFailed: '对话历史加载失败，请稍后重试。',
          updateFailed: '对话更新保存失败，请稍后重试。',
          title: '对话历史',
          lead: '按应用、群组、标签、反馈和附件检索持久化会话历史。',
          recent: '最近对话',
          recentLead: '历史按用户维度保存，置顶会话保持在最前，并支持结构化筛选。',
          refreshing: '刷新中',
          items: (count: number) => `${count} 条`,
          search: '搜索',
          searchPlaceholder: '搜索标题、提问或回复内容...',
          app: '应用',
          allApps: '全部应用',
          group: '群组',
          allGroups: '全部群组',
          status: '状态',
          allStatuses: '全部状态',
          active: '活跃',
          archived: '已归档',
          tag: '标签',
          allTags: '全部标签',
          attachments: '附件',
          allConversations: '全部对话',
          withAttachments: '有附件',
          feedback: '反馈',
          allFeedback: '全部反馈状态',
          anyFeedback: '任意反馈',
          helpful: '有帮助',
          needsWork: '待改进',
          activeFilters: (count: number) => `${count} 个激活筛选`,
          pinned: '已置顶',
          messages: (count: number) => `${count} 条消息`,
          attachmentsCount: (count: number) => `${count} 个附件`,
          tokens: (count: number) => `${count} tokens`,
          renameTitle: '会话标题',
          saveTitle: '保存标题',
          saving: '保存中...',
          cancel: '取消',
          noTranscript: '还没有持久化的对话内容。',
          updated: '更新时间',
          trace: '链路追踪',
          openConversation: '打开会话',
          pin: '置顶',
          unpin: '取消置顶',
          rename: '重命名',
          restore: '恢复',
          archive: '归档',
          deleting: '删除中...',
          delete: '删除',
          launchAnotherApp: '启动其他应用',
          noResultsTitle: '当前筛选条件下没有匹配的对话。',
          noResultsLead: '从应用工作台发起一个新会话后，它会出现在这里。',
          deleteConfirm: (title: string) =>
            `确认要从工作台历史中删除“${title}”吗？这会让该会话和运行记录不再出现在普通工作台读取中。`,
        }
      : {
          session: 'Checking your session...',
          loadFailed: 'The conversation history could not be loaded. Please retry.',
          updateFailed: 'The conversation update could not be saved. Please retry.',
          title: 'Conversation history',
          lead: 'Search persisted conversation history by app, group, tag, feedback, and attachments.',
          recent: 'Recent conversations',
          recentLead:
            'History is user-scoped, pinned conversations stay at the top, and structured filters narrow transcript search.',
          refreshing: 'Refreshing',
          items: (count: number) => `${count} items`,
          search: 'Search',
          searchPlaceholder: 'Search title, prompt, or reply text...',
          app: 'App',
          allApps: 'All apps',
          group: 'Group',
          allGroups: 'All groups',
          status: 'Status',
          allStatuses: 'All statuses',
          active: 'Active',
          archived: 'Archived',
          tag: 'Tag',
          allTags: 'All tags',
          attachments: 'Attachments',
          allConversations: 'All conversations',
          withAttachments: 'With attachments',
          feedback: 'Feedback',
          allFeedback: 'All feedback states',
          anyFeedback: 'Any feedback',
          helpful: 'Helpful',
          needsWork: 'Needs work',
          activeFilters: (count: number) => `${count} active filters`,
          pinned: 'Pinned',
          messages: (count: number) => `${count} messages`,
          attachmentsCount: (count: number) => `${count} attachments`,
          tokens: (count: number) => `${count} tokens`,
          renameTitle: 'Conversation title',
          saveTitle: 'Save title',
          saving: 'Saving...',
          cancel: 'Cancel',
          noTranscript: 'No transcript content has been persisted yet.',
          updated: 'Updated',
          trace: 'Trace',
          openConversation: 'Open conversation',
          pin: 'Pin',
          unpin: 'Unpin',
          rename: 'Rename',
          restore: 'Restore',
          archive: 'Archive',
          deleting: 'Deleting...',
          delete: 'Delete',
          launchAnotherApp: 'Launch another app',
          noResultsTitle: 'No conversations match the current filters.',
          noResultsLead: 'Start a new workspace conversation from the Apps workspace and it will appear here.',
          deleteConfirm: (title: string) =>
            `Delete "${title}" from workspace history? This hides the conversation and its runs from normal workspace reads.`,
        };

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
            setError(copy.loadFailed);
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
      setError(copy.updateFailed);
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
    return <p className="lead">{copy.session}</p>;
  }

  const localizedApps = localizeWorkspaceCatalogApps(apps, locale);
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
          <h1>{copy.title}</h1>
          <p className="lead">{copy.lead}</p>
        </div>
      </header>

      <WorkspaceRuntimeDegradedBanner context="history" snapshot={gatewayRuntime} />

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>{copy.recent}</h2>
            <p>{copy.recentLead}</p>
          </div>
          <span className="workspace-badge">
            {isRefreshing ? copy.refreshing : copy.items(items.length)}
          </span>
        </div>

        <div className="conversation-history-filters">
          <label className="field" htmlFor="history-query">
            {copy.search}
          </label>
          <input
            id="history-query"
            className="chat-composer-input"
            value={filters.query}
            placeholder={copy.searchPlaceholder}
            onChange={event =>
              setFilters(current => ({
                ...current,
                query: event.target.value,
              }))
            }
          />

          <label className="field" htmlFor="history-app">
            {copy.app}
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
            <option value="">{copy.allApps}</option>
            {localizedApps.map(app => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>

          <label className="field" htmlFor="history-group">
            {copy.group}
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
            <option value="">{copy.allGroups}</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>

          <label className="field" htmlFor="history-status">
            {copy.status}
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
            <option value="">{copy.allStatuses}</option>
            <option value="active">{copy.active}</option>
            <option value="archived">{copy.archived}</option>
          </select>

          <label className="field" htmlFor="history-tag">
            {copy.tag}
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
            <option value="">{copy.allTags}</option>
            {tagOptions.map(tag => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>

          <label className="field" htmlFor="history-attachments">
            {copy.attachments}
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
            <option value="">{copy.allConversations}</option>
            <option value="with_attachments">{copy.withAttachments}</option>
          </select>

          <label className="field" htmlFor="history-feedback">
            {copy.feedback}
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
            <option value="">{copy.allFeedback}</option>
            <option value="any">{copy.anyFeedback}</option>
            <option value="positive">{copy.helpful}</option>
            <option value="negative">{copy.needsWork}</option>
          </select>
        </div>

        <div className="tag-row">
          <span className="tag tag-muted">{copy.activeFilters(activeFilterCount)}</span>
          {filters.tag ? <span className="tag">{copy.tag} {filters.tag}</span> : null}
          {filters.status ? (
            <span className="tag">
              {copy.status} {filters.status === 'active' ? copy.active : copy.archived}
            </span>
          ) : null}
          {filters.attachment ? <span className="tag">{copy.withAttachments}</span> : null}
          {filters.feedback ? <span className="tag">{copy.feedback} {filters.feedback}</span> : null}
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        {items.length === 0 ? (
          <div className="chat-empty-state">
            <strong>{copy.noResultsTitle}</strong>
            <p>{copy.noResultsLead}</p>
          </div>
        ) : (
          <div className="conversation-history-list">
            {items.map(item => (
              <article key={item.id} className="conversation-history-card">
                <div className="conversation-history-card-header">
                  <div>
                    <h3>{item.title}</h3>
                    <p>
                      {(localizedApps.find(app => app.id === item.app.id)?.name ?? item.app.name)} · {item.activeGroup.name}
                    </p>
                  </div>
                  <span className={`status-chip status-${item.run.status}`}>{item.run.status}</span>
                </div>

                <div className="tag-row">
                  {item.pinned ? <span className="tag">{copy.pinned}</span> : null}
                  {item.status === 'archived' ? <span className="tag tag-muted">{copy.archived}</span> : null}
                  {(appTagsByAppId.get(item.app.id) ?? []).map(tag => (
                    <span key={`${item.id}-${tag}`} className="tag tag-muted">
                      {tag}
                    </span>
                  ))}
                  <span className="tag">{item.run.triggeredFrom}</span>
                  <span className="tag tag-muted">{copy.messages(item.messageCount)}</span>
                  <span className="tag tag-muted">{copy.attachmentsCount(item.attachmentCount)}</span>
                  <span className="tag tag-muted">{formatFeedbackSummary(item, locale)}</span>
                  <span className="tag tag-muted">{copy.tokens(item.run.totalTokens)}</span>
                </div>

                {renamingConversationId === item.id ? (
                  <div className="conversation-management-inline">
                    <label className="field" htmlFor={`conversation-title-${item.id}`}>
                      {copy.renameTitle}
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
                        {isActionPending(item.id, 'rename') ? copy.saving : copy.saveTitle}
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        disabled={isActionPending(item.id)}
                        onClick={() => setRenamingConversationId(null)}
                      >
                        {copy.cancel}
                      </button>
                    </div>
                  </div>
                ) : null}

                <p className="conversation-history-preview">
                  {item.lastMessagePreview ?? copy.noTranscript}
                </p>

                <div className="conversation-history-meta">
                  <span>{copy.updated} {formatConversationTimestamp(item.updatedAt)}</span>
                  <span>{copy.status} {item.status === 'active' ? copy.active : copy.archived}</span>
                  <span>{copy.trace} {item.run.traceId}</span>
                </div>

                <div className="actions">
                  <Link className="primary" href={`/chat/${item.id}`}>
                    {copy.openConversation}
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
                      ? copy.saving
                      : item.pinned
                        ? copy.unpin
                        : copy.pin}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={isActionPending(item.id)}
                    onClick={() => startRename(item)}
                  >
                    {copy.rename}
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
                      ? copy.saving
                      : item.status === 'archived'
                        ? copy.restore
                        : copy.archive}
                  </button>
                  <button
                    className="secondary danger"
                    type="button"
                    disabled={isActionPending(item.id)}
                    onClick={() => {
                      if (
                        window.confirm(
                          copy.deleteConfirm(item.title)
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
                    {isActionPending(item.id, 'delete') ? copy.deleting : copy.delete}
                  </button>
                  <Link className="secondary" href="/apps">
                    {copy.launchAnotherApp}
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
