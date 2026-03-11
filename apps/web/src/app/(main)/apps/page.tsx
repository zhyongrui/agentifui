'use client';

import {
  buildWorkspaceSections,
  evaluateAppLaunch,
  getQuotaSeverity,
  listQuotaAlerts,
  listVisibleApps,
  type AppLaunchGuard,
  type QuotaServiceState,
  type QuotaUsage,
  type WorkspaceApp,
  type WorkspaceGroup,
} from '@agentifui/shared/apps';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import {
  createAppsWorkspaceFixture,
  readStoredGroupId,
  readStoredIds,
  recordRecentApp,
  resolveActiveGroupId,
  toggleFavoriteApp,
  WORKSPACE_ACTIVE_GROUP_KEY,
  WORKSPACE_FAVORITES_KEY,
  WORKSPACE_RECENTS_KEY,
  writeStoredGroupId,
  writeStoredIds,
} from '../../../lib/apps-workspace';
import { useProtectedSession } from '../../../lib/use-protected-session';

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

function getQuotaSeverityLabel(usage: QuotaUsage): string {
  const severity = getQuotaSeverity(usage);

  if (severity === 'warning') {
    return '80% threshold reached';
  }

  if (severity === 'critical') {
    return '90% threshold reached';
  }

  if (severity === 'blocked') {
    return 'Limit reached';
  }

  return 'Within range';
}

function getLaunchDescription(
  app: WorkspaceApp,
  guard: AppLaunchGuard,
  activeGroup: WorkspaceGroup,
  groupsById: Map<string, WorkspaceGroup>
): string {
  if (guard.reason === 'group_switch_required') {
    return `当前群组无法归因此应用，切换到 ${guard.eligibleGroupIds
      .map(groupId => groupsById.get(groupId)?.name ?? groupId)
      .join(' / ')} 后才能启动。`;
  }

  if (guard.reason === 'quota_exceeded') {
    return `本次启动会超过 ${guard.blockingScopes
      .map(scope => scope.scopeLabel)
      .join('、')}，因此被拦截。`;
  }

  if (guard.reason === 'quota_service_degraded') {
    return '当前处于配额服务降级模式，目录可查看，但新启动会被暂停。';
  }

  if (guard.reason === 'not_authorized') {
    return '当前账号没有这个应用的访问授权。';
  }

  return `启动后将从 ${activeGroup.name} 归因扣减 ${app.launchCost} credits。`;
}

function getPrimaryActionLabel(
  guard: AppLaunchGuard,
  groupsById: Map<string, WorkspaceGroup>
): string {
  if (guard.reason === 'group_switch_required') {
    const nextGroupId = guard.eligibleGroupIds[0];
    const nextGroupName = nextGroupId ? groupsById.get(nextGroupId)?.name ?? nextGroupId : 'group';

    return `切换到 ${nextGroupName}`;
  }

  if (guard.reason === 'quota_service_degraded') {
    return '配额服务降级中';
  }

  if (guard.reason === 'quota_exceeded') {
    return '配额不足';
  }

  if (guard.reason === 'not_authorized') {
    return '不可用';
  }

  return '打开应用';
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
                  <span className="tag">Cost {app.launchCost}</span>
                  {app.tags.map(tag => (
                    <span className="tag tag-muted" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>

                <p className="app-card-note">
                  {getLaunchDescription(app, guard, activeGroup, groupsById)}
                </p>

                <div className="app-actions">
                  <button
                    className={favoriteIds.includes(app.id) ? 'secondary is-active' : 'secondary'}
                    type="button"
                    onClick={() => onToggleFavorite(app.id)}
                  >
                    {favoriteIds.includes(app.id) ? '已收藏' : '收藏'}
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
                    {getPrimaryActionLabel(guard, groupsById)}
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
  const { session, isLoading } = useProtectedSession('/apps');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [activeGroupId, setActiveGroupId] = useState('');
  const [search, setSearch] = useState('');
  const [quotaServiceState, setQuotaServiceState] = useState<QuotaServiceState>('available');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [hasLoadedWorkspaceState, setHasLoadedWorkspaceState] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const fixture = useMemo(
    () => (session ? createAppsWorkspaceFixture(session) : null),
    [session?.sessionToken, session?.user.id, session?.user.tenantId]
  );
  const groupsById = useMemo(
    () => new Map((fixture?.groups ?? []).map(group => [group.id, group])),
    [fixture]
  );
  const activeGroup = fixture
    ? groupsById.get(
        activeGroupId
          ? resolveActiveGroupId(activeGroupId, fixture.memberGroupIds, fixture.initialActiveGroupId)
          : fixture.initialActiveGroupId
      ) ?? fixture.groups[0]
    : null;

  useEffect(() => {
    if (!fixture) {
      setHasLoadedWorkspaceState(false);
      return;
    }

    const storage = window.localStorage;

    setFavoriteIds(readStoredIds(storage, WORKSPACE_FAVORITES_KEY));
    setRecentIds(readStoredIds(storage, WORKSPACE_RECENTS_KEY));
    setActiveGroupId(
      resolveActiveGroupId(
        readStoredGroupId(storage, WORKSPACE_ACTIVE_GROUP_KEY),
        fixture.memberGroupIds,
        fixture.initialActiveGroupId
      )
    );
    setHasLoadedWorkspaceState(true);
  }, [fixture]);

  useEffect(() => {
    if (!fixture || !hasLoadedWorkspaceState) {
      return;
    }

    const storage = window.localStorage;

    writeStoredIds(storage, WORKSPACE_FAVORITES_KEY, favoriteIds);
    writeStoredIds(storage, WORKSPACE_RECENTS_KEY, recentIds);
    writeStoredGroupId(
      storage,
      WORKSPACE_ACTIVE_GROUP_KEY,
      resolveActiveGroupId(activeGroupId, fixture.memberGroupIds, fixture.initialActiveGroupId)
    );
  }, [activeGroupId, favoriteIds, fixture, hasLoadedWorkspaceState, recentIds]);

  if (isLoading) {
    return <p className="lead">Checking your session...</p>;
  }

  if (!session || !fixture || !activeGroup) {
    return null;
  }

  const currentActiveGroup = activeGroup;
  const quotaUsages =
    fixture.quotaUsagesByGroupId[currentActiveGroup.id] ??
    fixture.quotaUsagesByGroupId[fixture.initialActiveGroupId] ??
    [];
  const quotaAlerts = listQuotaAlerts(quotaUsages);
  const visibleApps = listVisibleApps(fixture.apps, fixture.memberGroupIds);
  const sections = buildWorkspaceSections({
    apps: fixture.apps,
    memberGroupIds: fixture.memberGroupIds,
    favoriteIds,
    recentIds,
    search: deferredSearch,
  });

  function handleToggleFavorite(appId: string) {
    setFavoriteIds(currentIds => toggleFavoriteApp(currentIds, appId));
  }

  function handlePrimaryAction(app: WorkspaceApp, guard: AppLaunchGuard) {
    if (guard.reason === 'group_switch_required') {
      const nextGroupId = guard.eligibleGroupIds[0];

      if (!nextGroupId) {
        return;
      }

      const nextGroup = groupsById.get(nextGroupId);

      setActiveGroupId(nextGroupId);
      setNotice({
        tone: 'info',
        message: `工作群组已切换到 ${nextGroup?.name ?? nextGroupId}，可以重新发起应用启动。`,
      });
      return;
    }

    if (!guard.canLaunch) {
      setNotice({
        tone: 'error',
        message: getLaunchDescription(app, guard, currentActiveGroup, groupsById),
      });
      return;
    }

    setRecentIds(currentIds => recordRecentApp(currentIds, app.id));
    setNotice({
      tone: 'success',
      message: `${app.name} 已进入启动准备态。当前配额将归因到 ${currentActiveGroup.name}，真实会话入口会在 S2-2 接入。`,
    });
  }

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div className="workspace-title">
          <span className="eyebrow">S1-3 Workspace</span>
          <h1>Apps workspace</h1>
          <p className="lead">
            欢迎回来，{session.user.displayName}。这里已经从占位页升级为可工作的应用目录切片，包含授权可见性、最近使用、收藏、搜索和配额边界预检。
          </p>
        </div>
        <div className="workspace-badges">
          <span className="workspace-badge">{visibleApps.length} 个授权应用</span>
          <span className="workspace-badge">
            {fixture.apps.length - visibleApps.length} 个应用因授权未显示
          </span>
          <span className="workspace-badge">当前群组: {currentActiveGroup.name}</span>
        </div>
      </div>

      <div className="workspace-toolbar">
        <label className="field">
          <span>Working group</span>
          <select
            value={currentActiveGroup.id}
            onChange={event => setActiveGroupId(event.target.value)}
          >
            {fixture.groups
              .filter(group => fixture.memberGroupIds.includes(group.id))
              .map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
          </select>
        </label>

        <label className="field">
          <span>Search apps</span>
          <input
            type="search"
            placeholder="Search by name, description or tag"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </label>

        <div className="field workspace-toggle">
          <span>Quota mode</span>
          <button
            className="secondary"
            type="button"
            onClick={() =>
              setQuotaServiceState(currentState =>
                currentState === 'available' ? 'degraded' : 'available'
              )
            }
          >
            {quotaServiceState === 'available'
              ? '模拟配额服务降级'
              : '恢复正常配额检查'}
          </button>
        </div>
      </div>

      {quotaServiceState === 'degraded' ? (
        <div className="notice info">
          配额服务当前被模拟为不可用状态。应用目录仍然可浏览，但新启动会被统一暂停，这一行为对齐 `AC-S1-3-B01`。
        </div>
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
              <span>{getQuotaSeverityLabel(usage)}</span>
            </div>
          </article>
        ))}
      </div>

      {quotaAlerts.length > 0 ? (
        <div className="workspace-alerts">
          {quotaAlerts.map(alert => (
            <div className={`alert-pill alert-${getQuotaSeverity(alert)}`} key={alert.scope}>
              {alert.scopeLabel}: {getQuotaSeverityLabel(alert)}
            </div>
          ))}
        </div>
      ) : null}

      <WorkspaceSection
        title="Recent"
        description="按照最近一次成功进入启动准备态的时间倒序展示。"
        apps={sections.recent}
        activeGroup={currentActiveGroup}
        favoriteIds={favoriteIds}
        groupsById={groupsById}
        quotaUsages={quotaUsages}
        quotaServiceState={quotaServiceState}
        memberGroupIds={fixture.memberGroupIds}
        onToggleFavorite={handleToggleFavorite}
        onPrimaryAction={handlePrimaryAction}
        emptyMessage="还没有最近使用记录。先从下面的应用目录里打开一个应用。"
      />

      <WorkspaceSection
        title="Favorites"
        description="收藏常用应用，保持工作台入口稳定。"
        apps={sections.favorites}
        activeGroup={currentActiveGroup}
        favoriteIds={favoriteIds}
        groupsById={groupsById}
        quotaUsages={quotaUsages}
        quotaServiceState={quotaServiceState}
        memberGroupIds={fixture.memberGroupIds}
        onToggleFavorite={handleToggleFavorite}
        onPrimaryAction={handlePrimaryAction}
        emptyMessage="还没有收藏应用。你可以在任何应用卡片上点击“收藏”。"
      />

      <WorkspaceSection
        title="All apps"
        description="展示当前账号通过群组授权并集可见的全部应用。"
        apps={sections.all}
        activeGroup={currentActiveGroup}
        favoriteIds={favoriteIds}
        groupsById={groupsById}
        quotaUsages={quotaUsages}
        quotaServiceState={quotaServiceState}
        memberGroupIds={fixture.memberGroupIds}
        onToggleFavorite={handleToggleFavorite}
        onPrimaryAction={handlePrimaryAction}
        emptyMessage="没有匹配的应用，换个关键词试试。"
      />
    </div>
  );
}
