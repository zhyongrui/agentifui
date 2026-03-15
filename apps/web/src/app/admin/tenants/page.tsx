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
          setUsageError('Loading tenant usage analytics failed. Please retry.');
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

      setNotice(`${format.toUpperCase()} usage export downloaded: ${result.metadata.filename}`);
    } catch {
      setMutationError('Exporting tenant usage failed. Please retry.');
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
      setMutationError('Creating the tenant failed. Please retry.');
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
      `${result.data.tenant.name} created. Bootstrap invite ready for ${result.data.bootstrapInvitation.email}.`
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
            ? 'Platform lifecycle hold from the tenant inventory'
            : 'Platform lifecycle reactivation from the tenant inventory',
      });
    } catch {
      setPendingActionId(null);
      setMutationError('Updating the tenant lifecycle state failed. Please retry.');
      return;
    }

    if (!result.ok) {
      setPendingActionId(null);
      setMutationError(result.error.message);
      return;
    }

    setPendingActionId(null);
    setNotice(`${result.data.tenant.name} is now ${result.data.tenant.status}.`);
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
    return <p className="lead">Loading platform tenants...</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>Tenants</h1>
        <p className="lead">
          Root-admin cross-tenant inventory with lifecycle status, bootstrap admin invites and
          default resource counts.
        </p>
      </div>

      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {usageError ? <div className="notice error">{usageError}</div> : null}
      {mutationError ? <div className="notice error">{mutationError}</div> : null}

      <section className="admin-card stack">
        <div>
          <h2>Create tenant</h2>
          <p className="helper-text">
            This provisions the tenant, default workspace catalog, quota seeds and a pending
            bootstrap admin invitation.
          </p>
        </div>

        <form className="admin-grant-form" onSubmit={handleCreateTenant}>
          <label className="field">
            Tenant name
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
            Tenant slug
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
            Bootstrap admin email
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
            Bootstrap admin display name
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
            {pendingActionId === 'create' ? 'Creating tenant...' : 'Create tenant'}
          </button>
        </form>

        {latestInvitation ? (
          <div className="detail-list">
            <div className="detail-row">
              <span className="detail-label">Latest invite</span>
              <strong>{latestInvitation.email}</strong>
            </div>
            <div className="detail-row">
              <span className="detail-label">Invite path</span>
              <strong>{latestInvitation.inviteUrl}</strong>
            </div>
            <div className="detail-row">
              <span className="detail-label">Expires</span>
              <strong>{formatTimestamp(latestInvitation.expiresAt)}</strong>
            </div>
          </div>
        ) : null}
      </section>

      {!data ? null : (
        <>
          <div className="admin-stat-grid">
            <article className="admin-stat-card">
              <span>Total tenants</span>
              <strong>{data.tenants.length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Suspended</span>
              <strong>{data.tenants.filter(tenant => tenant.status === 'suspended').length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Known platform admins</span>
              <strong>{data.tenants.filter(tenant => tenant.primaryAdmin).length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Total launches</span>
              <strong>{usageData?.totals.launchCount ?? 0}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Total runs</span>
              <strong>{usageData?.totals.runCount ?? 0}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Total storage</span>
              <strong>{formatStorageKilobytes(usageData?.totals.totalStorageBytes ?? 0)}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Filtered tenants</span>
              <strong>{filteredTenants.length}</strong>
            </article>
          </div>

          <div className="workspace-badges">
            <span className="workspace-badge">
              Snapshot: {new Date(data.generatedAt).toLocaleString()}
            </span>
            {usageData ? (
              <span className="workspace-badge">
                Usage snapshot: {new Date(usageData.generatedAt).toLocaleString()}
              </span>
            ) : null}
          </div>

          <section className="admin-card stack">
            <div className="section-header">
              <div>
                <h2>Usage analytics</h2>
                <p>Filter tenant cards by name, app activity or primary admin.</p>
              </div>
            </div>

            <div className="admin-grant-form">
              <label className="field">
                Filter tenants
                <input
                  aria-label="Filter tenants"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setTenantFilter(event.target.value)}
                  placeholder="Search tenant, app or admin email"
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
                {exportingFormat === 'json' ? 'Exporting JSON...' : 'Export usage JSON'}
              </button>

              <button
                className="secondary"
                disabled={!session || exportingFormat !== null}
                onClick={() => {
                  void handleUsageExport('csv');
                }}
                type="button"
              >
                {exportingFormat === 'csv' ? 'Exporting CSV...' : 'Export usage CSV'}
              </button>
            </div>
          </section>

          <div className="admin-grid">
            {filteredTenants.map(tenant => {
              const isCurrentTenant = tenant.id === session?.user.tenantId;
              const nextAction = tenant.status === 'active' ? 'suspended' : 'active';
              const nextLabel = tenant.status === 'active' ? 'Suspend tenant' : 'Reactivate tenant';
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
                      <span>Users</span>
                      <strong>{tenant.userCount}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Groups</span>
                      <strong>{tenant.groupCount}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Apps</span>
                      <strong>{tenant.appCount}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Admins</span>
                      <strong>{tenant.adminCount}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Launches / runs</span>
                      <strong>
                        {usage?.launchCount ?? 0} / {usage?.runCount ?? 0}
                      </strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Messages / artifacts</span>
                      <strong>
                        {usage?.messageCount ?? 0} / {usage?.artifactCount ?? 0}
                      </strong>
                    </article>
                  </div>

                  <div className="detail-list">
                    <div className="detail-row">
                      <span className="detail-label">Created</span>
                      <strong>{formatTimestamp(tenant.createdAt)}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Updated</span>
                      <strong>{formatTimestamp(tenant.updatedAt)}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Primary admin</span>
                      <strong>
                        {tenant.primaryAdmin
                          ? `${tenant.primaryAdmin.displayName} · ${tenant.primaryAdmin.email}`
                          : 'No tenant admin assigned'}
                      </strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Uploads / storage</span>
                      <strong>
                        {usage?.uploadedFileCount ?? 0} /{' '}
                        {formatStorageKilobytes(usage?.totalStorageBytes ?? 0)}
                      </strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Tokens / last activity</span>
                      <strong>
                        {usage?.totalTokens ?? 0}
                        {usage?.lastActivityAt ? ` · ${formatTimestamp(usage.lastActivityAt)}` : ''}
                      </strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Top apps</span>
                      <strong>
                        {usage?.appBreakdown.length
                          ? usage.appBreakdown
                              .slice(0, 3)
                              .map(app => `${app.appName} ${app.launchCount}/${app.runCount}`)
                              .join(' · ')
                          : 'No recorded app activity'}
                      </strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Quota watch</span>
                      <strong>
                        {usage?.quotaUsage.length
                          ? usage.quotaUsage
                              .filter(quota => quota.isOverLimit || quota.utilizationPercent >= 85)
                              .slice(0, 3)
                              .map(quota => `${quota.scopeLabel} ${quota.actualUsed}/${quota.monthlyLimit}`)
                              .join(' · ') || 'Healthy'
                          : 'No quota data'}
                      </strong>
                    </div>
                  </div>

                  <button
                    className="secondary"
                    disabled={isCurrentTenant || pendingActionId === `${nextAction}:${tenant.id}`}
                    onClick={() => handleTenantStatusChange(tenant, nextAction)}
                    type="button"
                  >
                    {pendingActionId === `${nextAction}:${tenant.id}` ? 'Saving...' : nextLabel}
                  </button>

                  {isCurrentTenant ? (
                    <p className="helper-text">
                      Current root-admin tenant cannot be suspended from this active session.
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
