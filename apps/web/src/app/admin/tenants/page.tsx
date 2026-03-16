'use client';

import type {
  AdminTenantBootstrapInvitation,
  AdminTenantCreateRequest,
  AdminTenantSummary,
  AdminUsageResponse,
} from '@agentifui/shared/admin';
import { useDeferredValue, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

import {
  createAdminTenant,
  exportAdminUsage,
  fetchAdminUsage,
  fetchAdminTenants,
  updateAdminTenantStatus,
} from '../../../lib/admin-client';
import { useI18n } from '../../../components/i18n-provider';
import { useAdminPageData } from '../../../lib/use-admin-page';

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatStorageKilobytes(value: number) {
  return `${(value / 1024).toFixed(1)} KB`;
}

function buildInitialDraft(): AdminTenantCreateRequest {
  return {
    name: '',
    slug: '',
    adminEmail: '',
    adminDisplayName: '',
  };
}

export default function AdminTenantsPage() {
  const { locale, formatDateTime } = useI18n();
  const { data, error, isLoading, reload, session } = useAdminPageData(fetchAdminTenants);
  const [usageData, setUsageData] = useState<AdminUsageResponse['data'] | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState('');
  const [draft, setDraft] = useState<AdminTenantCreateRequest>(buildInitialDraft);
  const [notice, setNotice] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [usageReloadVersion, setUsageReloadVersion] = useState(0);
  const [exportingFormat, setExportingFormat] = useState<null | 'csv' | 'json'>(null);
  const [latestInvitation, setLatestInvitation] =
    useState<AdminTenantBootstrapInvitation | null>(null);
  const deferredTenantFilter = useDeferredValue(tenantFilter.trim().toLowerCase());
  const copy =
    locale === 'zh-CN'
      ? {
          loading: '正在加载平台租户...',
          usageLoadFailed: '租户用量分析加载失败，请重试。',
          exportFailed: '租户用量导出失败，请重试。',
          createFailed: '租户创建失败，请重试。',
          statusFailed: '租户生命周期状态更新失败，请重试。',
          exportNotice: (format: string, filename: string) => `${format.toUpperCase()} 用量导出已下载：${filename}`,
          createdNotice: (tenantName: string, email: string) =>
            `${tenantName} 已创建，已为 ${email} 准备引导邀请。`,
          statusNotice: (tenantName: string, status: string) => `${tenantName} 当前状态为 ${status}。`,
          suspendReason: '从租户清单发起的平台生命周期暂停',
          reactivateReason: '从租户清单发起的平台生命周期恢复',
          title: '租户',
          lead: 'Root admin 跨租户总览，覆盖生命周期状态、引导管理员邀请和默认资源规模。',
          createTenant: '创建租户',
          createLead: '这会同时创建租户、默认工作台目录、quota 种子，以及一条待接受的引导管理员邀请。',
          tenantName: '租户名称',
          tenantSlug: '租户标识',
          bootstrapAdminEmail: '引导管理员邮箱',
          bootstrapAdminName: '引导管理员显示名',
          creating: '创建中...',
          createAction: '创建租户',
          latestInvite: '最新邀请',
          invitePath: '邀请地址',
          expires: '过期时间',
          totalTenants: '租户总数',
          suspended: '已暂停',
          platformAdmins: '已知平台管理员',
          totalLaunches: '总启动次数',
          totalRuns: '总运行次数',
          totalStorage: '总存储',
          filteredTenants: '筛选后租户数',
          snapshot: '快照',
          usageSnapshot: '用量快照',
          usageAnalytics: '用量分析',
          usageLead: '按名称、应用活动或主管理员过滤租户卡片。',
          filterTenants: '筛选租户',
          filterPlaceholder: '搜索租户、应用或管理员邮箱',
          exportingJson: '导出 JSON 中...',
          exportJson: '导出用量 JSON',
          exportingCsv: '导出 CSV 中...',
          exportCsv: '导出用量 CSV',
          users: '用户',
          groups: '群组',
          apps: '应用',
          admins: '管理员',
          launchesRuns: '启动 / 运行',
          messagesArtifacts: '消息 / 产物',
          created: '创建时间',
          updated: '更新时间',
          primaryAdmin: '主管理员',
          noTenantAdmin: '未分配租户管理员',
          uploadsStorage: '上传 / 存储',
          tokensLastActivity: 'Tokens / 最近活跃',
          topApps: '高频应用',
          noAppActivity: '暂无应用活动记录',
          quotaWatch: '配额观察',
          healthy: '正常',
          noQuotaData: '暂无配额数据',
          suspendTenant: '暂停租户',
          reactivateTenant: '恢复租户',
          saving: '保存中...',
          currentTenantHint: '当前 root-admin 所在租户不能在这个会话中被暂停。',
        }
      : {
          loading: 'Loading platform tenants...',
          usageLoadFailed: 'Loading tenant usage analytics failed. Please retry.',
          exportFailed: 'Exporting tenant usage failed. Please retry.',
          createFailed: 'Creating the tenant failed. Please retry.',
          statusFailed: 'Updating the tenant lifecycle state failed. Please retry.',
          exportNotice: (format: string, filename: string) => `${format.toUpperCase()} usage export downloaded: ${filename}`,
          createdNotice: (tenantName: string, email: string) =>
            `${tenantName} created. Bootstrap invite ready for ${email}.`,
          statusNotice: (tenantName: string, status: string) => `${tenantName} is now ${status}.`,
          suspendReason: 'Platform lifecycle hold from the tenant inventory',
          reactivateReason: 'Platform lifecycle reactivation from the tenant inventory',
          title: 'Tenants',
          lead: 'Root-admin cross-tenant inventory with lifecycle status, bootstrap admin invites and default resource counts.',
          createTenant: 'Create tenant',
          createLead: 'This provisions the tenant, default workspace catalog, quota seeds and a pending bootstrap admin invitation.',
          tenantName: 'Tenant name',
          tenantSlug: 'Tenant slug',
          bootstrapAdminEmail: 'Bootstrap admin email',
          bootstrapAdminName: 'Bootstrap admin display name',
          creating: 'Creating tenant...',
          createAction: 'Create tenant',
          latestInvite: 'Latest invite',
          invitePath: 'Invite path',
          expires: 'Expires',
          totalTenants: 'Total tenants',
          suspended: 'Suspended',
          platformAdmins: 'Known platform admins',
          totalLaunches: 'Total launches',
          totalRuns: 'Total runs',
          totalStorage: 'Total storage',
          filteredTenants: 'Filtered tenants',
          snapshot: 'Snapshot',
          usageSnapshot: 'Usage snapshot',
          usageAnalytics: 'Usage analytics',
          usageLead: 'Filter tenant cards by name, app activity or primary admin.',
          filterTenants: 'Filter tenants',
          filterPlaceholder: 'Search tenant, app or admin email',
          exportingJson: 'Exporting JSON...',
          exportJson: 'Export usage JSON',
          exportingCsv: 'Exporting CSV...',
          exportCsv: 'Export usage CSV',
          users: 'Users',
          groups: 'Groups',
          apps: 'Apps',
          admins: 'Admins',
          launchesRuns: 'Launches / runs',
          messagesArtifacts: 'Messages / artifacts',
          created: 'Created',
          updated: 'Updated',
          primaryAdmin: 'Primary admin',
          noTenantAdmin: 'No tenant admin assigned',
          uploadsStorage: 'Uploads / storage',
          tokensLastActivity: 'Tokens / last activity',
          topApps: 'Top apps',
          noAppActivity: 'No recorded app activity',
          quotaWatch: 'Quota watch',
          healthy: 'Healthy',
          noQuotaData: 'No quota data',
          suspendTenant: 'Suspend tenant',
          reactivateTenant: 'Reactivate tenant',
          saving: 'Saving...',
          currentTenantHint: 'Current root-admin tenant cannot be suspended from this active session.',
        };

  useEffect(() => {
    if (!session) {
      setUsageData(null);
      setUsageError(null);
      return;
    }

    let cancelled = false;

    void fetchAdminUsage(session.sessionToken)
      .then(result => {
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setUsageError(result.error.message);
          setUsageData(null);
          return;
        }

        setUsageError(null);
        setUsageData(result.data);
      })
      .catch(() => {
        if (!cancelled) {
          setUsageError(copy.usageLoadFailed);
          setUsageData(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session, usageReloadVersion]);

  function updateDraft(
    field: keyof AdminTenantCreateRequest,
    value: AdminTenantCreateRequest[keyof AdminTenantCreateRequest]
  ) {
    setDraft(currentDraft => ({
      ...currentDraft,
      [field]: value,
    }));
  }

  async function handleUsageExport(format: 'csv' | 'json') {
    if (!session) {
      return;
    }

    setNotice(null);
    setMutationError(null);
    setExportingFormat(format);

    try {
      const result = await exportAdminUsage(session.sessionToken, format, {
        search: deferredTenantFilter || undefined,
      });

      if ('ok' in result) {
        setMutationError(result.error.message);
        return;
      }

      const objectUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');

      anchor.href = objectUrl;
      anchor.download = result.metadata.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 0);

      setNotice(copy.exportNotice(format, result.metadata.filename));
    } catch {
      setMutationError(copy.exportFailed);
    } finally {
      setExportingFormat(null);
    }
  }

  async function handleCreateTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setPendingActionId('create');
    setMutationError(null);
    setNotice(null);

    let result: Awaited<ReturnType<typeof createAdminTenant>>;

    try {
      result = await createAdminTenant(session.sessionToken, draft);
    } catch {
      setPendingActionId(null);
      setMutationError(copy.createFailed);
      return;
    }

    if (!result.ok) {
      setPendingActionId(null);
      setMutationError(result.error.message);
      return;
    }

    setPendingActionId(null);
    setDraft(buildInitialDraft());
    setLatestInvitation(result.data.bootstrapInvitation);
    setNotice(
      copy.createdNotice(result.data.tenant.name, result.data.bootstrapInvitation.email)
    );
    setUsageReloadVersion(current => current + 1);
    reload();
  }

  async function handleTenantStatusChange(
    tenant: AdminTenantSummary,
    status: 'active' | 'suspended'
  ) {
    if (!session) {
      return;
    }

    setPendingActionId(`${status}:${tenant.id}`);
    setMutationError(null);
    setNotice(null);

    let result: Awaited<ReturnType<typeof updateAdminTenantStatus>>;

    try {
      result = await updateAdminTenantStatus(session.sessionToken, tenant.id, {
        status,
        reason:
          status === 'suspended'
            ? copy.suspendReason
            : copy.reactivateReason,
      });
    } catch {
      setPendingActionId(null);
      setMutationError(copy.statusFailed);
      return;
    }

    if (!result.ok) {
      setPendingActionId(null);
      setMutationError(result.error.message);
      return;
    }

    setPendingActionId(null);
    setNotice(copy.statusNotice(result.data.tenant.name, result.data.tenant.status));
    setUsageReloadVersion(current => current + 1);
    reload();
  }

  const usageByTenantId = new Map(
    (usageData?.tenants ?? []).map(summary => [summary.tenantId, summary] as const)
  );
  const filteredTenants = (data?.tenants ?? []).filter(tenant => {
    if (!deferredTenantFilter) {
      return true;
    }

    const usage = usageByTenantId.get(tenant.id);
    const haystacks = [
      tenant.name,
      tenant.slug,
      tenant.id,
      tenant.primaryAdmin?.email ?? '',
      ...(usage?.appBreakdown.map(app => app.appName) ?? []),
    ];

    return haystacks.some(value => value.toLowerCase().includes(deferredTenantFilter));
  });

  if (isLoading) {
    return <p className="lead">{copy.loading}</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>{copy.title}</h1>
        <p className="lead">{copy.lead}</p>
      </div>

      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {usageError ? <div className="notice error">{usageError}</div> : null}
      {mutationError ? <div className="notice error">{mutationError}</div> : null}

      <section className="admin-card stack">
        <div>
          <h2>{copy.createTenant}</h2>
          <p className="helper-text">{copy.createLead}</p>
        </div>

        <form className="admin-grant-form" onSubmit={handleCreateTenant}>
          <label className="field">
            {copy.tenantName}
            <input
              aria-label="Tenant name"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateDraft('name', event.target.value)
              }
              placeholder="Acme Research"
              value={draft.name}
            />
          </label>

          <label className="field">
            {copy.tenantSlug}
            <input
              aria-label="Tenant slug"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateDraft('slug', event.target.value)
              }
              placeholder="acme-research"
              value={draft.slug}
            />
          </label>

          <label className="field">
            {copy.bootstrapAdminEmail}
            <input
              aria-label="Bootstrap admin email"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateDraft('adminEmail', event.target.value)
              }
              placeholder="owner@example.com"
              value={draft.adminEmail}
            />
          </label>

          <label className="field">
            {copy.bootstrapAdminName}
            <input
              aria-label="Bootstrap admin display name"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateDraft('adminDisplayName', event.target.value)
              }
              placeholder="Acme Owner"
              value={draft.adminDisplayName ?? ''}
            />
          </label>

          <button className="primary" disabled={pendingActionId === 'create'} type="submit">
            {pendingActionId === 'create' ? copy.creating : copy.createAction}
          </button>
        </form>

        {latestInvitation ? (
          <div className="detail-list">
            <div className="detail-row">
              <span className="detail-label">{copy.latestInvite}</span>
              <strong>{latestInvitation.email}</strong>
            </div>
            <div className="detail-row">
              <span className="detail-label">{copy.invitePath}</span>
              <strong>{latestInvitation.inviteUrl}</strong>
            </div>
            <div className="detail-row">
              <span className="detail-label">{copy.expires}</span>
              <strong>{formatDateTime(latestInvitation.expiresAt)}</strong>
            </div>
          </div>
        ) : null}
      </section>

      {!data ? null : (
        <>
          <div className="admin-stat-grid">
            <article className="admin-stat-card">
              <span>{copy.totalTenants}</span>
              <strong>{data.tenants.length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{copy.suspended}</span>
              <strong>{data.tenants.filter(tenant => tenant.status === 'suspended').length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{copy.platformAdmins}</span>
              <strong>{data.tenants.filter(tenant => tenant.primaryAdmin).length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{copy.totalLaunches}</span>
              <strong>{usageData?.totals.launchCount ?? 0}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{copy.totalRuns}</span>
              <strong>{usageData?.totals.runCount ?? 0}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{copy.totalStorage}</span>
              <strong>{formatStorageKilobytes(usageData?.totals.totalStorageBytes ?? 0)}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{copy.filteredTenants}</span>
              <strong>{filteredTenants.length}</strong>
            </article>
          </div>

          <div className="workspace-badges">
            <span className="workspace-badge">
              {copy.snapshot}: {formatDateTime(data.generatedAt)}
            </span>
            {usageData ? (
              <span className="workspace-badge">
                {copy.usageSnapshot}: {formatDateTime(usageData.generatedAt)}
              </span>
            ) : null}
          </div>

          <section className="admin-card stack">
            <div className="section-header">
              <div>
                <h2>{copy.usageAnalytics}</h2>
                <p>{copy.usageLead}</p>
              </div>
            </div>

            <div className="admin-grant-form">
              <label className="field">
                {copy.filterTenants}
                <input
                  aria-label="Filter tenants"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setTenantFilter(event.target.value)}
                  placeholder={copy.filterPlaceholder}
                  value={tenantFilter}
                />
              </label>

              <button
                className="secondary"
                disabled={!session || exportingFormat !== null}
                onClick={() => {
                  void handleUsageExport('json');
                }}
                type="button"
              >
                {exportingFormat === 'json' ? copy.exportingJson : copy.exportJson}
              </button>

              <button
                className="secondary"
                disabled={!session || exportingFormat !== null}
                onClick={() => {
                  void handleUsageExport('csv');
                }}
                type="button"
              >
                {exportingFormat === 'csv' ? copy.exportingCsv : copy.exportCsv}
              </button>
            </div>
          </section>

          <div className="admin-grid">
            {filteredTenants.map(tenant => {
              const isCurrentTenant = tenant.id === session?.user.tenantId;
              const nextAction = tenant.status === 'active' ? 'suspended' : 'active';
              const nextLabel = tenant.status === 'active' ? copy.suspendTenant : copy.reactivateTenant;
              const usage = usageByTenantId.get(tenant.id) ?? null;

              return (
                <article className="admin-card" key={tenant.id}>
                  <div className="section-header">
                    <div>
                      <h2>{tenant.name}</h2>
                      <p>
                        {tenant.slug} · {tenant.id}
                      </p>
                    </div>
                    <span className={`status-chip status-${tenant.status}`}>{tenant.status}</span>
                  </div>

                  <div className="admin-stat-grid">
                    <article className="admin-stat-card">
                      <span>{copy.users}</span>
                      <strong>{tenant.userCount}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>{copy.groups}</span>
                      <strong>{tenant.groupCount}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>{copy.apps}</span>
                      <strong>{tenant.appCount}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>{copy.admins}</span>
                      <strong>{tenant.adminCount}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>{copy.launchesRuns}</span>
                      <strong>
                        {usage?.launchCount ?? 0} / {usage?.runCount ?? 0}
                      </strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>{copy.messagesArtifacts}</span>
                      <strong>
                        {usage?.messageCount ?? 0} / {usage?.artifactCount ?? 0}
                      </strong>
                    </article>
                  </div>

                  <div className="detail-list">
                    <div className="detail-row">
                      <span className="detail-label">{copy.created}</span>
                      <strong>{formatDateTime(tenant.createdAt)}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{copy.updated}</span>
                      <strong>{formatDateTime(tenant.updatedAt)}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{copy.primaryAdmin}</span>
                      <strong>
                        {tenant.primaryAdmin
                          ? `${tenant.primaryAdmin.displayName} · ${tenant.primaryAdmin.email}`
                          : copy.noTenantAdmin}
                      </strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{copy.uploadsStorage}</span>
                      <strong>
                        {usage?.uploadedFileCount ?? 0} /{' '}
                        {formatStorageKilobytes(usage?.totalStorageBytes ?? 0)}
                      </strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{copy.tokensLastActivity}</span>
                      <strong>
                        {usage?.totalTokens ?? 0}
                        {usage?.lastActivityAt ? ` · ${formatDateTime(usage.lastActivityAt)}` : ''}
                      </strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{copy.topApps}</span>
                      <strong>
                        {usage?.appBreakdown.length
                          ? usage.appBreakdown
                              .slice(0, 3)
                              .map(app => `${app.appName} ${app.launchCount}/${app.runCount}`)
                              .join(' · ')
                          : copy.noAppActivity}
                      </strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{copy.quotaWatch}</span>
                      <strong>
                        {usage?.quotaUsage.length
                          ? usage.quotaUsage
                              .filter(quota => quota.isOverLimit || quota.utilizationPercent >= 85)
                              .slice(0, 3)
                              .map(quota => `${quota.scopeLabel} ${quota.actualUsed}/${quota.monthlyLimit}`)
                              .join(' · ') || copy.healthy
                          : copy.noQuotaData}
                      </strong>
                    </div>
                  </div>

                  <button
                    className="secondary"
                    disabled={isCurrentTenant || pendingActionId === `${nextAction}:${tenant.id}`}
                    onClick={() => handleTenantStatusChange(tenant, nextAction)}
                    type="button"
                  >
                    {pendingActionId === `${nextAction}:${tenant.id}` ? copy.saving : nextLabel}
                  </button>

                  {isCurrentTenant ? (
                    <p className="helper-text">
                      {copy.currentTenantHint}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
