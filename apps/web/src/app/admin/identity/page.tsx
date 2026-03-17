'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { useI18n } from '../../../components/i18n-provider';
import { SectionSkeleton } from '../../../components/section-state';
import {
  createAdminBreakGlassSession,
  createAdminDomainClaim,
  fetchAdminIdentity,
  fetchAdminTenants,
  fetchAdminUsers,
  resetAdminUserMfa,
  reviewAdminAccessRequest,
  reviewAdminDomainClaim,
  updateAdminBreakGlassSession,
  updateAdminTenantGovernance,
} from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

export default function AdminIdentityPage() {
  const { locale, formatDateTime } = useI18n();
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenantOptions, setTenantOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [mfaUsers, setMfaUsers] = useState<Array<{ id: string; email: string; displayName: string }>>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [domainDraft, setDomainDraft] = useState({
    domain: '',
    providerId: '',
    jitUserStatus: 'pending' as 'active' | 'pending',
  });
  const [breakGlassDraft, setBreakGlassDraft] = useState({
    reason: '',
    justification: '',
    expiresInMinutes: '60',
  });
  const [governanceDraft, setGovernanceDraft] = useState({
    legalHoldEnabled: false,
    retentionOverrideDays: '',
    scimEnabled: false,
    scimOwnerEmail: '',
    scimNotes: '',
    runtimeMode: 'standard' as 'degraded' | 'standard' | 'strict',
    sharingMode: 'editor' as 'commenter' | 'editor' | 'read_only',
    artifactDownloadMode: 'shared_readers' as 'owner_only' | 'shared_readers',
  });

  const copy =
    locale === 'zh-CN'
      ? {
          loading: '正在加载身份与治理...',
          loadUsersFailed: '加载 MFA 用户失败，请稍后重试。',
          loadTenantsFailed: '加载租户列表失败，请稍后重试。',
          title: '身份与治理',
          lead: '集中管理企业 SSO 域名认领、待审核访问、MFA 恢复、紧急 break-glass 和租户治理策略。',
          tenantScope: '当前治理租户',
          currentScope: '当前范围',
          statsClaims: '域名认领',
          statsRequests: '待审核访问',
          statsBreakGlass: '活跃 break-glass',
          statsLegalHold: '法律保留',
          enabled: '已启用',
          disabled: '未启用',
          domainTitle: '企业 SSO 域名认领',
          domainLead: '租户管理员可以提交认领，root admin 可以审批后立即生效到 discovery 和 callback。',
          domainLabel: '域名',
          providerLabel: 'Provider ID',
          jitLabel: 'JIT 初始状态',
          submitDomain: '提交认领',
          approve: '批准',
          reject: '拒绝',
          pendingAccessTitle: '访问审核队列',
          pendingAccessLead: '这里会汇总待审核的 SSO JIT 和租户访问请求，支持批准、拒绝和跨租户转移。',
          approveRequest: '批准访问',
          rejectRequest: '拒绝访问',
          transferRequest: '转移租户',
          targetTenant: '目标租户',
          governanceTitle: '租户治理',
          governanceLead: '管理 legal-hold、保留策略覆盖、SCIM 规划挂钩和 policy pack。',
          saveGovernance: '保存治理设置',
          legalHold: '法律保留',
          retentionOverride: '保留天数覆盖',
          scimEnabled: 'SCIM 规划已启用',
          scimOwner: 'SCIM 负责人邮箱',
          scimNotes: 'SCIM 备注',
          runtimeMode: '运行时策略',
          sharingMode: '共享策略',
          artifactMode: '产物下载策略',
          mfaTitle: 'MFA 恢复',
          mfaLead: '为租户内已开启 MFA 的用户执行恢复/重置。',
          resetMfa: '重置 MFA',
          breakGlassTitle: 'Break-glass',
          breakGlassLead: 'root admin 可以创建短时紧急会话并记录复核说明。',
          breakGlassReason: '紧急原因',
          breakGlassJustification: '补充说明',
          breakGlassExpiry: '有效分钟数',
          createBreakGlass: '创建 break-glass',
          revokeBreakGlass: '撤销',
          noClaims: '还没有域名认领。',
          noRequests: '没有待审核访问请求。',
          noBreakGlass: '没有 break-glass 记录。',
          noMfaUsers: '当前没有启用 MFA 的用户。',
          saving: '处理中...',
          policyStandard: '标准',
          policyStrict: '严格',
          policyDegraded: '降级',
          sharingReadOnly: '只读',
          sharingCommenter: '评论者',
          sharingEditor: '编辑者',
          artifactShared: '共享读者可下载',
          artifactOwner: '仅所有者可下载',
        }
      : {
          loading: 'Loading identity and governance...',
          loadUsersFailed: 'Loading MFA users failed. Please retry.',
          loadTenantsFailed: 'Loading tenants failed. Please retry.',
          title: 'Identity',
          lead: 'Manage enterprise SSO domain claims, pending access review, MFA recovery, emergency break-glass and tenant governance in one place.',
          tenantScope: 'Governance tenant',
          currentScope: 'Scope',
          statsClaims: 'Domain claims',
          statsRequests: 'Pending access',
          statsBreakGlass: 'Active break-glass',
          statsLegalHold: 'Legal hold',
          enabled: 'Enabled',
          disabled: 'Disabled',
          domainTitle: 'Enterprise SSO domain claims',
          domainLead: 'Tenant admins can request claims, while root admins can review and activate them for discovery and callback.',
          domainLabel: 'Domain',
          providerLabel: 'Provider ID',
          jitLabel: 'JIT initial status',
          submitDomain: 'Create claim',
          approve: 'Approve',
          reject: 'Reject',
          pendingAccessTitle: 'Access review queue',
          pendingAccessLead: 'Review pending SSO JIT and tenant access requests, including cross-tenant transfer for root admins.',
          approveRequest: 'Approve',
          rejectRequest: 'Reject',
          transferRequest: 'Transfer',
          targetTenant: 'Target tenant',
          governanceTitle: 'Tenant governance',
          governanceLead: 'Manage legal hold, retention overrides, SCIM planning hooks and policy-pack settings.',
          saveGovernance: 'Save governance',
          legalHold: 'Legal hold',
          retentionOverride: 'Retention override days',
          scimEnabled: 'SCIM planning enabled',
          scimOwner: 'SCIM owner email',
          scimNotes: 'SCIM notes',
          runtimeMode: 'Runtime mode',
          sharingMode: 'Sharing mode',
          artifactMode: 'Artifact downloads',
          mfaTitle: 'MFA recovery',
          mfaLead: 'Reset MFA for users who are currently enrolled.',
          resetMfa: 'Reset MFA',
          breakGlassTitle: 'Break-glass',
          breakGlassLead: 'Root admins can create short-lived emergency sessions and record review notes.',
          breakGlassReason: 'Reason',
          breakGlassJustification: 'Justification',
          breakGlassExpiry: 'Minutes until expiry',
          createBreakGlass: 'Create break-glass',
          revokeBreakGlass: 'Revoke',
          noClaims: 'No domain claims yet.',
          noRequests: 'No pending access requests.',
          noBreakGlass: 'No break-glass sessions.',
          noMfaUsers: 'No MFA-enrolled users in this tenant.',
          saving: 'Saving...',
          policyStandard: 'Standard',
          policyStrict: 'Strict',
          policyDegraded: 'Degraded',
          sharingReadOnly: 'Read only',
          sharingCommenter: 'Commenter',
          sharingEditor: 'Editor',
          artifactShared: 'Shared readers can download',
          artifactOwner: 'Owner only',
        };

  const loadIdentity = useCallback(
    (sessionToken: string) =>
      fetchAdminIdentity(sessionToken, {
        tenantId: selectedTenantId || undefined,
      }),
    [selectedTenantId]
  );

  const { data, error, isLoading, reload, session } = useAdminPageData(loadIdentity);

  useEffect(() => {
    if (!data?.governance) {
      return;
    }

    setGovernanceDraft({
      legalHoldEnabled: data.governance.legalHoldEnabled,
      retentionOverrideDays:
        data.governance.retentionOverrideDays === null
          ? ''
          : String(data.governance.retentionOverrideDays),
      scimEnabled: data.governance.scimPlanning.enabled,
      scimOwnerEmail: data.governance.scimPlanning.ownerEmail ?? '',
      scimNotes: data.governance.scimPlanning.notes ?? '',
      runtimeMode: data.governance.policyPack.runtimeMode,
      sharingMode: data.governance.policyPack.sharingMode,
      artifactDownloadMode: data.governance.policyPack.artifactDownloadMode,
    });
  }, [data?.governance]);

  useEffect(() => {
    if (!session || !data?.tenant) {
      setMfaUsers([]);
      return;
    }

    let cancelled = false;

    void fetchAdminUsers(session.sessionToken, {
      tenantId: selectedTenantId || undefined,
    })
      .then(result => {
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setMutationError(currentValue => currentValue ?? copy.loadUsersFailed);
          return;
        }

        setMfaUsers(
          result.data.users
            .filter(user => user.mfaEnabled)
            .map(user => ({
              id: user.id,
              email: user.email,
              displayName: user.displayName,
            }))
        );
      })
      .catch(() => {
        if (!cancelled) {
          setMutationError(currentValue => currentValue ?? copy.loadUsersFailed);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [copy.loadUsersFailed, data?.tenant, selectedTenantId, session]);

  useEffect(() => {
    if (!session || !data?.capabilities.canReadPlatformAdmin) {
      setTenantOptions([]);
      return;
    }

    let cancelled = false;

    void fetchAdminTenants(session.sessionToken)
      .then(result => {
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setMutationError(currentValue => currentValue ?? copy.loadTenantsFailed);
          return;
        }

        setTenantOptions(result.data.tenants.map(tenant => ({ id: tenant.id, name: tenant.name })));
      })
      .catch(() => {
        if (!cancelled) {
          setMutationError(currentValue => currentValue ?? copy.loadTenantsFailed);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [copy.loadTenantsFailed, data?.capabilities.canReadPlatformAdmin, session]);

  const activeBreakGlassCount = useMemo(
    () => data?.breakGlassSessions.filter(sessionItem => sessionItem.status === 'active').length ?? 0,
    [data?.breakGlassSessions]
  );

  if (isLoading) {
    return <SectionSkeleton blocks={6} lead={copy.loading} title={copy.title} />;
  }

  async function withMutation<T>(actionId: string, task: () => Promise<T>) {
    setPendingActionId(actionId);
    setMutationError(null);
    setNotice(null);

    try {
      await task();
      reload();
    } catch {
      setMutationError('Request failed. Please retry.');
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>{copy.title}</h1>
        <p className="lead">{copy.lead}</p>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {mutationError ? <div className="notice error">{mutationError}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      {!data ? null : (
        <>
          <div className="admin-stat-grid">
            <article className="admin-stat-card">
              <span>{copy.statsClaims}</span>
              <strong>{data.domainClaims.length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{copy.statsRequests}</span>
              <strong>{data.pendingAccessRequests.filter(item => item.status === 'pending').length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{copy.statsBreakGlass}</span>
              <strong>{activeBreakGlassCount}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{copy.statsLegalHold}</span>
              <strong>{data.governance?.legalHoldEnabled ? copy.enabled : copy.disabled}</strong>
            </article>
          </div>

          <section className="admin-card stack">
            <div className="section-header">
              <div>
                <h2>{copy.currentScope}</h2>
                <p>{data.tenant?.name ?? data.tenant?.id}</p>
              </div>
            </div>

            {data.capabilities.canReadPlatformAdmin ? (
              <label className="field">
                <span>{copy.tenantScope}</span>
                <select
                  value={selectedTenantId}
                  onChange={event => {
                    setSelectedTenantId(event.target.value);
                  }}
                >
                  <option value="">{data.tenant?.name ?? 'Current tenant'}</option>
                  {tenantOptions.map(tenant => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </section>

          <section className="admin-card stack">
            <div>
              <h2>{copy.domainTitle}</h2>
              <p>{copy.domainLead}</p>
            </div>
            <form
              className="workspace-toolbar"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();

                if (!session) {
                  return;
                }

                void withMutation('domain-claim:create', async () => {
                  const result = await createAdminDomainClaim(session.sessionToken, {
                    tenantId: selectedTenantId || undefined,
                    domain: domainDraft.domain,
                    providerId: domainDraft.providerId,
                    jitUserStatus: domainDraft.jitUserStatus,
                  });

                  if (!result.ok) {
                    setMutationError(result.error.message);
                    return;
                  }

                  setNotice(`${result.data.claim.domain} -> ${result.data.claim.providerId}`);
                  setDomainDraft({
                    domain: '',
                    providerId: '',
                    jitUserStatus: 'pending',
                  });
                });
              }}
            >
              <label className="field">
                <span>{copy.domainLabel}</span>
                <input
                  value={domainDraft.domain}
                  onChange={event => {
                    setDomainDraft(currentValue => ({
                      ...currentValue,
                      domain: event.target.value,
                    }));
                  }}
                />
              </label>
              <label className="field">
                <span>{copy.providerLabel}</span>
                <input
                  value={domainDraft.providerId}
                  onChange={event => {
                    setDomainDraft(currentValue => ({
                      ...currentValue,
                      providerId: event.target.value,
                    }));
                  }}
                />
              </label>
              <label className="field">
                <span>{copy.jitLabel}</span>
                <select
                  value={domainDraft.jitUserStatus}
                  onChange={event => {
                    setDomainDraft(currentValue => ({
                      ...currentValue,
                      jitUserStatus: event.target.value as 'active' | 'pending',
                    }));
                  }}
                >
                  <option value="pending">pending</option>
                  <option value="active">active</option>
                </select>
              </label>
              <button className="button" disabled={!session || pendingActionId === 'domain-claim:create'} type="submit">
                {pendingActionId === 'domain-claim:create' ? copy.saving : copy.submitDomain}
              </button>
            </form>

            {data.domainClaims.length === 0 ? <p>{copy.noClaims}</p> : null}
            <div className="admin-grid">
              {data.domainClaims.map(claim => (
                <article className="admin-card" key={claim.id}>
                  <div className="section-header">
                    <div>
                      <h3>{claim.domain}</h3>
                      <p>{claim.providerId}</p>
                    </div>
                    <span className={`status-chip status-${claim.status}`}>{claim.status}</span>
                  </div>
                  <div className="detail-list">
                    <div className="detail-row">
                      <span className="detail-label">JIT</span>
                      <strong>{claim.jitUserStatus}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Requested</span>
                      <strong>{formatDateTime(claim.requestedAt)}</strong>
                    </div>
                  </div>
                  {data.capabilities.canReadPlatformAdmin && claim.status === 'pending' && session ? (
                    <div className="workspace-toolbar">
                      <button
                        className="button"
                        onClick={() => {
                          void withMutation(`claim:${claim.id}:approve`, async () => {
                            const result = await reviewAdminDomainClaim(session.sessionToken, claim.id, {
                              status: 'approved',
                            });

                            if (!result.ok) {
                              setMutationError(result.error.message);
                              return;
                            }

                            setNotice(`${result.data.claim.domain} approved`);
                          });
                        }}
                        type="button"
                      >
                        {copy.approve}
                      </button>
                      <button
                        className="button button-secondary"
                        onClick={() => {
                          void withMutation(`claim:${claim.id}:reject`, async () => {
                            const result = await reviewAdminDomainClaim(session.sessionToken, claim.id, {
                              status: 'rejected',
                            });

                            if (!result.ok) {
                              setMutationError(result.error.message);
                              return;
                            }

                            setNotice(`${result.data.claim.domain} rejected`);
                          });
                        }}
                        type="button"
                      >
                        {copy.reject}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="admin-card stack">
            <div>
              <h2>{copy.pendingAccessTitle}</h2>
              <p>{copy.pendingAccessLead}</p>
            </div>
            {data.pendingAccessRequests.length === 0 ? <p>{copy.noRequests}</p> : null}
            <div className="admin-grid">
              {data.pendingAccessRequests.map(requestItem => (
                <article className="admin-card" key={requestItem.id}>
                  <div className="section-header">
                    <div>
                      <h3>{requestItem.email}</h3>
                      <p>{requestItem.displayName ?? requestItem.source}</p>
                    </div>
                    <span className={`status-chip status-${requestItem.status}`}>{requestItem.status}</span>
                  </div>
                  <div className="detail-list">
                    <div className="detail-row">
                      <span className="detail-label">Tenant</span>
                      <strong>{requestItem.tenantName ?? requestItem.tenantId}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Requested</span>
                      <strong>{formatDateTime(requestItem.requestedAt)}</strong>
                    </div>
                  </div>
                  {requestItem.status === 'pending' && session ? (
                    <div className="stack">
                      <div className="workspace-toolbar">
                        <button
                          className="button"
                          onClick={() => {
                            void withMutation(`request:${requestItem.id}:approve`, async () => {
                              const result = await reviewAdminAccessRequest(session.sessionToken, requestItem.id, {
                                decision: 'approved',
                              });

                              if (!result.ok) {
                                setMutationError(result.error.message);
                                return;
                              }

                              setNotice(`${result.data.request.email} approved`);
                            });
                          }}
                          type="button"
                        >
                          {copy.approveRequest}
                        </button>
                        <button
                          className="button button-secondary"
                          onClick={() => {
                            void withMutation(`request:${requestItem.id}:reject`, async () => {
                              const result = await reviewAdminAccessRequest(session.sessionToken, requestItem.id, {
                                decision: 'rejected',
                              });

                              if (!result.ok) {
                                setMutationError(result.error.message);
                                return;
                              }

                              setNotice(`${result.data.request.email} rejected`);
                            });
                          }}
                          type="button"
                        >
                          {copy.rejectRequest}
                        </button>
                      </div>
                      {data.capabilities.canReadPlatformAdmin ? (
                        <div className="workspace-toolbar">
                          <label className="field">
                            <span>{copy.targetTenant}</span>
                            <select
                              defaultValue=""
                              onChange={event => {
                                const targetTenantId = event.target.value;

                                if (!targetTenantId) {
                                  return;
                                }

                                void withMutation(`request:${requestItem.id}:transfer`, async () => {
                                  const result = await reviewAdminAccessRequest(session.sessionToken, requestItem.id, {
                                    decision: 'transferred',
                                    targetTenantId,
                                  });

                                  if (!result.ok) {
                                    setMutationError(result.error.message);
                                    return;
                                  }

                                  setNotice(`${result.data.request.email} transferred`);
                                });
                              }}
                            >
                              <option value="">{copy.transferRequest}</option>
                              {tenantOptions.map(tenant => (
                                <option key={tenant.id} value={tenant.id}>
                                  {tenant.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="admin-card stack">
            <div>
              <h2>{copy.governanceTitle}</h2>
              <p>{copy.governanceLead}</p>
            </div>
            <form
              className="stack"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();

                if (!session) {
                  return;
                }

                void withMutation('governance:update', async () => {
                  const result = await updateAdminTenantGovernance(session.sessionToken, {
                    tenantId: selectedTenantId || undefined,
                    legalHoldEnabled: governanceDraft.legalHoldEnabled,
                    retentionOverrideDays: governanceDraft.retentionOverrideDays.trim()
                      ? Number.parseInt(governanceDraft.retentionOverrideDays, 10)
                      : null,
                    scimPlanning: {
                      enabled: governanceDraft.scimEnabled,
                      ownerEmail: governanceDraft.scimOwnerEmail || null,
                      notes: governanceDraft.scimNotes || null,
                    },
                    policyPack: {
                      runtimeMode: governanceDraft.runtimeMode,
                      sharingMode: governanceDraft.sharingMode,
                      artifactDownloadMode: governanceDraft.artifactDownloadMode,
                    },
                  });

                  if (!result.ok) {
                    setMutationError(result.error.message);
                    return;
                  }

                  setNotice(`Governance saved for ${result.data.governance.tenantId}`);
                });
              }}
            >
              <div className="workspace-toolbar">
                <label className="field">
                  <span>{copy.legalHold}</span>
                  <select
                    value={governanceDraft.legalHoldEnabled ? 'enabled' : 'disabled'}
                    onChange={event => {
                      setGovernanceDraft(currentValue => ({
                        ...currentValue,
                        legalHoldEnabled: event.target.value === 'enabled',
                      }));
                    }}
                  >
                    <option value="disabled">{copy.disabled}</option>
                    <option value="enabled">{copy.enabled}</option>
                  </select>
                </label>
                <label className="field">
                  <span>{copy.retentionOverride}</span>
                  <input
                    value={governanceDraft.retentionOverrideDays}
                    onChange={event => {
                      setGovernanceDraft(currentValue => ({
                        ...currentValue,
                        retentionOverrideDays: event.target.value,
                      }));
                    }}
                  />
                </label>
                <label className="field">
                  <span>{copy.runtimeMode}</span>
                  <select
                    value={governanceDraft.runtimeMode}
                    onChange={event => {
                      setGovernanceDraft(currentValue => ({
                        ...currentValue,
                        runtimeMode: event.target.value as 'degraded' | 'standard' | 'strict',
                      }));
                    }}
                  >
                    <option value="standard">{copy.policyStandard}</option>
                    <option value="strict">{copy.policyStrict}</option>
                    <option value="degraded">{copy.policyDegraded}</option>
                  </select>
                </label>
              </div>
              <div className="workspace-toolbar">
                <label className="field">
                  <span>{copy.sharingMode}</span>
                  <select
                    value={governanceDraft.sharingMode}
                    onChange={event => {
                      setGovernanceDraft(currentValue => ({
                        ...currentValue,
                        sharingMode: event.target.value as 'commenter' | 'editor' | 'read_only',
                      }));
                    }}
                  >
                    <option value="editor">{copy.sharingEditor}</option>
                    <option value="commenter">{copy.sharingCommenter}</option>
                    <option value="read_only">{copy.sharingReadOnly}</option>
                  </select>
                </label>
                <label className="field">
                  <span>{copy.artifactMode}</span>
                  <select
                    value={governanceDraft.artifactDownloadMode}
                    onChange={event => {
                      setGovernanceDraft(currentValue => ({
                        ...currentValue,
                        artifactDownloadMode: event.target.value as 'owner_only' | 'shared_readers',
                      }));
                    }}
                  >
                    <option value="shared_readers">{copy.artifactShared}</option>
                    <option value="owner_only">{copy.artifactOwner}</option>
                  </select>
                </label>
                <label className="field">
                  <span>{copy.scimEnabled}</span>
                  <select
                    value={governanceDraft.scimEnabled ? 'enabled' : 'disabled'}
                    onChange={event => {
                      setGovernanceDraft(currentValue => ({
                        ...currentValue,
                        scimEnabled: event.target.value === 'enabled',
                      }));
                    }}
                  >
                    <option value="disabled">{copy.disabled}</option>
                    <option value="enabled">{copy.enabled}</option>
                  </select>
                </label>
              </div>
              <div className="workspace-toolbar">
                <label className="field">
                  <span>{copy.scimOwner}</span>
                  <input
                    value={governanceDraft.scimOwnerEmail}
                    onChange={event => {
                      setGovernanceDraft(currentValue => ({
                        ...currentValue,
                        scimOwnerEmail: event.target.value,
                      }));
                    }}
                  />
                </label>
                <label className="field">
                  <span>{copy.scimNotes}</span>
                  <input
                    value={governanceDraft.scimNotes}
                    onChange={event => {
                      setGovernanceDraft(currentValue => ({
                        ...currentValue,
                        scimNotes: event.target.value,
                      }));
                    }}
                  />
                </label>
                <button className="button" disabled={!session || pendingActionId === 'governance:update'} type="submit">
                  {pendingActionId === 'governance:update' ? copy.saving : copy.saveGovernance}
                </button>
              </div>
            </form>
          </section>

          <section className="admin-card stack">
            <div>
              <h2>{copy.mfaTitle}</h2>
              <p>{copy.mfaLead}</p>
            </div>
            {mfaUsers.length === 0 ? <p>{copy.noMfaUsers}</p> : null}
            <div className="admin-grid">
              {mfaUsers.map(user => (
                <article className="admin-card" key={user.id}>
                  <div className="section-header">
                    <div>
                      <h3>{user.displayName}</h3>
                      <p>{user.email}</p>
                    </div>
                  </div>
                  <button
                    className="button"
                    disabled={!session || pendingActionId === `mfa:${user.id}`}
                    onClick={() => {
                      if (!session) {
                        return;
                      }

                      void withMutation(`mfa:${user.id}`, async () => {
                        const result = await resetAdminUserMfa(session.sessionToken, user.id, {});

                        if (!result.ok) {
                          setMutationError(result.error.message);
                          return;
                        }

                        setNotice(`${user.email} MFA reset`);
                      });
                    }}
                    type="button"
                  >
                    {copy.resetMfa}
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="admin-card stack">
            <div>
              <h2>{copy.breakGlassTitle}</h2>
              <p>{copy.breakGlassLead}</p>
            </div>
            {data.capabilities.canReadPlatformAdmin && session ? (
              <form
                className="workspace-toolbar"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();

                  void withMutation('break-glass:create', async () => {
                    const result = await createAdminBreakGlassSession(session.sessionToken, {
                      tenantId: selectedTenantId || undefined,
                      reason: breakGlassDraft.reason,
                      justification: breakGlassDraft.justification || null,
                      expiresInMinutes: Number.parseInt(breakGlassDraft.expiresInMinutes, 10),
                    });

                    if (!result.ok) {
                      setMutationError(result.error.message);
                      return;
                    }

                    setNotice(`Break-glass ${result.data.session.id} created`);
                    setBreakGlassDraft({
                      reason: '',
                      justification: '',
                      expiresInMinutes: '60',
                    });
                  });
                }}
              >
                <label className="field">
                  <span>{copy.breakGlassReason}</span>
                  <input
                    value={breakGlassDraft.reason}
                    onChange={event => {
                      setBreakGlassDraft(currentValue => ({
                        ...currentValue,
                        reason: event.target.value,
                      }));
                    }}
                  />
                </label>
                <label className="field">
                  <span>{copy.breakGlassJustification}</span>
                  <input
                    value={breakGlassDraft.justification}
                    onChange={event => {
                      setBreakGlassDraft(currentValue => ({
                        ...currentValue,
                        justification: event.target.value,
                      }));
                    }}
                  />
                </label>
                <label className="field">
                  <span>{copy.breakGlassExpiry}</span>
                  <input
                    value={breakGlassDraft.expiresInMinutes}
                    onChange={event => {
                      setBreakGlassDraft(currentValue => ({
                        ...currentValue,
                        expiresInMinutes: event.target.value,
                      }));
                    }}
                  />
                </label>
                <button className="button" disabled={pendingActionId === 'break-glass:create'} type="submit">
                  {pendingActionId === 'break-glass:create' ? copy.saving : copy.createBreakGlass}
                </button>
              </form>
            ) : null}
            {data.breakGlassSessions.length === 0 ? <p>{copy.noBreakGlass}</p> : null}
            <div className="admin-grid">
              {data.breakGlassSessions.map(sessionItem => (
                <article className="admin-card" key={sessionItem.id}>
                  <div className="section-header">
                    <div>
                      <h3>{sessionItem.reason}</h3>
                      <p>{sessionItem.actorUserEmail ?? sessionItem.actorUserId}</p>
                    </div>
                    <span className={`status-chip status-${sessionItem.status}`}>{sessionItem.status}</span>
                  </div>
                  <div className="detail-list">
                    <div className="detail-row">
                      <span className="detail-label">Created</span>
                      <strong>{formatDateTime(sessionItem.createdAt)}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Expires</span>
                      <strong>{formatDateTime(sessionItem.expiresAt)}</strong>
                    </div>
                  </div>
                  {data.capabilities.canReadPlatformAdmin && sessionItem.status === 'active' && session ? (
                    <button
                      className="button button-secondary"
                      onClick={() => {
                        void withMutation(`break-glass:${sessionItem.id}:revoke`, async () => {
                          const result = await updateAdminBreakGlassSession(session.sessionToken, sessionItem.id, {
                            status: 'revoked',
                          });

                          if (!result.ok) {
                            setMutationError(result.error.message);
                            return;
                          }

                          setNotice(`Break-glass ${result.data.session.id} revoked`);
                        });
                      }}
                      type="button"
                    >
                      {copy.revokeBreakGlass}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
