'use client';

import type {
  AdminAppGrantCreateRequest,
  AdminAppSummary,
  WorkspaceAppToolSummary,
} from '@agentifui/shared';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

import {
  WorkspaceRuntimeDegradedBanner,
  WorkspaceRuntimeHealthCards,
} from '../../../components/workspace-runtime-health';
import {
  createAdminAppGrant,
  fetchAdminApps,
  fetchAdminCleanup,
  revokeAdminAppGrant,
  updateAdminAppTools,
} from '../../../lib/admin-client';
import {
  fetchGatewayHealth,
  type GatewayRuntimeHealthSnapshot,
} from '../../../lib/gateway-health-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function readDraft(
  drafts: Record<string, AdminAppGrantCreateRequest>,
  appId: string
): AdminAppGrantCreateRequest {
  return drafts[appId] ?? {
    subjectUserEmail: '',
    effect: 'allow',
    reason: '',
  };
}

function readToolDraft(
  drafts: Record<string, string[]>,
  app: Pick<AdminAppSummary, 'id' | 'tools'>
) {
  return drafts[app.id] ?? app.tools.filter(tool => tool.enabled).map(tool => tool.name);
}

function toggleToolName(currentToolNames: string[], toolName: string) {
  return currentToolNames.includes(toolName)
    ? currentToolNames.filter(currentName => currentName !== toolName)
    : [...currentToolNames, toolName].sort((left, right) => left.localeCompare(right));
}

function formatToolAuth(tool: WorkspaceAppToolSummary) {
  const flags: string[] = [tool.auth.scope];

  if (tool.auth.requiresFreshMfa) {
    flags.push('fresh_mfa');
  }

  if (tool.auth.requiresApproval) {
    flags.push('approval');
  }

  return flags.join(' · ');
}

export default function AdminAppsPage() {
  const { data, error, isLoading, reload, session } = useAdminPageData(fetchAdminApps);
  const [drafts, setDrafts] = useState<Record<string, AdminAppGrantCreateRequest>>({});
  const [toolDrafts, setToolDrafts] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [gatewayRuntime, setGatewayRuntime] = useState<GatewayRuntimeHealthSnapshot | null>(null);
  const [cleanupStatus, setCleanupStatus] =
    useState<Awaited<ReturnType<typeof fetchAdminCleanup>> | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!session) {
        return;
      }

      const [health, cleanup] = await Promise.all([
        fetchGatewayHealth(),
        fetchAdminCleanup(session.sessionToken),
      ]);

      if (!cancelled) {
        setGatewayRuntime(health?.runtime ?? null);
        setCleanupStatus(cleanup);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!data) {
      return;
    }

    setToolDrafts(currentDrafts =>
      Object.fromEntries(
        data.apps.map(app => [app.id, currentDrafts[app.id] ?? app.tools.filter(tool => tool.enabled).map(tool => tool.name)])
      )
    );
  }, [data]);

  function updateDraft(
    appId: string,
    field: keyof AdminAppGrantCreateRequest,
    value: AdminAppGrantCreateRequest[keyof AdminAppGrantCreateRequest]
  ) {
    setDrafts(currentDrafts => ({
      ...currentDrafts,
      [appId]: {
        ...readDraft(currentDrafts, appId),
        [field]: value,
      },
    }));
  }

  async function handleCreateGrant(event: FormEvent<HTMLFormElement>, app: AdminAppSummary) {
    event.preventDefault();

    if (!session) {
      return;
    }

    const draft = readDraft(drafts, app.id);

    setPendingActionId(`create:${app.id}`);
    setMutationError(null);
    setNotice(null);

    let result: Awaited<ReturnType<typeof createAdminAppGrant>>;

    try {
      result = await createAdminAppGrant(session.sessionToken, app.id, draft);
    } catch {
      setPendingActionId(null);
      setMutationError('Saving the direct override failed. Please retry.');
      return;
    }

    if (!result.ok) {
      setPendingActionId(null);
      setMutationError(result.error.message);
      return;
    }

    setDrafts(currentDrafts => ({
      ...currentDrafts,
      [app.id]: {
        subjectUserEmail: '',
        effect: draft.effect,
        reason: '',
      },
    }));
    setPendingActionId(null);
    setNotice(
      `${result.data.grant.user.email} now has a ${result.data.grant.effect} override on ${result.data.app.name}.`
    );
    reload();
  }

  async function handleRevokeGrant(app: AdminAppSummary, grantId: string) {
    if (!session) {
      return;
    }

    setPendingActionId(`revoke:${grantId}`);
    setMutationError(null);
    setNotice(null);

    let result: Awaited<ReturnType<typeof revokeAdminAppGrant>>;

    try {
      result = await revokeAdminAppGrant(session.sessionToken, app.id, grantId);
    } catch {
      setPendingActionId(null);
      setMutationError('Revoking the direct override failed. Please retry.');
      return;
    }

    if (!result.ok) {
      setPendingActionId(null);
      setMutationError(result.error.message);
      return;
    }

    setPendingActionId(null);
    setNotice(`Direct override ${result.data.revokedGrantId} was revoked from ${result.data.app.name}.`);
    reload();
  }

  async function handleSaveTools(app: AdminAppSummary) {
    if (!session) {
      return;
    }

    const enabledToolNames = readToolDraft(toolDrafts, app);

    setPendingActionId(`tools:${app.id}`);
    setMutationError(null);
    setNotice(null);

    let result: Awaited<ReturnType<typeof updateAdminAppTools>>;

    try {
      result = await updateAdminAppTools(session.sessionToken, app.id, {
        enabledToolNames,
      });
    } catch {
      setPendingActionId(null);
      setMutationError('Saving tool registry changes failed. Please retry.');
      return;
    }

    if (!result.ok) {
      setPendingActionId(null);
      setMutationError(result.error.message);
      return;
    }

    setPendingActionId(null);
    setNotice(
      `${result.data.app.name} now exposes ${result.data.enabledToolNames.length} enabled tools in this tenant.`
    );
    reload();
  }

  if (isLoading) {
    return <p className="lead">Loading admin apps...</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>Apps</h1>
        <p className="lead">
          Manage app visibility across groups, roles and direct user allow or deny overrides.
        </p>
      </div>

      <WorkspaceRuntimeDegradedBanner context="admin" snapshot={gatewayRuntime} />
      <WorkspaceRuntimeHealthCards snapshot={gatewayRuntime} />
      {cleanupStatus && 'ok' in cleanupStatus && cleanupStatus.ok ? (
        <div className="admin-stat-grid">
          <article className="admin-stat-card">
            <span>Cleanup candidates</span>
            <strong>{cleanupStatus.data.preview.totalCandidates}</strong>
            <p>
              {cleanupStatus.data.preview.archivedConversations} archived conversations ·{' '}
              {cleanupStatus.data.preview.expiredShares} expired shares ·{' '}
              {cleanupStatus.data.preview.staleKnowledgeSources} stale sources
            </p>
          </article>
          <article className="admin-stat-card">
            <span>Cold timeline / stale sources</span>
            <strong>
              {cleanupStatus.data.preview.coldTimelineEvents + cleanupStatus.data.preview.staleKnowledgeSources}
            </strong>
            <p>
              Timeline {cleanupStatus.data.policy.timelineRetentionDays} days · Sources{' '}
              {cleanupStatus.data.policy.staleKnowledgeSourceRetentionDays} days
            </p>
          </article>
          <article className="admin-stat-card">
            <span>Last cleanup execution</span>
            <strong>
              {cleanupStatus.data.lastRun
                ? new Date(cleanupStatus.data.lastRun.occurredAt).toLocaleString()
                : 'Never'}
            </strong>
            <p>
              {cleanupStatus.data.lastRun
                ? `${cleanupStatus.data.lastRun.summary.mode} · removed ${cleanupStatus.data.lastRun.summary.archivedConversationsDeleted} archived conversations`
                : 'No cleanup execution has been recorded yet.'}
            </p>
          </article>
        </div>
      ) : null}

      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {mutationError ? <div className="notice error">{mutationError}</div> : null}

      {!data ? null : (
        <>
          <div className="admin-stat-grid">
            <article className="admin-stat-card">
              <span>Total apps</span>
              <strong>{data.apps.length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Direct user grants</span>
              <strong>
                {data.apps.reduce((total, app) => total + app.directUserGrantCount, 0)}
              </strong>
            </article>
            <article className="admin-stat-card">
              <span>Deny overrides</span>
              <strong>{data.apps.reduce((total, app) => total + app.denyGrantCount, 0)}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Enabled tools</span>
              <strong>{data.apps.reduce((total, app) => total + app.enabledToolCount, 0)}</strong>
            </article>
          </div>

          <div className="workspace-badges">
            <span className="workspace-badge">
              Snapshot: {new Date(data.generatedAt).toLocaleString()}
            </span>
          </div>

          <div className="app-grid">
            {data.apps.map(app => {
              const draft = readDraft(drafts, app.id);
              const enabledToolDraft = readToolDraft(toolDrafts, app);

              return (
                <article className="app-card admin-card" key={app.id}>
                  <div className="app-card-header">
                    <div className="app-avatar">{app.shortCode}</div>
                    <div className="app-card-copy">
                      <div className="app-title-row">
                        <h2>{app.name}</h2>
                        <span className={`status-chip status-${app.status}`}>{app.status}</span>
                      </div>
                      <p>{app.summary}</p>
                    </div>
                  </div>

                  <div className="tag-row">
                    <span className="tag">{app.kind}</span>
                    <span className="tag">Cost {app.launchCost}</span>
                    {app.grantedRoleIds.map(roleId => (
                      <span className="tag tag-muted" key={`${app.id}:${roleId}`}>
                        role:{roleId}
                      </span>
                    ))}
                  </div>

                  <div className="detail-list">
                    <div className="detail-row">
                      <span className="detail-label">Launch count</span>
                      <strong>{app.launchCount}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Last launch</span>
                      <strong>{formatTimestamp(app.lastLaunchedAt)}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Direct user grants</span>
                      <strong>{app.directUserGrantCount}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Deny overrides</span>
                      <strong>{app.denyGrantCount}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Enabled tools</span>
                      <strong>
                        {app.enabledToolCount} / {app.tools.length}
                      </strong>
                    </div>
                  </div>

                  <div>
                    <strong>Granted groups</strong>
                    <div className="tag-row admin-tag-row">
                      {app.grantedGroups.length === 0 ? (
                        <span className="tag tag-muted">No group grants</span>
                      ) : (
                        app.grantedGroups.map(group => (
                          <span className="tag" key={`${app.id}:${group.id}`}>
                            {group.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <section className="stack">
                    <div>
                      <strong>Tool registry</strong>
                      <p className="helper-text">
                        Configure which structured tools this tenant exposes to the app runtime.
                      </p>
                    </div>

                    <div className="detail-list">
                      {app.tools.length === 0 ? (
                        <div className="detail-row">
                          <span className="detail-label">Available tools</span>
                          <strong>No tools assigned</strong>
                        </div>
                      ) : (
                        app.tools.map(tool => {
                          const checked = enabledToolDraft.includes(tool.name);

                          return (
                            <label className="detail-row" key={`${app.id}:${tool.name}`}>
                              <div className="admin-grant-copy">
                                <strong>{tool.name}</strong>
                                <span>{tool.description ?? 'No description provided.'}</span>
                                <span>
                                  {formatToolAuth(tool)} · {tool.defaultEnabled ? 'default on' : 'default off'} ·{' '}
                                  {tool.isOverridden ? 'tenant override' : 'catalog default'}
                                </span>
                              </div>
                              <input
                                aria-label={`${app.name} tool ${tool.name}`}
                                checked={checked}
                                onChange={() =>
                                  setToolDrafts(currentDrafts => ({
                                    ...currentDrafts,
                                    [app.id]: toggleToolName(readToolDraft(currentDrafts, app), tool.name),
                                  }))
                                }
                                type="checkbox"
                              />
                            </label>
                          );
                        })
                      )}
                    </div>

                    {app.tools.length > 0 ? (
                      <button
                        className="secondary"
                        disabled={pendingActionId === `tools:${app.id}`}
                        onClick={() => handleSaveTools(app)}
                        type="button"
                      >
                        {pendingActionId === `tools:${app.id}` ? 'Saving tools...' : 'Save tool registry'}
                      </button>
                    ) : null}
                  </section>

                  <section className="stack">
                    <div>
                      <strong>Direct user overrides</strong>
                      <p className="helper-text">
                        Add a user-level allow or deny grant by email. This writes directly into the
                        persisted workspace grant table.
                      </p>
                    </div>

                    <form className="admin-grant-form" onSubmit={event => handleCreateGrant(event, app)}>
                      <label className="field">
                        Email
                        <input
                          aria-label={`${app.name} grant email`}
                          autoComplete="off"
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateDraft(app.id, 'subjectUserEmail', event.target.value)
                          }
                          placeholder="teammate@example.com"
                          value={draft.subjectUserEmail}
                        />
                      </label>

                      <label className="field">
                        Effect
                        <select
                          aria-label={`${app.name} grant effect`}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            updateDraft(app.id, 'effect', event.target.value as AdminAppGrantCreateRequest['effect'])
                          }
                          value={draft.effect}
                        >
                          <option value="allow">allow</option>
                          <option value="deny">deny</option>
                        </select>
                      </label>

                      <label className="field">
                        Reason
                        <input
                          aria-label={`${app.name} grant reason`}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateDraft(app.id, 'reason', event.target.value)
                          }
                          placeholder="Optional context for the override"
                          value={draft.reason ?? ''}
                        />
                      </label>

                      <button
                        className="primary"
                        disabled={pendingActionId === `create:${app.id}`}
                        type="submit"
                      >
                        {pendingActionId === `create:${app.id}` ? 'Saving override...' : 'Save direct override'}
                      </button>
                    </form>

                    <div className="detail-list">
                      {app.userGrants.length === 0 ? (
                        <div className="detail-row">
                          <span className="detail-label">Current overrides</span>
                          <strong>No direct user overrides</strong>
                        </div>
                      ) : (
                        app.userGrants.map(grant => (
                          <div className="detail-row admin-grant-row" key={grant.id}>
                            <div className="admin-grant-copy">
                              <strong>
                                {grant.user.displayName} · {grant.effect}
                              </strong>
                              <span>{grant.user.email}</span>
                              <span>
                                {grant.reason ? `Reason: ${grant.reason}` : 'Reason: none'} ·{' '}
                                {formatTimestamp(grant.createdAt)}
                              </span>
                            </div>
                            <button
                              className="secondary"
                              disabled={pendingActionId === `revoke:${grant.id}`}
                              onClick={() => handleRevokeGrant(app, grant.id)}
                              type="button"
                            >
                              {pendingActionId === `revoke:${grant.id}` ? 'Revoking...' : 'Revoke'}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
