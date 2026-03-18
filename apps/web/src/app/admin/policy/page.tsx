'use client';

import type {
  AdminPolicyDetectorType,
  AdminPolicyPackExceptionScope,
  AdminPolicyPackSimulationScope,
} from '@agentifui/shared/admin';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { useI18n } from '../../../components/i18n-provider';
import { SectionSkeleton } from '../../../components/section-state';
import {
  createAdminPolicyException,
  fetchAdminPolicy,
  fetchAdminTenants,
  reviewAdminPolicyException,
  simulateAdminPolicy,
} from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

type Notice = {
  tone: 'error' | 'success';
  message: string;
};

const DETECTORS: AdminPolicyDetectorType[] = [
  'secret',
  'pii',
  'regulated_term',
  'exfiltration_pattern',
];

const EXCEPTION_SCOPES: AdminPolicyPackExceptionScope[] = ['tenant', 'group', 'app', 'runtime'];
const SIMULATION_SCOPES: AdminPolicyPackSimulationScope[] = [
  'chat',
  'retrieval',
  'sharing',
  'artifact_download',
  'export',
];

export default function AdminPolicyPage() {
  const { locale, formatDateTime, messages } = useI18n();
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenantOptions, setTenantOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [simulationDraft, setSimulationDraft] = useState({
    scope: 'retrieval' as AdminPolicyPackSimulationScope,
    content: '',
    groupId: '',
    appId: '',
    runtimeId: '',
  });
  const [exceptionDraft, setExceptionDraft] = useState({
    scope: 'tenant' as AdminPolicyPackExceptionScope,
    scopeId: '',
    detector: 'secret' as AdminPolicyDetectorType,
    label: '',
    expiresAt: '',
    note: '',
  });
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { expiresAt: string; note: string }>>({});

  const loadPolicy = useCallback(
    (sessionToken: string) =>
      fetchAdminPolicy(sessionToken, {
        tenantId: selectedTenantId || undefined,
      }),
    [selectedTenantId]
  );

  const { data, error, isLoading, reload, session } = useAdminPageData(loadPolicy);

  useEffect(() => {
    if (!session || !data?.governance || !data.governance.tenantId) {
      return;
    }

    if (!selectedTenantId) {
      setSelectedTenantId(data.governance.tenantId);
    }
  }, [data?.governance?.tenantId, selectedTenantId, session]);

  useEffect(() => {
    if (!session || !data?.governance) {
      setTenantOptions([]);
      return;
    }

    let cancelled = false;

    void fetchAdminTenants(session.sessionToken)
      .then(result => {
        if (cancelled || !result.ok) {
          return;
        }

        setTenantOptions(result.data.tenants.map(tenant => ({ id: tenant.id, name: tenant.name })));
      })
      .catch(() => {
        if (!cancelled) {
          setTenantOptions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [data?.governance?.tenantId, session]);

  const copy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            loading: '正在加载策略治理...',
            title: '策略治理',
            lead: '查看租户策略包、模拟策略判定，并管理带过期时间的 detector exception。',
            currentTenant: '当前租户',
            totalExceptions: '策略例外',
            flaggedRuns: '已标记判定',
            blockedRuns: '已阻断判定',
            latestEvaluations: '近期判定',
            simulationTitle: '策略模拟',
            simulationLead: '在正式 rollout 前，用一段文本快速检查 detector 和策略包会如何判定。',
            simulationScope: '模拟范围',
            simulationContent: '模拟内容',
            scopeIdHint: '可选范围',
            runSimulation: '运行模拟',
            simulationRunning: '模拟中...',
            exceptionsTitle: '策略例外',
            exceptionsLead: '为特定 detector 建例外，并记录 review note 与过期时间。',
            exceptionScope: '例外范围',
            exceptionScopeId: '范围 ID',
            detector: 'Detector',
            label: '标签',
            expiresAt: '过期时间',
            note: '备注',
            createException: '创建例外',
            creatingException: '创建中...',
            recentTitle: '近期策略判定',
            exceptionsList: '当前例外',
            noEvaluations: '还没有策略判定记录。',
            noExceptions: '还没有创建策略例外。',
            review: '保存 review',
            reviewing: '保存中...',
            allowed: '允许',
            flagged: '标记',
            blocked: '阻断',
            tenantSelector: '租户范围',
            never: '从不',
          }
        : {
            loading: 'Loading policy controls...',
            title: 'Policy',
            lead: 'Inspect the tenant policy pack, simulate detector outcomes, and manage expiring exceptions.',
            currentTenant: 'Current tenant',
            totalExceptions: 'Exceptions',
            flaggedRuns: 'Flagged evaluations',
            blockedRuns: 'Blocked evaluations',
            latestEvaluations: 'Recent evaluations',
            simulationTitle: 'Policy simulation',
            simulationLead: 'Check how detectors and policy packs would classify a piece of content before rollout.',
            simulationScope: 'Simulation scope',
            simulationContent: 'Content',
            scopeIdHint: 'Optional scope id',
            runSimulation: 'Run simulation',
            simulationRunning: 'Running...',
            exceptionsTitle: 'Policy exceptions',
            exceptionsLead: 'Create detector exceptions and capture review notes plus expiry timestamps.',
            exceptionScope: 'Exception scope',
            exceptionScopeId: 'Scope id',
            detector: 'Detector',
            label: 'Label',
            expiresAt: 'Expires at',
            note: 'Note',
            createException: 'Create exception',
            creatingException: 'Creating...',
            recentTitle: 'Recent policy evaluations',
            exceptionsList: 'Current exceptions',
            noEvaluations: 'No policy evaluations yet.',
            noExceptions: 'No policy exceptions yet.',
            review: 'Save review',
            reviewing: 'Saving...',
            allowed: 'Allowed',
            flagged: 'Flagged',
            blocked: 'Blocked',
            tenantSelector: 'Tenant scope',
            never: 'Never',
          },
    [locale]
  );

  if (isLoading) {
    return <SectionSkeleton blocks={6} lead={copy.loading} title={copy.title} />;
  }

  const blockedCount =
    data?.recentEvaluations.filter(evaluation => evaluation.outcome === 'blocked').length ?? 0;
  const flaggedCount =
    data?.recentEvaluations.filter(evaluation => evaluation.outcome === 'flagged').length ?? 0;

  async function withMutation(actionId: string, task: () => Promise<void>) {
    setPendingActionId(actionId);
    setNotice(null);

    try {
      await task();
      reload();
    } catch {
      setNotice({
        tone: 'error',
        message: locale === 'zh-CN' ? '请求失败，请重试。' : 'Request failed. Please retry.',
      });
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
      {notice ? <div className={`notice ${notice.tone}`}>{notice.message}</div> : null}

      {data?.governance ? (
        <>
          <section className="admin-card stack">
            <div className="workspace-toolbar">
              <label className="field">
                <span>{copy.tenantSelector}</span>
                <select value={selectedTenantId} onChange={event => setSelectedTenantId(event.target.value)}>
                  <option value={data.governance.tenantId}>{data.governance.tenantId}</option>
                  {tenantOptions
                    .filter(tenant => tenant.id !== data.governance?.tenantId)
                    .map(tenant => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="admin-stat-grid">
              <article className="admin-stat-card">
                <span>{copy.currentTenant}</span>
                <strong>{data.governance.tenantId}</strong>
              </article>
              <article className="admin-stat-card">
                <span>{copy.totalExceptions}</span>
                <strong>{data.exceptions.length}</strong>
              </article>
              <article className="admin-stat-card">
                <span>{copy.flaggedRuns}</span>
                <strong>{flaggedCount}</strong>
              </article>
              <article className="admin-stat-card">
                <span>{copy.blockedRuns}</span>
                <strong>{blockedCount}</strong>
              </article>
            </div>
            <div className="detail-list">
              <div className="detail-row">
                <strong>Runtime</strong>
                <span>{data.governance.policyPack.runtimeMode}</span>
              </div>
              <div className="detail-row">
                <strong>Retrieval</strong>
                <span>{data.governance.policyPack.retrievalMode}</span>
              </div>
              <div className="detail-row">
                <strong>Sharing</strong>
                <span>{data.governance.policyPack.sharingMode}</span>
              </div>
              <div className="detail-row">
                <strong>Artifact download</strong>
                <span>{data.governance.policyPack.artifactDownloadMode}</span>
              </div>
              <div className="detail-row">
                <strong>Export</strong>
                <span>{data.governance.policyPack.exportMode}</span>
              </div>
              <div className="detail-row">
                <strong>Retention</strong>
                <span>{data.governance.policyPack.retentionMode}</span>
              </div>
            </div>
          </section>

          <section className="admin-card stack">
            <div>
              <h2>{copy.simulationTitle}</h2>
              <p>{copy.simulationLead}</p>
            </div>
            <form
              className="stack"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();

                if (!session) {
                  return;
                }

                void withMutation('policy:simulate', async () => {
                  const result = await simulateAdminPolicy(session.sessionToken, {
                    tenantId: selectedTenantId || undefined,
                    scope: simulationDraft.scope,
                    content: simulationDraft.content,
                    groupId: simulationDraft.groupId || null,
                    appId: simulationDraft.appId || null,
                    runtimeId: simulationDraft.runtimeId || null,
                  });

                  if (!result.ok) {
                    setNotice({
                      tone: 'error',
                      message: result.error.message,
                    });
                    return;
                  }

                  setNotice({
                    tone: 'success',
                    message:
                      locale === 'zh-CN'
                        ? `模拟完成，结果为 ${result.data.evaluation.outcome}。`
                        : `Simulation completed with ${result.data.evaluation.outcome}.`,
                  });
                });
              }}
            >
              <div className="workspace-toolbar">
                <label className="field">
                  <span>{copy.simulationScope}</span>
                  <select
                    value={simulationDraft.scope}
                    onChange={event =>
                      setSimulationDraft(current => ({
                        ...current,
                        scope: event.target.value as AdminPolicyPackSimulationScope,
                      }))
                    }
                  >
                    {SIMULATION_SCOPES.map(scope => (
                      <option key={scope} value={scope}>
                        {scope}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Group ID</span>
                  <input
                    value={simulationDraft.groupId}
                    onChange={event =>
                      setSimulationDraft(current => ({
                        ...current,
                        groupId: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>App ID</span>
                  <input
                    value={simulationDraft.appId}
                    onChange={event =>
                      setSimulationDraft(current => ({
                        ...current,
                        appId: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Runtime ID</span>
                  <input
                    value={simulationDraft.runtimeId}
                    onChange={event =>
                      setSimulationDraft(current => ({
                        ...current,
                        runtimeId: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span>{copy.simulationContent}</span>
                <textarea
                  rows={6}
                  value={simulationDraft.content}
                  onChange={event =>
                    setSimulationDraft(current => ({
                      ...current,
                      content: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="actions">
                <button className="button-primary" disabled={pendingActionId === 'policy:simulate'} type="submit">
                  {pendingActionId === 'policy:simulate' ? copy.simulationRunning : copy.runSimulation}
                </button>
              </div>
            </form>
          </section>

          <section className="admin-card stack">
            <div>
              <h2>{copy.exceptionsTitle}</h2>
              <p>{copy.exceptionsLead}</p>
            </div>
            <form
              className="stack"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();

                if (!session) {
                  return;
                }

                void withMutation('policy:exception:create', async () => {
                  const result = await createAdminPolicyException(session.sessionToken, {
                    tenantId: selectedTenantId || undefined,
                    scope: exceptionDraft.scope,
                    scopeId: exceptionDraft.scopeId || null,
                    detector: exceptionDraft.detector,
                    label: exceptionDraft.label,
                    expiresAt: exceptionDraft.expiresAt || null,
                    note: exceptionDraft.note || null,
                  });

                  if (!result.ok) {
                    setNotice({
                      tone: 'error',
                      message: result.error.message,
                    });
                    return;
                  }

                  setExceptionDraft(current => ({
                    ...current,
                    label: '',
                    scopeId: '',
                    expiresAt: '',
                    note: '',
                  }));
                  setNotice({
                    tone: 'success',
                    message:
                      locale === 'zh-CN'
                        ? `已创建例外 ${result.data.exception.label}。`
                        : `Created exception ${result.data.exception.label}.`,
                  });
                });
              }}
            >
              <div className="workspace-toolbar">
                <label className="field">
                  <span>{copy.exceptionScope}</span>
                  <select
                    value={exceptionDraft.scope}
                    onChange={event =>
                      setExceptionDraft(current => ({
                        ...current,
                        scope: event.target.value as AdminPolicyPackExceptionScope,
                      }))
                    }
                  >
                    {EXCEPTION_SCOPES.map(scope => (
                      <option key={scope} value={scope}>
                        {scope}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{copy.exceptionScopeId}</span>
                  <input
                    value={exceptionDraft.scopeId}
                    onChange={event =>
                      setExceptionDraft(current => ({
                        ...current,
                        scopeId: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>{copy.detector}</span>
                  <select
                    value={exceptionDraft.detector}
                    onChange={event =>
                      setExceptionDraft(current => ({
                        ...current,
                        detector: event.target.value as AdminPolicyDetectorType,
                      }))
                    }
                  >
                    {DETECTORS.map(detector => (
                      <option key={detector} value={detector}>
                        {detector}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="workspace-toolbar">
                <label className="field">
                  <span>{copy.label}</span>
                  <input
                    value={exceptionDraft.label}
                    onChange={event =>
                      setExceptionDraft(current => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>{copy.expiresAt}</span>
                  <input
                    value={exceptionDraft.expiresAt}
                    onChange={event =>
                      setExceptionDraft(current => ({
                        ...current,
                        expiresAt: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span>{copy.note}</span>
                <textarea
                  rows={3}
                  value={exceptionDraft.note}
                  onChange={event =>
                    setExceptionDraft(current => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="actions">
                <button
                  className="button-primary"
                  disabled={pendingActionId === 'policy:exception:create'}
                  type="submit"
                >
                  {pendingActionId === 'policy:exception:create'
                    ? copy.creatingException
                    : copy.createException}
                </button>
              </div>
            </form>

            <div className="detail-list">
              <strong>{copy.exceptionsList}</strong>
              {data.exceptions.length === 0 ? (
                <span className="tag tag-muted">{copy.noExceptions}</span>
              ) : (
                data.exceptions.map(exception => {
                  const reviewDraft = reviewDrafts[exception.id] ?? {
                    expiresAt: exception.expiresAt ?? '',
                    note: '',
                  };

                  return (
                    <article className="admin-card stack" key={exception.id}>
                      <div className="detail-row">
                        <strong>{exception.label}</strong>
                        <span>{exception.detector}</span>
                      </div>
                      <div className="detail-row">
                        <span>{exception.scope}</span>
                        <span>{exception.scopeId ?? exception.tenantId}</span>
                      </div>
                      <div className="detail-row">
                        <span>{copy.expiresAt}</span>
                        <span>{formatDateTime(exception.expiresAt, copy.never)}</span>
                      </div>
                      <form
                        className="stack"
                        onSubmit={(event: FormEvent<HTMLFormElement>) => {
                          event.preventDefault();

                          if (!session) {
                            return;
                          }

                          void withMutation(`policy:review:${exception.id}`, async () => {
                            const result = await reviewAdminPolicyException(
                              session.sessionToken,
                              exception.id,
                              {
                                expiresAt: reviewDraft.expiresAt || null,
                                note: reviewDraft.note || null,
                              }
                            );

                            if (!result.ok) {
                              setNotice({
                                tone: 'error',
                                message: result.error.message,
                              });
                              return;
                            }

                            setNotice({
                              tone: 'success',
                              message:
                                locale === 'zh-CN'
                                  ? `已更新例外 ${result.data.exception.label}。`
                                  : `Updated exception ${result.data.exception.label}.`,
                            });
                            setReviewDrafts(current => ({
                              ...current,
                              [exception.id]: {
                                expiresAt: result.data.exception.expiresAt ?? '',
                                note: '',
                              },
                            }));
                          });
                        }}
                      >
                        <div className="workspace-toolbar">
                          <label className="field">
                            <span>{copy.expiresAt}</span>
                            <input
                              value={reviewDraft.expiresAt}
                              onChange={event =>
                                setReviewDrafts(current => ({
                                  ...current,
                                  [exception.id]: {
                                    ...reviewDraft,
                                    expiresAt: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>{copy.note}</span>
                            <input
                              value={reviewDraft.note}
                              onChange={event =>
                                setReviewDrafts(current => ({
                                  ...current,
                                  [exception.id]: {
                                    ...reviewDraft,
                                    note: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        </div>
                        <div className="actions">
                          <button
                            className="button-secondary"
                            disabled={pendingActionId === `policy:review:${exception.id}`}
                            type="submit"
                          >
                            {pendingActionId === `policy:review:${exception.id}`
                              ? copy.reviewing
                              : copy.review}
                          </button>
                        </div>
                      </form>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="admin-card stack">
            <div>
              <h2>{copy.recentTitle}</h2>
            </div>
            {data.recentEvaluations.length === 0 ? (
              <span className="tag tag-muted">{copy.noEvaluations}</span>
            ) : (
              <div className="detail-list">
                {data.recentEvaluations.map(evaluation => (
                  <article className="admin-card stack" key={evaluation.id}>
                    <div className="detail-row">
                      <strong>{evaluation.scope}</strong>
                      <span>
                        {evaluation.outcome === 'allowed'
                          ? copy.allowed
                          : evaluation.outcome === 'flagged'
                            ? copy.flagged
                            : copy.blocked}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>{formatDateTime(evaluation.occurredAt, copy.never)}</span>
                      <span>{evaluation.detectorMatches.length} detector matches</span>
                    </div>
                    <div className="detail-list">
                      {evaluation.reasons.map(reason => (
                        <span className="tag tag-muted" key={reason}>
                          {reason}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
