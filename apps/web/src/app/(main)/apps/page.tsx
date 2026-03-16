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
} from '@agentifui/shared/apps';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import {
  resolveActiveGroupId,
  toggleFavoriteApp,
} from '../../../lib/apps-workspace';
import {
  fetchWorkspaceCatalog,
  launchWorkspaceApp,
  updateWorkspacePreferences,
} from '../../../lib/apps-client';
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
                      <span className={`status-chip status-${app.status}`}>{app.status}</span>
                    </div>
                    <p>{app.summary}</p>
                  </div>
                </div>

                <div className="tag-row">
                  <span className="tag">{app.kind}</span>
                  <span className="tag">
                    {copy.searchTagCost} {app.launchCost}
                  </span>
                  {app.tags.map(tag => (
                    <span className="tag tag-muted" key={tag}>
                      {tag}
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

export default function AppsPage() {
  const router = useRouter();
  const { messages, formatDateTime } = useI18n();
  const appsCopy = messages.apps;
  const { session, isLoading } = useProtectedSession('/apps');
  const [workspace, setWorkspace] = useState<WorkspaceCatalog | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
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
      return;
    }

    let isCancelled = false;

    setIsWorkspaceLoading(true);
    setWorkspaceError(null);

    fetchWorkspaceCatalog(session.sessionToken)
      .then(result => {
        if (isCancelled) {
          return;
        }

        if (!result.ok) {
          setWorkspace(null);

          if (result.error.code === 'WORKSPACE_UNAUTHORIZED') {
            clearAuthSession(window.sessionStorage);
            router.replace('/login');
            return;
          }

          if (result.error.code === 'WORKSPACE_FORBIDDEN') {
            router.replace('/auth/pending');
            return;
          }

          setWorkspaceError(result.error.message);
          return;
        }

        setWorkspace(result.data);
        setFavoriteIds(result.data.favoriteAppIds);
        setRecentIds(result.data.recentAppIds);
        setActiveGroupId(
          resolveActiveGroupId(
            result.data.defaultActiveGroupId,
            result.data.memberGroupIds,
            result.data.defaultActiveGroupId
          )
        );
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setWorkspace(null);
        setWorkspaceError(appsCopy.workspaceLoadFailed);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsWorkspaceLoading(false);
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
  const currentActiveGroup = activeGroup;
  const quotaUsages =
    workspaceState.quotaUsagesByGroupId[currentActiveGroup.id] ??
    workspaceState.quotaUsagesByGroupId[workspaceState.defaultActiveGroupId] ??
    [];
  const quotaAlerts = listQuotaAlerts(quotaUsages);
  const sections = buildWorkspaceSections({
    apps: workspaceState.apps,
    memberGroupIds: workspaceState.memberGroupIds,
    favoriteIds,
    recentIds,
    search: deferredSearch,
  });
  const hasAdminPreview = workspaceState.apps.some(app => app.id === 'app_tenant_control');

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
      />
    </div>
  );
}
