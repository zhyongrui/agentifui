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
  recordRecentApp,
  resolveActiveGroupId,
  toggleFavoriteApp,
} from '../../../lib/apps-workspace';
import {
  fetchWorkspaceCatalog,
  launchWorkspaceApp,
  updateWorkspacePreferences,
} from '../../../lib/apps-client';
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
  const router = useRouter();
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
        setWorkspaceError('Apps workspace 加载失败，请稍后重试。');
      })
      .finally(() => {
        if (!isCancelled) {
          setIsWorkspaceLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [router, session]);

  if (isLoading) {
    return <p className="lead">Checking your session...</p>;
  }

  if (isWorkspaceLoading) {
    return <p className="lead">Loading apps workspace...</p>;
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

    const nextRecentIds = recordRecentApp(recentIds, app.id);

    setRecentIds(nextRecentIds);
    setActiveGroupId(result.data.attributedGroup.id);
    setWorkspace(currentWorkspace =>
      currentWorkspace
        ? {
            ...currentWorkspace,
            recentAppIds: nextRecentIds,
            defaultActiveGroupId: result.data.attributedGroup.id,
          }
        : currentWorkspace
    );
    setNotice({
      tone: 'success',
      message: `${result.data.app.name} 已进入启动准备态。Handoff 已创建，当前配额归因到 ${result.data.attributedGroup.name}，真实会话入口会在 R6-B / S2-2 接入。`,
    });
  }

  return (
    <div className="workspace">
      <MainSectionNav showAdminPreview={hasAdminPreview} showSecurity />

      <div className="workspace-header">
        <div className="workspace-title">
          <span className="eyebrow">S1-3 Workspace</span>
          <h1>Apps workspace</h1>
          <p className="lead">
            欢迎回来，{session.user.displayName}。这里现在由 Gateway 返回真实工作台目录，并持久化收藏、最近使用、默认工作群组和首版 launch handoff。
          </p>
        </div>
        <div className="workspace-badges">
          <span className="workspace-badge">{workspaceState.apps.length} 个授权应用</span>
          <span className="workspace-badge">当前群组: {currentActiveGroup.name}</span>
          <span className="workspace-badge">
            目录时间: {new Date(workspaceState.generatedAt).toLocaleString()}
          </span>
          <span className="workspace-badge">安全入口: Security / MFA</span>
        </div>
      </div>

      <div className="workspace-toolbar">
        <label className="field">
          <span>Working group</span>
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
          <span>Search apps</span>
          <input
            type="search"
            placeholder="Search by name, description or tag"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </label>
      </div>

      {workspaceState.quotaServiceState === 'degraded' ? (
        <div className="notice info">
          配额服务当前由 Gateway 标记为降级状态。应用目录仍然可浏览，但新启动会被统一暂停，这一行为对齐 `AC-S1-3-B01`。
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
        quotaServiceState={workspaceState.quotaServiceState}
        memberGroupIds={workspaceState.memberGroupIds}
        onToggleFavorite={appId => {
          void handleToggleFavorite(appId);
        }}
        onPrimaryAction={(app, guard) => {
          void handlePrimaryAction(app, guard);
        }}
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
        quotaServiceState={workspaceState.quotaServiceState}
        memberGroupIds={workspaceState.memberGroupIds}
        onToggleFavorite={appId => {
          void handleToggleFavorite(appId);
        }}
        onPrimaryAction={(app, guard) => {
          void handlePrimaryAction(app, guard);
        }}
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
        quotaServiceState={workspaceState.quotaServiceState}
        memberGroupIds={workspaceState.memberGroupIds}
        onToggleFavorite={appId => {
          void handleToggleFavorite(appId);
        }}
        onPrimaryAction={(app, guard) => {
          void handlePrimaryAction(app, guard);
        }}
        emptyMessage="没有匹配的应用，换个关键词试试。"
      />
    </div>
  );
}
