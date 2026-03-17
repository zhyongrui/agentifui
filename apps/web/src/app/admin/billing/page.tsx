'use client';

import type {
  AdminBillingAdjustmentCreateRequest,
  AdminBillingAdjustmentKind,
  AdminBillingBreakdownEntry,
  AdminBillingTenantSummary,
  AdminBillingPlanUpdateRequest,
} from '@agentifui/shared/admin';
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';

import { useI18n } from '../../../components/i18n-provider';
import {
  createAdminBillingAdjustment,
  exportAdminBilling,
  fetchAdminBilling,
  updateAdminBillingPlan,
} from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

type Notice = {
  tone: 'error' | 'success';
  message: string;
};

type PlanDraft = Pick<
  AdminBillingPlanUpdateRequest,
  | 'name'
  | 'monthlyCreditLimit'
  | 'softLimitPercent'
  | 'graceCreditBuffer'
  | 'storageLimitBytes'
  | 'monthlyExportLimit'
  | 'hardStopEnabled'
>;

type AdjustmentDraft = {
  kind: AdminBillingAdjustmentKind;
  creditDelta: number;
  reason: string;
};

function readPlanDraft(
  drafts: Record<string, PlanDraft>,
  tenant: AdminBillingTenantSummary
): PlanDraft {
  return (
    drafts[tenant.tenantId] ?? {
      name: tenant.plan.name,
      monthlyCreditLimit: tenant.plan.monthlyCreditLimit,
      softLimitPercent: tenant.plan.softLimitPercent,
      graceCreditBuffer: tenant.plan.graceCreditBuffer,
      storageLimitBytes: tenant.plan.storageLimitBytes,
      monthlyExportLimit: tenant.plan.monthlyExportLimit,
      hardStopEnabled: tenant.plan.hardStopEnabled,
    }
  );
}

function readAdjustmentDraft(drafts: Record<string, AdjustmentDraft>, tenantId: string): AdjustmentDraft {
  return (
    drafts[tenantId] ?? {
      kind: 'credit_grant',
      creditDelta: 50,
      reason: '',
    }
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function BillingBreakdownSection({
  entries,
  title,
  copy,
}: {
  entries: AdminBillingBreakdownEntry[];
  title: string;
  copy: ReturnType<typeof useI18n>['messages']['adminBilling'];
}) {
  return (
    <div className="stack">
      <strong>{title}</strong>
      {entries.length === 0 ? (
        <span className="tag tag-muted">{copy.noBreakdowns}</span>
      ) : (
        <div className="detail-list">
          {entries.map(entry => (
            <div className="detail-row" key={`${entry.scope}:${entry.key}`}>
              <div>
                <strong>{entry.label}</strong>
                <p className="lead" style={{ margin: 0 }}>
                  {entry.credits} credits · ${entry.estimatedUsd.toFixed(2)}
                </p>
                <p className="lead" style={{ margin: 0 }}>
                  {copy.breakdownLaunches} {entry.launchCount} · {copy.breakdownRuns} {entry.runCount} ·{' '}
                  {copy.breakdownRetrievals} {entry.retrievalCount} · {copy.breakdownStorage}{' '}
                  {entry.storageBytes} · {copy.breakdownExports} {entry.exportCount}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminBillingPage() {
  const { messages, formatDateTime } = useI18n();
  const billingCopy = messages.adminBilling;
  const { data, error, isLoading, reload, session } = useAdminPageData(fetchAdminBilling);
  const [search, setSearch] = useState('');
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({});
  const [adjustmentDrafts, setAdjustmentDrafts] = useState<Record<string, AdjustmentDraft>>({});
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const tenants = useMemo(() => {
    if (!data) {
      return [];
    }

    const query = search.trim().toLowerCase();

    if (!query) {
      return data.tenants;
    }

    return data.tenants.filter(tenant =>
      tenant.tenantName.toLowerCase().includes(query)
    );
  }, [data, search]);

  if (isLoading) {
    return <p className="lead">{billingCopy.loading}</p>;
  }

  async function handleSavePlan(event: FormEvent<HTMLFormElement>, tenant: AdminBillingTenantSummary) {
    event.preventDefault();

    if (!session) {
      return;
    }

    const draft = readPlanDraft(planDrafts, tenant);
    setPendingActionId(`plan:${tenant.tenantId}`);
    setNotice(null);

    const result = await updateAdminBillingPlan(session.sessionToken, tenant.tenantId, draft);

    setPendingActionId(null);

    if (!result.ok) {
      setNotice({
        tone: 'error',
        message: result.error.message || billingCopy.updateFailed,
      });
      return;
    }

    setNotice({
      tone: 'success',
      message: billingCopy.planSaved(tenant.tenantName),
    });
    reload();
  }

  async function handleAddAdjustment(event: FormEvent<HTMLFormElement>, tenant: AdminBillingTenantSummary) {
    event.preventDefault();

    if (!session) {
      return;
    }

    const draft = readAdjustmentDraft(adjustmentDrafts, tenant.tenantId);
    const payload: AdminBillingAdjustmentCreateRequest = {
      kind: draft.kind,
      creditDelta: draft.creditDelta,
      reason: draft.reason || null,
    };

    setPendingActionId(`adjust:${tenant.tenantId}`);
    setNotice(null);

    const result = await createAdminBillingAdjustment(
      session.sessionToken,
      tenant.tenantId,
      payload
    );

    setPendingActionId(null);

    if (!result.ok) {
      setNotice({
        tone: 'error',
        message: result.error.message || billingCopy.adjustmentFailed,
      });
      return;
    }

    setAdjustmentDrafts(current => ({
      ...current,
      [tenant.tenantId]: {
        ...draft,
        reason: '',
      },
    }));
    setNotice({
      tone: 'success',
      message: billingCopy.adjustmentSaved(tenant.tenantName, payload.creditDelta),
    });
    reload();
  }

  async function handleExport(format: 'csv' | 'json') {
    if (!session) {
      return;
    }

    setPendingActionId(`export:${format}`);
    setNotice(null);

    const result = await exportAdminBilling(session.sessionToken, format);

    setPendingActionId(null);

    if (!('blob' in result)) {
      setNotice({
        tone: 'error',
        message: result.error.message || billingCopy.exportFailed,
      });
      return;
    }

    downloadBlob(result.blob, result.metadata.filename);
  }

  function updatePlanDraft(
    tenantId: string,
    tenant: AdminBillingTenantSummary,
    field: keyof PlanDraft,
    value: string | number | boolean
  ) {
    setPlanDrafts(current => ({
      ...current,
      [tenantId]: {
        ...readPlanDraft(current, tenant),
        [field]: value,
      },
    }));
  }

  function updateAdjustmentDraft(
    tenantId: string,
    field: keyof AdjustmentDraft,
    value: string | number
  ) {
    setAdjustmentDrafts(current => ({
      ...current,
      [tenantId]: {
        ...readAdjustmentDraft(current, tenantId),
        [field]: value,
      } as AdjustmentDraft,
    }));
  }

  return (
    <div className="stack">
      <div>
        <h1>{billingCopy.title}</h1>
        <p className="lead">{billingCopy.lead}</p>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className={`notice ${notice.tone}`}>{notice.message}</div> : null}

      {!data ? null : (
        <>
          <div className="admin-stat-grid">
            <article className="admin-stat-card">
              <span>{billingCopy.totalTenants}</span>
              <strong>{data.totals.tenantCount}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{billingCopy.hardStopTenants}</span>
              <strong>{data.totals.hardStopTenantCount}</strong>
            </article>
            <article className="admin-stat-card">
              <span>{billingCopy.estimatedUsd}</span>
              <strong>${data.totals.totalEstimatedUsd.toFixed(2)}</strong>
            </article>
          </div>

          <div className="workspace-badges">
            <span className="workspace-badge">
              {billingCopy.snapshot}: {formatDateTime(data.generatedAt)}
            </span>
          </div>

          <div className="workspace-toolbar">
            <label className="field">
              <span>{billingCopy.search}</span>
              <input
                type="search"
                value={search}
                placeholder={billingCopy.searchPlaceholder}
                onChange={event => setSearch(event.target.value)}
              />
            </label>
            <div className="field">
              <span>{billingCopy.records}</span>
              <div className="button-row">
                <button
                  className="secondary"
                  type="button"
                  disabled={pendingActionId === 'export:json'}
                  onClick={() => {
                    void handleExport('json');
                  }}
                >
                  {billingCopy.exportJson}
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={pendingActionId === 'export:csv'}
                  onClick={() => {
                    void handleExport('csv');
                  }}
                >
                  {billingCopy.exportCsv}
                </button>
              </div>
            </div>
          </div>

          <div className="admin-grid">
            {tenants.map(tenant => {
              const planDraft = readPlanDraft(planDrafts, tenant);
              const adjustmentDraft = readAdjustmentDraft(adjustmentDrafts, tenant.tenantId);

              return (
                <article className="admin-card stack" key={tenant.tenantId}>
                  <div className="section-header">
                    <div>
                      <h2>{tenant.tenantName}</h2>
                      <p>
                        {billingCopy.planName}: {tenant.plan.name}
                      </p>
                    </div>
                    <span className={`status-chip status-${tenant.plan.status}`}>
                      {tenant.plan.status}
                    </span>
                  </div>

                  <div className="detail-list">
                    <div className="detail-row">
                      <span className="detail-label">{billingCopy.creditsUsed}</span>
                      <strong>{tenant.actualCreditsUsed}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{billingCopy.remainingCredits}</span>
                      <strong>{tenant.remainingCredits}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{billingCopy.storageUsage}</span>
                      <strong>
                        {tenant.storageBytesUsed} / {tenant.plan.storageLimitBytes}
                      </strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{billingCopy.exportsUsed}</span>
                      <strong>
                        {tenant.exportCount} / {tenant.plan.monthlyExportLimit}
                      </strong>
                    </div>
                  </div>

                  <div>
                    <strong>{billingCopy.warnings}</strong>
                    <div className="tag-row admin-tag-row">
                      {tenant.warnings.length === 0 ? (
                        <span className="tag tag-muted">{billingCopy.noWarnings}</span>
                      ) : (
                        tenant.warnings.map(item => (
                          <span className="tag" key={`${tenant.tenantId}:${item.code}`}>
                            {item.code}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <strong>{billingCopy.featureFlags}</strong>
                    <div className="tag-row admin-tag-row">
                      {tenant.plan.featureFlags.map(flag => (
                        <span className="tag" key={`${tenant.tenantId}:${flag}`}>
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="stack">
                    <strong>{billingCopy.breakdowns}</strong>
                    <BillingBreakdownSection
                      entries={tenant.breakdowns.apps}
                      title={billingCopy.appBreakdown}
                      copy={billingCopy}
                    />
                    <BillingBreakdownSection
                      entries={tenant.breakdowns.groups}
                      title={billingCopy.groupBreakdown}
                      copy={billingCopy}
                    />
                    <BillingBreakdownSection
                      entries={tenant.breakdowns.providers}
                      title={billingCopy.providerBreakdown}
                      copy={billingCopy}
                    />
                  </div>

                  <form className="stack" onSubmit={event => void handleSavePlan(event, tenant)}>
                    <div className="admin-two-column-grid">
                      <label className="field">
                        <span>{billingCopy.planName}</span>
                        <input
                          value={planDraft.name ?? ''}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updatePlanDraft(tenant.tenantId, tenant, 'name', event.target.value)
                          }
                        />
                      </label>
                      <label className="field">
                        <span>{billingCopy.monthlyLimit}</span>
                        <input
                          type="number"
                          value={planDraft.monthlyCreditLimit ?? 0}
                          onChange={event =>
                            updatePlanDraft(
                              tenant.tenantId,
                              tenant,
                              'monthlyCreditLimit',
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>{billingCopy.softLimitPercent}</span>
                        <input
                          type="number"
                          value={planDraft.softLimitPercent ?? 0}
                          onChange={event =>
                            updatePlanDraft(
                              tenant.tenantId,
                              tenant,
                              'softLimitPercent',
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>{billingCopy.graceBuffer}</span>
                        <input
                          type="number"
                          value={planDraft.graceCreditBuffer ?? 0}
                          onChange={event =>
                            updatePlanDraft(
                              tenant.tenantId,
                              tenant,
                              'graceCreditBuffer',
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>{billingCopy.storageLimit}</span>
                        <input
                          type="number"
                          value={planDraft.storageLimitBytes ?? 0}
                          onChange={event =>
                            updatePlanDraft(
                              tenant.tenantId,
                              tenant,
                              'storageLimitBytes',
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>{billingCopy.monthlyExports}</span>
                        <input
                          type="number"
                          value={planDraft.monthlyExportLimit ?? 0}
                          onChange={event =>
                            updatePlanDraft(
                              tenant.tenantId,
                              tenant,
                              'monthlyExportLimit',
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>{billingCopy.hardStopEnabled}</span>
                        <select
                          value={planDraft.hardStopEnabled ? 'enabled' : 'disabled'}
                          onChange={event =>
                            updatePlanDraft(
                              tenant.tenantId,
                              tenant,
                              'hardStopEnabled',
                              event.target.value === 'enabled'
                            )
                          }
                        >
                          <option value="enabled">{billingCopy.enabled}</option>
                          <option value="disabled">{billingCopy.disabled}</option>
                        </select>
                      </label>
                    </div>
                    <button
                      className="primary"
                      type="submit"
                      disabled={pendingActionId === `plan:${tenant.tenantId}`}
                    >
                      {pendingActionId === `plan:${tenant.tenantId}`
                        ? billingCopy.savingPlan
                        : billingCopy.savePlan}
                    </button>
                  </form>

                  <form className="stack" onSubmit={event => void handleAddAdjustment(event, tenant)}>
                    <div className="admin-two-column-grid">
                      <label className="field">
                        <span>{billingCopy.adjustmentKind}</span>
                        <select
                          value={adjustmentDraft.kind}
                          onChange={event =>
                            updateAdjustmentDraft(tenant.tenantId, 'kind', event.target.value)
                          }
                        >
                          <option value="credit_grant">{billingCopy.creditGrant}</option>
                          <option value="temporary_limit_raise">
                            {billingCopy.temporaryLimitRaise}
                          </option>
                          <option value="meter_correction">{billingCopy.meterCorrection}</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>{billingCopy.adjustmentDelta}</span>
                        <input
                          type="number"
                          value={adjustmentDraft.creditDelta}
                          onChange={event =>
                            updateAdjustmentDraft(
                              tenant.tenantId,
                              'creditDelta',
                              Number(event.target.value)
                            )
                          }
                        />
                      </label>
                      <label className="field" style={{ gridColumn: '1 / -1' }}>
                        <span>{billingCopy.reason}</span>
                        <input
                          value={adjustmentDraft.reason}
                          placeholder={billingCopy.reasonPlaceholder}
                          onChange={event =>
                            updateAdjustmentDraft(tenant.tenantId, 'reason', event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="secondary"
                      type="submit"
                      disabled={pendingActionId === `adjust:${tenant.tenantId}`}
                    >
                      {pendingActionId === `adjust:${tenant.tenantId}`
                        ? billingCopy.addingAdjustment
                        : billingCopy.addAdjustment}
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
