import { randomUUID } from 'node:crypto';

import type { AuthUser } from '@agentifui/shared/auth';
import type { AdminService } from './admin-service.js';
import { calculateCompletionQuotaCost } from './workspace-quota.js';
import type {
  AdminBillingAdjustment,
  AdminBillingAdjustmentCreateRequest,
  AdminBillingPlanUpdateRequest,
  AdminBillingResponse,
  AdminBillingTenantSummary,
  AdminTenantBillingPlan,
} from '@agentifui/shared/admin';
import type { WorkspaceBillingResponse } from '@agentifui/shared/apps';

type UsageTenant = Awaited<ReturnType<AdminService['listUsageForUser']>>['tenants'][number];
type MutationResult<T> = { ok: true; data: T } | { ok: false; statusCode: 400 | 404 | 409; code: 'ADMIN_INVALID_PAYLOAD' | 'ADMIN_NOT_FOUND' | 'ADMIN_CONFLICT'; message: string; details?: unknown };

export type BillingService = {
  listBillingForUser(user: AuthUser, filters?: { tenantId?: string | null; search?: string | null }): Promise<AdminBillingResponse['data']>;
  getWorkspaceBillingForUser(user: AuthUser): Promise<WorkspaceBillingResponse['data']>;
  updateTenantPlanForUser(user: AuthUser, tenantId: string, input: AdminBillingPlanUpdateRequest): Promise<MutationResult<{ tenantId: string; plan: AdminTenantBillingPlan }>>;
  createTenantAdjustmentForUser(user: AuthUser, tenantId: string, input: AdminBillingAdjustmentCreateRequest): Promise<MutationResult<{ tenantId: string; adjustment: AdminBillingAdjustment; plan: AdminTenantBillingPlan }>>;
  recordExportUsageForUser(user: AuthUser, input: { tenantId?: string | null; referenceType: string; referenceId?: string | null }): Promise<void>;
};

const DEFAULT_FLAGS: AdminTenantBillingPlan['featureFlags'] = ['workflow_authoring', 'provider_routing', 'connector_sync', 'artifact_exports'];

export function buildDefaultBillingPlan(tenantId: string): AdminTenantBillingPlan {
  return { id: `billplan_${tenantId}`, tenantId, name: 'Growth', currency: 'USD', monthlyCreditLimit: 1000, softLimitPercent: 80, hardStopEnabled: true, graceCreditBuffer: 125, storageLimitBytes: 250 * 1024 * 1024, monthlyExportLimit: 200, featureFlags: DEFAULT_FLAGS, status: 'active', updatedAt: new Date().toISOString() };
}

function summarizeTenant(summary: UsageTenant, plan: AdminTenantBillingPlan, adjustments: AdminBillingAdjustment[], exportCount: number): AdminBillingTenantSummary {
  const retrievalCount = summary.appBreakdown.filter(app => app.kind === 'analysis' || app.kind === 'governance').reduce((total, app) => total + app.runCount, 0);
  const actionRows = [
    ['launch', summary.launchCount, 'launches', summary.launchCount],
    ['completion', summary.runCount, 'runs', calculateCompletionQuotaCost(summary.totalTokens)],
    ['retrieval', retrievalCount, 'retrieval_runs', retrievalCount],
    ['storage', summary.totalStorageBytes, 'bytes', summary.totalStorageBytes > 0 ? Math.max(1, Math.ceil(summary.totalStorageBytes / (25 * 1024 * 1024))) : 0],
    ['export', exportCount, 'exports', exportCount],
  ] as const;
  const actions = actionRows.map(([action, quantity, unit, credits]) => ({ action, quantity, unit, credits, estimatedUsd: Number((credits * 0.02).toFixed(2)) }));
  const effectiveCreditLimit = plan.monthlyCreditLimit + adjustments.reduce((total, item) => total + item.creditDelta, 0);
  const actualCreditsUsed = actions.reduce((total, item) => total + item.credits, 0);
  const status = plan.hardStopEnabled && actualCreditsUsed >= effectiveCreditLimit ? 'hard_stop' : actualCreditsUsed > plan.monthlyCreditLimit ? 'grace' : 'active';
  const warnings: AdminBillingTenantSummary['warnings'] = [];
  if (actualCreditsUsed >= Math.floor(plan.monthlyCreditLimit * (plan.softLimitPercent / 100))) warnings.push({ code: 'soft_limit_reached', severity: actualCreditsUsed >= effectiveCreditLimit ? 'critical' : 'warning', summary: 'Billing soft limit reached.', detail: `Used ${actualCreditsUsed} / ${effectiveCreditLimit} credits.` });
  if (status === 'grace') warnings.push({ code: 'grace_active', severity: 'warning', summary: 'Tenant is consuming grace credits.', detail: `Grace buffer: ${plan.graceCreditBuffer} credits.` });
  if (status === 'hard_stop') warnings.push({ code: 'hard_limit_reached', severity: 'critical', summary: 'Billing hard limit reached.', detail: 'New launches should remain blocked until the plan is adjusted.' });
  if (summary.totalStorageBytes >= plan.storageLimitBytes) warnings.push({ code: 'storage_limit_reached', severity: 'critical', summary: 'Storage limit reached.', detail: null });
  if (exportCount >= plan.monthlyExportLimit) warnings.push({ code: 'export_limit_reached', severity: 'warning', summary: 'Monthly export limit reached.', detail: null });
  return { tenantId: summary.tenantId, tenantName: summary.tenantName, plan: { ...plan, status }, actualCreditsUsed, effectiveCreditLimit, remainingCredits: effectiveCreditLimit - actualCreditsUsed, totalEstimatedUsd: Number(actions.reduce((total, item) => total + item.estimatedUsd, 0).toFixed(2)), storageBytesUsed: summary.totalStorageBytes, exportCount, actions, adjustments, recentRecords: actions.map(item => ({ id: `billrec_${summary.tenantId}_${item.action}`, tenantId: summary.tenantId, action: item.action, referenceType: 'aggregate', referenceId: null, quantity: item.quantity, unit: item.unit, credits: item.credits, estimatedUsd: item.estimatedUsd, occurredAt: new Date().toISOString(), maskedContext: { action: item.action, summaryWindow: 'rolling_30d' } })), warnings };
}

export function createBillingService(adminService: AdminService): BillingService {
  const plans = new Map<string, AdminTenantBillingPlan>();
  const adjustments = new Map<string, AdminBillingAdjustment[]>();
  const exportCounts = new Map<string, number>();

  return {
    async listBillingForUser(user, filters) {
      const usage = await adminService.listUsageForUser(user);
      const tenantFilter = filters?.tenantId?.trim() ?? '';
      const search = filters?.search?.trim().toLowerCase() ?? '';
      const tenants = usage.tenants.filter(summary => (tenantFilter ? summary.tenantId === tenantFilter : true)).filter(summary => (search ? summary.tenantName.toLowerCase().includes(search) || summary.appBreakdown.some(app => app.appName.toLowerCase().includes(search)) : true)).map(summary => summarizeTenant(summary, plans.get(summary.tenantId) ?? buildDefaultBillingPlan(summary.tenantId), (adjustments.get(summary.tenantId) ?? []).filter(item => !item.expiresAt || item.expiresAt > new Date().toISOString()), exportCounts.get(summary.tenantId) ?? 0));
      return { generatedAt: new Date().toISOString(), tenants, totals: { tenantCount: tenants.length, recordCount: tenants.reduce((total, tenant) => total + tenant.recentRecords.length, 0), totalCredits: tenants.reduce((total, tenant) => total + tenant.actualCreditsUsed, 0), totalEstimatedUsd: Number(tenants.reduce((total, tenant) => total + tenant.totalEstimatedUsd, 0).toFixed(2)), hardStopTenantCount: tenants.filter(tenant => tenant.plan.status === 'hard_stop').length } };
    },
    async getWorkspaceBillingForUser(user) {
      const tenant = (await this.listBillingForUser(user, { tenantId: user.tenantId })).tenants[0];
      if (!tenant) throw new Error(`No billing summary found for tenant ${user.tenantId}`);
      return { generatedAt: new Date().toISOString(), tenantId: tenant.tenantId, planName: tenant.plan.name, status: tenant.plan.status, actualCreditsUsed: tenant.actualCreditsUsed, effectiveCreditLimit: tenant.effectiveCreditLimit, remainingCredits: tenant.remainingCredits, storageBytesUsed: tenant.storageBytesUsed, storageLimitBytes: tenant.plan.storageLimitBytes, exportCount: tenant.exportCount, monthlyExportLimit: tenant.plan.monthlyExportLimit, warnings: tenant.warnings.map(item => ({ ...item, severity: item.code === 'hard_limit_reached' ? 'blocked' : item.severity })), actions: tenant.actions };
    },
    async updateTenantPlanForUser(user, tenantId, input) {
      const current = plans.get(tenantId) ?? buildDefaultBillingPlan(tenantId);
      const next = { ...current, name: input.name?.trim() || current.name, monthlyCreditLimit: typeof input.monthlyCreditLimit === 'number' ? Math.max(1, input.monthlyCreditLimit) : current.monthlyCreditLimit, softLimitPercent: typeof input.softLimitPercent === 'number' ? Math.min(99, Math.max(1, input.softLimitPercent)) : current.softLimitPercent, hardStopEnabled: typeof input.hardStopEnabled === 'boolean' ? input.hardStopEnabled : current.hardStopEnabled, graceCreditBuffer: typeof input.graceCreditBuffer === 'number' ? Math.max(0, input.graceCreditBuffer) : current.graceCreditBuffer, storageLimitBytes: typeof input.storageLimitBytes === 'number' ? Math.max(1, input.storageLimitBytes) : current.storageLimitBytes, monthlyExportLimit: typeof input.monthlyExportLimit === 'number' ? Math.max(0, input.monthlyExportLimit) : current.monthlyExportLimit, featureFlags: input.featureFlags ?? current.featureFlags, updatedAt: new Date().toISOString() };
      plans.set(tenantId, next);
      return { ok: true, data: { tenantId, plan: next } };
    },
    async createTenantAdjustmentForUser(user, tenantId, input) {
      if (!Number.isFinite(input.creditDelta) || input.creditDelta === 0) return { ok: false, statusCode: 400, code: 'ADMIN_INVALID_PAYLOAD', message: 'Billing adjustments require a non-zero credit delta.' };
      const adjustment = { id: `billadj_${randomUUID()}`, tenantId, kind: input.kind, creditDelta: Math.trunc(input.creditDelta), expiresAt: input.expiresAt ?? null, reason: input.reason ?? null, createdAt: new Date().toISOString(), createdByUserId: user.id } satisfies AdminBillingAdjustment;
      adjustments.set(tenantId, [...(adjustments.get(tenantId) ?? []), adjustment]);
      return { ok: true, data: { tenantId, adjustment, plan: plans.get(tenantId) ?? buildDefaultBillingPlan(tenantId) } };
    },
    async recordExportUsageForUser(user, input) {
      const tenantId = input.tenantId?.trim() || user.tenantId;
      exportCounts.set(tenantId, (exportCounts.get(tenantId) ?? 0) + 1);
    },
  };
}
