'use client';

import type {
  AdminTenantBootstrapInvitation,
  AdminTenantCreateRequest,
  AdminTenantSummary,
} from '@agentifui/shared/admin';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import {
  createAdminTenant,
  fetchAdminTenants,
  updateAdminTenantStatus,
} from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
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
  const [draft, setDraft] = useState<AdminTenantCreateRequest>(buildInitialDraft);
  const [notice, setNotice] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [latestInvitation, setLatestInvitation] =
    useState<AdminTenantBootstrapInvitation | null>(null);

  function updateDraft(
    field: keyof AdminTenantCreateRequest,
    value: AdminTenantCreateRequest[keyof AdminTenantCreateRequest]
  ) {
    setDraft(currentDraft => ({
      ...currentDraft,
      [field]: value,
    }));
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
    reload();
  }

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
          </div>

          <div className="workspace-badges">
            <span className="workspace-badge">
              Snapshot: {new Date(data.generatedAt).toLocaleString()}
            </span>
          </div>

          <div className="admin-grid">
            {data.tenants.map(tenant => {
              const isCurrentTenant = tenant.id === session?.user.tenantId;
              const nextAction = tenant.status === 'active' ? 'suspended' : 'active';
              const nextLabel = tenant.status === 'active' ? 'Suspend tenant' : 'Reactivate tenant';

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
