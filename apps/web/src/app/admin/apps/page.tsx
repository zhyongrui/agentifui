'use client';

import type {
  AdminAppGrantCreateRequest,
  AdminAppSummary,
  WorkspaceAppToolSummary,
} from '@agentifui/shared';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

import { useI18n } from '../../../components/i18n-provider';
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
import {
  localizeAdminApp,
  localizeAppKind,
  localizeAppStatus,
} from '../../../lib/workspace-localization';
import { useAdminPageData } from '../../../lib/use-admin-page';

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
  const { locale, messages, formatDateTime } = useI18n();
  const appsCopy = messages.adminApps;
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
      setMutationError(appsCopy.savingOverrideFailed);
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
      appsCopy.overrideCreated(
        result.data.grant.user.email,
        result.data.grant.effect,
        localizeAdminApp(result.data.app, locale).name
      )
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
      setMutationError(appsCopy.revokingOverrideFailed);
      return;
    }

    if (!result.ok) {
      setPendingActionId(null);
      setMutationError(result.error.message);
      return;
    }

    setPendingActionId(null);
    setNotice(appsCopy.overrideRevoked(result.data.revokedGrantId, localizeAdminApp(result.data.app, locale).name));
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
      setMutationError(appsCopy.savingToolsFailed);
      return;
    }

    if (!result.ok) {
      setPendingActionId(null);
      setMutationError(result.error.message);
      return;
    }

    setPendingActionId(null);
    setNotice(
      appsCopy.toolRegistrySaved(
        localizeAdminApp(result.data.app, locale).name,
        result.data.enabledToolNames.length
      )
    );
    reload();
  }

  if (isLoading) {
    return <p className="lead">{appsCopy.loading}</p>;
  }

  return (
    <div className="stack">
      <div>
        <h1>{appsCopy.title}</h1>
        <p className="lead">{appsCopy.lead}</p>
      </div>

      <WorkspaceRuntimeDegradedBanner context="admin" snapshot={gatewayRuntime} />
      <WorkspaceRuntimeHealthCards snapshot={gatewayRuntime} />
      {cleanupStatus && 'ok' in cleanupStatus && cleanupStatus.ok ? (
        <div className="admin-stat-grid">
          <article className="admin-stat-card">
            <span>{appsCopy.cleanupCandidates}</span>
            <strong>{cleanupStatus.data.preview.totalCandidates}</strong>
            <p>
              {appsCopy.cleanupBreakdown(
                cleanupStatus.data.preview.archivedConversations,
                cleanupStatus.data.preview.expiredShares,
                cleanupStatus.data.preview.staleKnowledgeSources,
              )}
            </p>
          </article>
          <article className="admin-stat-card">
            <span>{appsCopy.coldTimelineSources}</span>
            <strong>
              {cleanupStatus.data.preview.coldTimelineEvents + cleanupStatus.data.preview.staleKnowledgeSources}
            </strong>
            <p>
              {appsCopy.retentionWindow(
                cleanupStatus.data.policy.timelineRetentionDays,
                cleanupStatus.data.policy.staleKnowledgeSourceRetentionDays,
              )}
            </p>
          </article>
          <article className="admin-stat-card">
            <span>{appsCopy.lastCleanupExecution}</span>
            <strong>
              {cleanupStatus.data.lastRun
                ? formatDateTime(cleanupStatus.data.lastRun.occurredAt)
                : appsCopy.never}
            </strong>
            <p>
              {cleanupStatus.data.lastRun
                ? appsCopy.cleanupSummary(
                    cleanupStatus.data.lastRun.summary.mode,
                    cleanupStatus.data.lastRun.summary.archivedConversationsDeleted,
                  )
                : appsCopy.noCleanupRecorded}
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
              <span>{appsCopy.totalApps}</span>
              <strong>{data.apps.length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{appsCopy.directUserGrants}</span>
              <strong>
                {data.apps.reduce((total, app) => total + app.directUserGrantCount, 0)}
              </strong>
            </article>
            <article className="admin-stat-card">
              <span>{appsCopy.denyOverrides}</span>
              <strong>{data.apps.reduce((total, app) => total + app.denyGrantCount, 0)}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{appsCopy.enabledTools}</span>
              <strong>{data.apps.reduce((total, app) => total + app.enabledToolCount, 0)}</strong>
            </article>
          </div>

          <div className="workspace-badges">
            <span className="workspace-badge">
              {appsCopy.snapshot}: {formatDateTime(data.generatedAt)}
            </span>
          </div>

          <div className="app-grid">
            {data.apps.map(app => {
              const localizedApp = localizeAdminApp(app, locale);
              const draft = readDraft(drafts, app.id);
              const enabledToolDraft = readToolDraft(toolDrafts, app);

              return (
                <article className="app-card admin-card" key={app.id}>
                  <div className="app-card-header">
                    <div className="app-avatar">{app.shortCode}</div>
                    <div className="app-card-copy">
                      <div className="app-title-row">
                        <h2>{localizedApp.name}</h2>
                        <span className={`status-chip status-${app.status}`}>
                          {localizeAppStatus(app.status, locale)}
                        </span>
                      </div>
                      <p>{localizedApp.summary}</p>
                    </div>
                  </div>

                  <div className="tag-row">
                    <span className="tag">{localizeAppKind(app.kind, locale)}</span>
                    <span className="tag">
                      {appsCopy.costTag} {app.launchCost}
                    </span>
                    {app.grantedRoleIds.map(roleId => (
                      <span className="tag tag-muted" key={`${app.id}:${roleId}`}>
                        {appsCopy.roleTagPrefix}:{roleId}
                      </span>
                    ))}
                  </div>

                  <div className="detail-list">
                    <div className="detail-row">
                      <span className="detail-label">{appsCopy.launchCount}</span>
                      <strong>{app.launchCount}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{appsCopy.lastLaunch}</span>
                      <strong>{formatDateTime(app.lastLaunchedAt, appsCopy.never)}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{appsCopy.directUserGrants}</span>
                      <strong>{app.directUserGrantCount}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{appsCopy.denyOverrides}</span>
                      <strong>{app.denyGrantCount}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{appsCopy.enabledTools}</span>
                      <strong>
                        {app.enabledToolCount} / {app.tools.length}
                      </strong>
                    </div>
                  </div>

                  <div>
                    <strong>{appsCopy.grantedGroups}</strong>
                    <div className="tag-row admin-tag-row">
                      {app.grantedGroups.length === 0 ? (
                        <span className="tag tag-muted">{appsCopy.noGroupGrants}</span>
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
                      <strong>{appsCopy.toolRegistry}</strong>
                      <p className="helper-text">{appsCopy.toolRegistryLead}</p>
                    </div>

                    <div className="detail-list">
                      {app.tools.length === 0 ? (
                        <div className="detail-row">
                          <span className="detail-label">{appsCopy.availableTools}</span>
                          <strong>{appsCopy.noToolsAssigned}</strong>
                        </div>
                      ) : (
                        app.tools.map(tool => {
                          const checked = enabledToolDraft.includes(tool.name);

                          return (
                            <label className="detail-row" key={`${app.id}:${tool.name}`}>
                              <div className="admin-grant-copy">
                                <strong>{tool.name}</strong>
                                <span>{tool.description ?? appsCopy.noToolDescription}</span>
                                <span>
                                  {formatToolAuth(tool)} ·{' '}
                                  {tool.defaultEnabled ? appsCopy.defaultOn : appsCopy.defaultOff} ·{' '}
                                  {tool.isOverridden ? appsCopy.tenantOverride : appsCopy.catalogDefault}
                                </span>
                              </div>
                              <input
                                aria-label={`${localizedApp.name} tool ${tool.name}`}
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
                        {pendingActionId === `tools:${app.id}` ? appsCopy.savingTools : appsCopy.saveTools}
                      </button>
                    ) : null}
                  </section>

                  <section className="stack">
                    <div>
                      <strong>{appsCopy.directOverrides}</strong>
                      <p className="helper-text">
                        {appsCopy.directOverridesLeadLine1}
                        <br />
                        {appsCopy.directOverridesLeadLine2}
                      </p>
                    </div>

                    <form className="admin-grant-form" onSubmit={event => handleCreateGrant(event, app)}>
                      <label className="field">
                        {appsCopy.email}
                        <input
                          aria-label={`${localizedApp.name} grant email`}
                          autoComplete="off"
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateDraft(app.id, 'subjectUserEmail', event.target.value)
                          }
                          placeholder="teammate@example.com"
                          value={draft.subjectUserEmail}
                        />
                      </label>

                      <label className="field">
                        {appsCopy.effect}
                        <select
                          aria-label={`${localizedApp.name} grant effect`}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            updateDraft(app.id, 'effect', event.target.value as AdminAppGrantCreateRequest['effect'])
                          }
                          value={draft.effect}
                        >
                          <option value="allow">{appsCopy.allow}</option>
                          <option value="deny">{appsCopy.deny}</option>
                        </select>
                      </label>

                      <label className="field">
                        {appsCopy.reason}
                        <input
                          aria-label={`${localizedApp.name} grant reason`}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateDraft(app.id, 'reason', event.target.value)
                          }
                          placeholder={appsCopy.reasonPlaceholder}
                          value={draft.reason ?? ''}
                        />
                      </label>

                      <button
                        className="primary"
                        disabled={pendingActionId === `create:${app.id}`}
                        type="submit"
                      >
                        {pendingActionId === `create:${app.id}` ? appsCopy.savingOverride : appsCopy.saveOverride}
                      </button>
                    </form>

                    <div className="detail-list">
                      {app.userGrants.length === 0 ? (
                        <div className="detail-row">
                          <span className="detail-label">{appsCopy.currentOverrides}</span>
                          <strong>{appsCopy.noOverrides}</strong>
                        </div>
                      ) : (
                        app.userGrants.map(grant => (
                          <div className="detail-row admin-grant-row" key={grant.id}>
                            <div className="admin-grant-copy">
                              <strong>
                                {grant.user.displayName} · {grant.effect === 'allow' ? appsCopy.allow : appsCopy.deny}
                              </strong>
                              <span>{grant.user.email}</span>
                              <span>
                                {appsCopy.reason}: {grant.reason ?? appsCopy.reasonNone} ·{' '}
                                {formatDateTime(grant.createdAt, appsCopy.never)}
                              </span>
                            </div>
                            <button
                              className="secondary"
                              disabled={pendingActionId === `revoke:${grant.id}`}
                              onClick={() => handleRevokeGrant(app, grant.id)}
                              type="button"
                            >
                              {pendingActionId === `revoke:${grant.id}` ? appsCopy.revoking : appsCopy.revoke}
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
