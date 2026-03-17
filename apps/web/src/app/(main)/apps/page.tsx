'use client';

import {
  buildWorkspaceSections,
  evaluateAppLaunch,
  getQuotaSeverity,
  listQuotaAlerts,
  type AppLaunchGuard,
  type QuotaServiceState,
  type QuotaUsage,
  type WorkspaceApp,
  type WorkspaceCatalog,
  type WorkspaceGroup,
  type WorkspaceNotification,
  type WorkspaceSourceStatusItem,
} from '@agentifui/shared/apps';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import {
  resolveActiveGroupId,
  toggleFavoriteApp,
} from '../../../lib/apps-workspace';
import {
  fetchWorkspaceNotifications,
  fetchWorkspaceSourceStatus,
  fetchWorkspaceCatalog,
  launchWorkspaceApp,
  markWorkspaceNotificationRead,
  updateWorkspacePreferences,
} from '../../../lib/apps-client';
import {
  localizeAppKind,
  localizeAppStatus,
  localizeAppTag,
  localizeWorkspaceCatalogApps,
} from '../../../lib/workspace-localization';
import { useI18n } from '../../../components/i18n-provider';
import { clearAuthSession } from '../../../lib/auth-session';
import { useProtectedSession } from '../../../lib/use-protected-session';
import { MainSectionNav } from '../../../components/main-section-nav';

type Notice = {
  tone: 'info' | 'success' | 'error';
  message: string;
};

function formatQuotaPercent(usage: QuotaUsage): number {
  if (usage.limit <= 0) {
    return 100;
  }

  return Math.min(100, Math.round((usage.used / usage.limit) * 100));
}

function getQuotaSeverityLabel(
  usage: QuotaUsage,
  copy: ReturnType<typeof useI18n>['messages']['apps']
): string {
  const severity = getQuotaSeverity(usage);

  if (severity === 'warning') {
    return copy.quotaSeverityWarning;
  }

  if (severity === 'critical') {
    return copy.quotaSeverityCritical;
  }

  if (severity === 'blocked') {
    return copy.quotaSeverityBlocked;
  }

  return copy.quotaSeverityNormal;
}

function getLaunchDescription(
  app: WorkspaceApp,
  guard: AppLaunchGuard,
  activeGroup: WorkspaceGroup,
  groupsById: Map<string, WorkspaceGroup>,
  copy: ReturnType<typeof useI18n>['messages']['apps']
): string {
  if (guard.reason === 'group_switch_required') {
    return `${copy.groupSwitchRequiredPrefix}${guard.eligibleGroupIds
      .map(groupId => groupsById.get(groupId)?.name ?? groupId)
      .join(' / ')} 后才能启动。`;
  }

  if (guard.reason === 'quota_exceeded') {
    return `${copy.quotaExceededPrefix}${guard.blockingScopes
      .map(scope => scope.scopeLabel)
      .join('、')}${copy.quotaExceededSuffix}`;
  }

  if (guard.reason === 'quota_service_degraded') {
    return copy.quotaDegradedDescription;
  }

  if (guard.reason === 'not_authorized') {
    return copy.notAuthorized;
  }

  return `${copy.launchFromGroupPrefix}${activeGroup.name}${copy.launchFromGroupSuffix} ${app.launchCost} credits。`;
}

function getPrimaryActionLabel(
  guard: AppLaunchGuard,
  groupsById: Map<string, WorkspaceGroup>,
  copy: ReturnType<typeof useI18n>['messages']['apps']
): string {
  if (guard.reason === 'group_switch_required') {
    const nextGroupId = guard.eligibleGroupIds[0];
    const nextGroupName = nextGroupId ? groupsById.get(nextGroupId)?.name ?? nextGroupId : 'group';

    return `${copy.switchGroupPrefix} ${nextGroupName}`;
  }

  if (guard.reason === 'quota_service_degraded') {
    return copy.quotaDegradedAction;
  }

  if (guard.reason === 'quota_exceeded') {
    return copy.quotaBlockedAction;
  }

  if (guard.reason === 'not_authorized') {
    return copy.unavailableAction;
  }

  return copy.openApp;
}

type WorkspaceSectionProps = {
  title: string;
  description: string;
  apps: WorkspaceApp[];
  activeGroup: WorkspaceGroup;
  favoriteIds: string[];
  groupsById: Map<string, WorkspaceGroup>;
  quotaUsages: QuotaUsage[];
  quotaServiceState: QuotaServiceState;
  memberGroupIds: string[];
  onToggleFavorite: (appId: string) => void;
  onPrimaryAction: (app: WorkspaceApp, guard: AppLaunchGuard) => void;
  emptyMessage: string;
  copy: ReturnType<typeof useI18n>['messages']['apps'];
  locale: ReturnType<typeof useI18n>['locale'];
};

function WorkspaceSection({
  title,
  description,
  apps,
  activeGroup,
  favoriteIds,
  groupsById,
  quotaUsages,
  quotaServiceState,
  memberGroupIds,
  onToggleFavorite,
  onPrimaryAction,
  emptyMessage,
  copy,
  locale,
}: WorkspaceSectionProps) {
  return (
    <section className="workspace-section">
      <div className="section-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="workspace-count">{apps.length}</span>
      </div>

      {apps.length === 0 ? (
        <div className="workspace-empty">{emptyMessage}</div>
      ) : (
        <div className="app-grid">
          {apps.map(app => {
            const guard = evaluateAppLaunch({
              app,
              activeGroupId: activeGroup.id,
              memberGroupIds,
              quotas: quotaUsages,
              quotaServiceState,
            });

            return (
              <article className="app-card" key={app.id}>
                <div className="app-card-header">
                  <div className="app-avatar">{app.shortCode}</div>
                  <div className="app-card-copy">
                    <div className="app-title-row">
                      <h3>{app.name}</h3>
                      <span className={`status-chip status-${app.status}`}>
                        {localizeAppStatus(app.status, locale)}
                      </span>
                    </div>
                    <p>{app.summary}</p>
                  </div>
                </div>

                <div className="tag-row">
                  <span className="tag">{localizeAppKind(app.kind, locale)}</span>
                  <span className="tag">
                    {copy.searchTagCost} {app.launchCost}
                  </span>
                  {app.tags.map(tag => (
                    <span className="tag tag-muted" key={tag}>
                      {localizeAppTag(tag, locale)}
                    </span>
                  ))}
                </div>

                <p className="app-card-note">
                  {getLaunchDescription(app, guard, activeGroup, groupsById, copy)}
                </p>

                <div className="app-actions">
                  <button
                    className={favoriteIds.includes(app.id) ? 'secondary is-active' : 'secondary'}
                    type="button"
                    onClick={() => onToggleFavorite(app.id)}
                  >
                    {favoriteIds.includes(app.id) ? copy.favorited : copy.favorite}
                  </button>
                  <button
                    className="primary"
                    type="button"
                    disabled={
                      guard.reason === 'quota_exceeded' ||
                      guard.reason === 'quota_service_degraded' ||
                      guard.reason === 'not_authorized'
                    }
                    onClick={() => onPrimaryAction(app, guard)}
                  >
                    {getPrimaryActionLabel(guard, groupsById, copy)}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getNotificationTargetLabel(
  notification: WorkspaceNotification,
  copy: ReturnType<typeof useI18n>['messages']['apps']
) {
  if (notification.targetType === 'run') {
    return copy.reviewInboxCommentTargetRun;
  }

  if (notification.targetType === 'artifact') {
    return copy.reviewInboxCommentTargetArtifact;
  }

  return copy.reviewInboxCommentTargetMessage;
}

type ReviewInboxProps = {
  copy: ReturnType<typeof useI18n>['messages']['apps'];
  items: WorkspaceNotification[];
  isLoading: boolean;
  locale: ReturnType<typeof useI18n>['locale'];
  markingId: string | null;
  onMarkRead: (notificationId: string) => void;
};

function ReviewInbox({
  copy,
  items,
  isLoading,
  locale,
  markingId,
  onMarkRead,
}: ReviewInboxProps) {
  return (
    <section className="workspace-section workspace-review-inbox">
      <div className="section-header">
        <div>
          <h2>{copy.reviewInboxTitle}</h2>
          <p>{copy.reviewInboxDescription}</p>
        </div>
        <span className="workspace-count">
          {items.filter((item) => item.status === 'unread').length}
        </span>
      </div>

      {isLoading ? (
        <div className="workspace-empty">{copy.reviewInboxLoading}</div>
      ) : items.length === 0 ? (
        <div className="workspace-empty">{copy.reviewInboxEmpty}</div>
      ) : (
        <div className="workspace-notification-list">
          {items.map((notification) => (
            <article className="workspace-notification-card" key={notification.id}>
              <div className="workspace-notification-meta">
                <span
                  className={`status-chip ${
                    notification.status === 'unread' ? 'status-beta' : 'status-ready'
                  }`}
                >
                  {notification.status === 'unread'
                    ? copy.reviewInboxUnread
                    : copy.reviewInboxRead}
                </span>
                <span>{getNotificationTargetLabel(notification, copy)}</span>
                <span>{new Date(notification.createdAt).toLocaleString(locale)}</span>
              </div>
              <h3>{notification.conversationTitle}</h3>
              <p>
                {copy.reviewInboxMentionedBy}:{" "}
                {notification.actorDisplayName ?? notification.actorUserId}
              </p>
              <p>{notification.preview}</p>
              <div className="workspace-notification-actions">
                <Link className="secondary" href={`/chat/${notification.conversationId}`}>
                  {copy.reviewInboxOpen}
                </Link>
                {notification.status === 'unread' ? (
                  <button
                    className="primary"
                    type="button"
                    disabled={markingId === notification.id}
                    onClick={() => onMarkRead(notification.id)}
                  >
                    {markingId === notification.id
                      ? copy.reviewInboxMarkingRead
                      : copy.reviewInboxMarkRead}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function AppsPage() {
  const router = useRouter();
  const { locale, messages, formatDateTime } = useI18n();
  const appsCopy = messages.apps;
  const { session, isLoading } = useProtectedSession('/apps');
  const [workspace, setWorkspace] = useState<WorkspaceCatalog | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);
  const [sourceStatusItems, setSourceStatusItems] = useState<WorkspaceSourceStatusItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [activeGroupId, setActiveGroupId] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const deferredSearch = useDeferredValue(search);
  const groupsById = useMemo(
    () => new Map((workspace?.groups ?? []).map(group => [group.id, group])),
    [workspace]
  );
  const activeGroup = workspace
    ? groupsById.get(
        activeGroupId
          ? resolveActiveGroupId(
              activeGroupId,
              workspace.memberGroupIds,
              workspace.defaultActiveGroupId
            )
          : workspace.defaultActiveGroupId
      ) ?? workspace.groups[0]
    : null;

  useEffect(() => {
    if (!session) {
      setWorkspace(null);
      setWorkspaceError(null);
      setNotice(null);
      setFavoriteIds([]);
      setRecentIds([]);
      setActiveGroupId('');
      setNotifications([]);
      setMarkingNotificationId(null);
      setSourceStatusItems([]);
      return;
    }

    let isCancelled = false;

    setIsWorkspaceLoading(true);
    setIsNotificationsLoading(true);
    setWorkspaceError(null);

    Promise.all([
      fetchWorkspaceCatalog(session.sessionToken),
      fetchWorkspaceNotifications(session.sessionToken),
      fetchWorkspaceSourceStatus(session.sessionToken),
    ])
      .then(([catalogResult, notificationsResult, sourceStatusResult]) => {
        if (isCancelled) {
          return;
        }

        if (!catalogResult.ok) {
          setWorkspace(null);

          if (catalogResult.error.code === 'WORKSPACE_UNAUTHORIZED') {
            clearAuthSession(window.sessionStorage);
            router.replace('/login');
            return;
          }

          if (catalogResult.error.code === 'WORKSPACE_FORBIDDEN') {
            router.replace('/auth/pending');
            return;
          }

          setWorkspaceError(catalogResult.error.message);
          return;
        }

        setWorkspace(catalogResult.data);
        setFavoriteIds(catalogResult.data.favoriteAppIds);
        setRecentIds(catalogResult.data.recentAppIds);
        setActiveGroupId(
          resolveActiveGroupId(
            catalogResult.data.defaultActiveGroupId,
            catalogResult.data.memberGroupIds,
            catalogResult.data.defaultActiveGroupId
          )
        );

        if (!notificationsResult.ok) {
          if (notificationsResult.error.code === 'WORKSPACE_UNAUTHORIZED') {
            clearAuthSession(window.sessionStorage);
            router.replace('/login');
            return;
          }

          setNotice({
            tone: 'error',
            message: notificationsResult.error.message,
          });
          setNotifications([]);
          return;
        }

        setNotifications(notificationsResult.data.items);

        if (sourceStatusResult.ok) {
          setSourceStatusItems(sourceStatusResult.data.items);
        } else {
          setSourceStatusItems([]);
        }
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setWorkspace(null);
        setNotifications([]);
        setSourceStatusItems([]);
        setWorkspaceError(appsCopy.workspaceLoadFailed);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsWorkspaceLoading(false);
          setIsNotificationsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [appsCopy.workspaceLoadFailed, router, session]);

  if (isLoading) {
    return <p className="lead">{appsCopy.checkingSession}</p>;
  }

  if (isWorkspaceLoading) {
    return <p className="lead">{appsCopy.loadingWorkspace}</p>;
  }

  if (workspaceError) {
    return <div className="notice error">{workspaceError}</div>;
  }

  if (!session || !workspace || !activeGroup) {
    return null;
  }

  const currentSession = session;
  const workspaceState = workspace;
  const localizedApps = localizeWorkspaceCatalogApps(workspaceState.apps, locale);
  const currentActiveGroup = activeGroup;
  const quotaUsages =
    workspaceState.quotaUsagesByGroupId[currentActiveGroup.id] ??
    workspaceState.quotaUsagesByGroupId[workspaceState.defaultActiveGroupId] ??
    [];
  const quotaAlerts = listQuotaAlerts(quotaUsages);
  const sections = buildWorkspaceSections({
    apps: localizedApps,
    memberGroupIds: workspaceState.memberGroupIds,
    favoriteIds,
    recentIds,
    search: deferredSearch,
  });
  const hasAdminPreview = localizedApps.some(app => app.id === 'app_tenant_control');
  const currentGroupSourceStatuses = sourceStatusItems.filter(
    item => item.scope === 'tenant' || item.groupId === currentActiveGroup.id
  );

  function applyWorkspacePreferences(nextPreferences: {
    favoriteAppIds: string[];
    recentAppIds: string[];
    defaultActiveGroupId: string | null;
  }) {
    const resolvedDefaultActiveGroupId = resolveActiveGroupId(
      nextPreferences.defaultActiveGroupId,
      workspaceState.memberGroupIds,
      workspaceState.defaultActiveGroupId
    );

    setFavoriteIds(nextPreferences.favoriteAppIds);
    setRecentIds(nextPreferences.recentAppIds);
    setActiveGroupId(resolvedDefaultActiveGroupId);
    setWorkspace(currentWorkspace =>
      currentWorkspace
        ? {
            ...currentWorkspace,
            favoriteAppIds: nextPreferences.favoriteAppIds,
            recentAppIds: nextPreferences.recentAppIds,
            defaultActiveGroupId: resolvedDefaultActiveGroupId,
          }
        : currentWorkspace
    );
  }

  async function persistWorkspacePreferences(nextPreferences: {
    favoriteAppIds: string[];
    recentAppIds: string[];
    defaultActiveGroupId: string | null;
  }) {
    const result = await updateWorkspacePreferences(currentSession.sessionToken, nextPreferences);

    if (!result.ok) {
      if (result.error.code === 'WORKSPACE_UNAUTHORIZED') {
        clearAuthSession(window.sessionStorage);
        router.replace('/login');
        return false;
      }

      if (result.error.code === 'WORKSPACE_FORBIDDEN') {
        router.replace('/auth/pending');
        return false;
      }

      setNotice({
        tone: 'error',
        message: result.error.message,
      });
      return false;
    }

    applyWorkspacePreferences(result.data);
    return true;
  }

  async function handleToggleFavorite(appId: string) {
    await persistWorkspacePreferences({
      favoriteAppIds: toggleFavoriteApp(favoriteIds, appId),
      recentAppIds: recentIds,
      defaultActiveGroupId: currentActiveGroup.id,
    });
  }

  async function handlePrimaryAction(app: WorkspaceApp, guard: AppLaunchGuard) {
    if (guard.reason === 'group_switch_required') {
      const nextGroupId = guard.eligibleGroupIds[0];

      if (!nextGroupId) {
        return;
      }

      const nextGroup = groupsById.get(nextGroupId);

      await persistWorkspacePreferences({
        favoriteAppIds: favoriteIds,
        recentAppIds: recentIds,
        defaultActiveGroupId: nextGroupId,
      });
      setNotice({
        tone: 'info',
        message: `${appsCopy.quotaSwitchNoticePrefix}${nextGroup?.name ?? nextGroupId}${appsCopy.quotaSwitchNoticeSuffix}`,
      });
      return;
    }

    if (!guard.canLaunch) {
      setNotice({
        tone: 'error',
        message: getLaunchDescription(app, guard, currentActiveGroup, groupsById, appsCopy),
      });
      return;
    }

    const result = await launchWorkspaceApp(currentSession.sessionToken, {
      appId: app.id,
      activeGroupId: currentActiveGroup.id,
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

      setNotice({
        tone: 'error',
        message: result.error.message,
      });
      return;
    }

    router.push(result.data.launchUrl);
  }

  async function handleMarkNotificationRead(notificationId: string) {
    setMarkingNotificationId(notificationId);

    const result = await markWorkspaceNotificationRead(
      currentSession.sessionToken,
      notificationId
    );

    setMarkingNotificationId(null);

    if (!result.ok) {
      if (result.error.code === 'WORKSPACE_UNAUTHORIZED') {
        clearAuthSession(window.sessionStorage);
        router.replace('/login');
        return;
      }

      setNotice({
        tone: 'error',
        message: result.error.message,
      });
      return;
    }

    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) =>
        notification.id === notificationId ? result.data : notification
      )
    );
  }

  return (
    <div className="workspace">
      <MainSectionNav showAdminPreview={hasAdminPreview} showSecurity />

      <div className="workspace-header">
        <div className="workspace-title">
          <span className="eyebrow">{appsCopy.eyebrow}</span>
          <h1>{appsCopy.title}</h1>
          <p className="lead">
            {appsCopy.leadPrefix}
            {session.user.displayName}
            {appsCopy.leadSuffix}
          </p>
        </div>
        <div className="workspace-badges">
          <span className="workspace-badge">
            {workspaceState.apps.length} {appsCopy.authorizedApps}
          </span>
          <span className="workspace-badge">
            {appsCopy.currentGroup}: {currentActiveGroup.name}
          </span>
          <span className="workspace-badge">
            {appsCopy.snapshotTime}: {formatDateTime(workspaceState.generatedAt)}
          </span>
          <span className="workspace-badge">
            {appsCopy.securityEntry}: {messages.mainNav.securityMfa}
          </span>
        </div>
      </div>

      <div className="workspace-toolbar">
        <label className="field">
          <span>{appsCopy.workingGroup}</span>
          <select
            value={currentActiveGroup.id}
            onChange={event => {
              void persistWorkspacePreferences({
                favoriteAppIds: favoriteIds,
                recentAppIds: recentIds,
                defaultActiveGroupId: event.target.value,
              });
            }}
          >
            {workspaceState.groups
              .filter(group => workspaceState.memberGroupIds.includes(group.id))
              .map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
          </select>
        </label>

        <label className="field">
          <span>{appsCopy.searchApps}</span>
          <input
            type="search"
            placeholder={appsCopy.searchPlaceholder}
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </label>
      </div>

      {workspaceState.quotaServiceState === 'degraded' ? (
        <div className="notice info">{appsCopy.quotaDegraded}</div>
      ) : null}

      {notice ? <div className={`notice ${notice.tone}`}>{notice.message}</div> : null}

      <ReviewInbox
        copy={appsCopy}
        items={notifications}
        isLoading={isNotificationsLoading}
        locale={locale}
        markingId={markingNotificationId}
        onMarkRead={(notificationId) => {
          void handleMarkNotificationRead(notificationId);
        }}
      />

      <div className="quota-grid">
        {quotaUsages.map(usage => (
          <article className={`quota-card quota-${getQuotaSeverity(usage)}`} key={usage.scope}>
            <div className="quota-card-header">
              <span>{usage.scopeLabel}</span>
              <strong>{formatQuotaPercent(usage)}%</strong>
            </div>
            <div className="quota-progress">
              <div
                className="quota-progress-bar"
                style={{ width: `${formatQuotaPercent(usage)}%` }}
              />
            </div>
            <div className="quota-card-meta">
              <span>
                {usage.used} / {usage.limit}
              </span>
              <span>{getQuotaSeverityLabel(usage, appsCopy)}</span>
            </div>
          </article>
        ))}
      </div>

      {quotaAlerts.length > 0 ? (
        <div className="workspace-alerts">
          {quotaAlerts.map(alert => (
            <div className={`alert-pill alert-${getQuotaSeverity(alert)}`} key={alert.scope}>
              {alert.scopeLabel}: {getQuotaSeverityLabel(alert, appsCopy)}
            </div>
          ))}
        </div>
      ) : null}

      {currentGroupSourceStatuses.length > 0 ? (
        <section className="workspace-section">
          <div className="section-header">
            <div>
              <h2>来源状态</h2>
              <p>当前群组下存在需要处理的连接器来源，请优先处理 stale、revoked 或失败同步。</p>
            </div>
            <span className="workspace-count">{currentGroupSourceStatuses.length}</span>
          </div>
          <div className="stack">
            {currentGroupSourceStatuses.map(item => (
              <article className="card stack" key={item.id}>
                <div className="section-header">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.connectorTitle} · {item.connectorKind} · {item.connectorStatus}</p>
                  </div>
                  <span className={`status-chip status-${item.severity}`}>{item.reason}</span>
                </div>
                <p className="app-card-note">{item.summary}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <WorkspaceSection
        title={appsCopy.recentTitle}
        description={appsCopy.recentDescription}
        apps={sections.recent}
        activeGroup={currentActiveGroup}
        favoriteIds={favoriteIds}
        groupsById={groupsById}
        quotaUsages={quotaUsages}
        quotaServiceState={workspaceState.quotaServiceState}
        memberGroupIds={workspaceState.memberGroupIds}
        onToggleFavorite={appId => {
          void handleToggleFavorite(appId);
        }}
        onPrimaryAction={(app, guard) => {
          void handlePrimaryAction(app, guard);
        }}
        emptyMessage={appsCopy.recentEmpty}
        copy={appsCopy}
        locale={locale}
      />

      <WorkspaceSection
        title={appsCopy.favoritesTitle}
        description={appsCopy.favoritesDescription}
        apps={sections.favorites}
        activeGroup={currentActiveGroup}
        favoriteIds={favoriteIds}
        groupsById={groupsById}
        quotaUsages={quotaUsages}
        quotaServiceState={workspaceState.quotaServiceState}
        memberGroupIds={workspaceState.memberGroupIds}
        onToggleFavorite={appId => {
          void handleToggleFavorite(appId);
        }}
        onPrimaryAction={(app, guard) => {
          void handlePrimaryAction(app, guard);
        }}
        emptyMessage={appsCopy.favoritesEmpty}
        copy={appsCopy}
        locale={locale}
      />

      <WorkspaceSection
        title={appsCopy.allAppsTitle}
        description={appsCopy.allAppsDescription}
        apps={sections.all}
        activeGroup={currentActiveGroup}
        favoriteIds={favoriteIds}
        groupsById={groupsById}
        quotaUsages={quotaUsages}
        quotaServiceState={workspaceState.quotaServiceState}
        memberGroupIds={workspaceState.memberGroupIds}
        onToggleFavorite={appId => {
          void handleToggleFavorite(appId);
        }}
        onPrimaryAction={(app, guard) => {
          void handlePrimaryAction(app, guard);
        }}
        emptyMessage={appsCopy.allAppsEmpty}
        copy={appsCopy}
        locale={locale}
      />
    </div>
  );
}
