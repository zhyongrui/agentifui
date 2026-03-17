import type { DatabaseClient } from '@agentifui/db';
import type { AuthUser } from '@agentifui/shared/auth';
import type { AdminBillingAdjustment, AdminBillingAdjustmentCreateRequest, AdminBillingPlanUpdateRequest, AdminTenantBillingPlan } from '@agentifui/shared/admin';

import type { AdminService } from './admin-service.js';
import { buildDefaultBillingPlan, createBillingService, type BillingService } from './billing-service.js';

type BillingPlanRow = {
  id: string;
  tenant_id: string;
  name: string;
  monthly_credit_limit: number;
  soft_limit_percent: number;
  hard_stop_enabled: boolean;
  grace_credit_buffer: number;
  storage_limit_bytes: number;
  monthly_export_limit: number;
  feature_flags: string[] | string;
  status: AdminTenantBillingPlan['status'];
  updated_at: Date | string;
};

type BillingAdjustmentRow = {
  id: string;
  tenant_id: string;
  kind: AdminBillingAdjustment['kind'];
  credit_delta: number;
  expires_at: Date | string | null;
  reason: string | null;
  created_by_user_id: string | null;
  created_at: Date | string;
};

function toIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseFeatureFlags(value: string[] | string) {
  if (Array.isArray(value)) return value as AdminTenantBillingPlan['featureFlags'];
  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? (parsed as AdminTenantBillingPlan['featureFlags']) : [];
  } catch {
    return [];
  }
}

function toPlan(row: BillingPlanRow): AdminTenantBillingPlan {
  return { id: row.id, tenantId: row.tenant_id, name: row.name, currency: 'USD', monthlyCreditLimit: row.monthly_credit_limit, softLimitPercent: row.soft_limit_percent, hardStopEnabled: row.hard_stop_enabled, graceCreditBuffer: row.grace_credit_buffer, storageLimitBytes: row.storage_limit_bytes, monthlyExportLimit: row.monthly_export_limit, featureFlags: parseFeatureFlags(row.feature_flags), status: row.status, updatedAt: toIso(row.updated_at) ?? new Date().toISOString() };
}

function toAdjustment(row: BillingAdjustmentRow): AdminBillingAdjustment {
  return { id: row.id, tenantId: row.tenant_id, kind: row.kind, creditDelta: row.credit_delta, expiresAt: toIso(row.expires_at), reason: row.reason, createdByUserId: row.created_by_user_id, createdAt: toIso(row.created_at) ?? new Date().toISOString() };
}

export function createPersistentBillingService(database: DatabaseClient, adminService: AdminService): BillingService {
  async function readPlan(tenantId: string) {
    const rows = await database<BillingPlanRow[]>`select id, tenant_id, name, monthly_credit_limit, soft_limit_percent, hard_stop_enabled, grace_credit_buffer, storage_limit_bytes, monthly_export_limit, feature_flags, status, updated_at from tenant_billing_plans where tenant_id = ${tenantId} limit 1`;
    return rows[0] ? toPlan(rows[0]) : null;
  }

  async function readAdjustments(tenantId: string) {
    const rows = await database<BillingAdjustmentRow[]>`select id, tenant_id, kind, credit_delta, expires_at, reason, created_by_user_id, created_at from tenant_billing_adjustments where tenant_id = ${tenantId} order by created_at desc`;
    return rows.map(toAdjustment);
  }

  async function readExportCount(tenantId: string) {
    const rows = await database<Array<{ count: number }>>`select count(*)::int as count from audit_events where tenant_id = ${tenantId} and action in ('admin.billing.exported', 'workspace.artifact.downloaded')`;
    return rows[0]?.count ?? 0;
  }

  return {
    async listBillingForUser(user, filters) {
      const memory = createBillingService(adminService);
      const seeded = await memory.listBillingForUser(user, filters);
      const tenants = await Promise.all(seeded.tenants.map(async tenant => {
        const persistedPlan = (await readPlan(tenant.tenantId)) ?? buildDefaultBillingPlan(tenant.tenantId);
        await memory.updateTenantPlanForUser(user, tenant.tenantId, persistedPlan);
        for (const adjustment of await readAdjustments(tenant.tenantId)) {
          await memory.createTenantAdjustmentForUser(user, tenant.tenantId, { kind: adjustment.kind, creditDelta: adjustment.creditDelta, expiresAt: adjustment.expiresAt, reason: adjustment.reason });
        }
        for (let index = 0; index < (await readExportCount(tenant.tenantId)); index += 1) {
          await memory.recordExportUsageForUser(user, { tenantId: tenant.tenantId, referenceType: 'audit', referenceId: null });
        }
        return (await memory.listBillingForUser(user, { tenantId: tenant.tenantId })).tenants[0]!;
      }));
      return { generatedAt: new Date().toISOString(), tenants, totals: { tenantCount: tenants.length, recordCount: tenants.reduce((total, tenant) => total + tenant.recentRecords.length, 0), totalCredits: tenants.reduce((total, tenant) => total + tenant.actualCreditsUsed, 0), totalEstimatedUsd: Number(tenants.reduce((total, tenant) => total + tenant.totalEstimatedUsd, 0).toFixed(2)), hardStopTenantCount: tenants.filter(tenant => tenant.plan.status === 'hard_stop').length } };
    },
    async getWorkspaceBillingForUser(user: AuthUser) {
      const data = await this.listBillingForUser(user, { tenantId: user.tenantId });
      const tenant = data.tenants[0]!;
      return { generatedAt: data.generatedAt, tenantId: tenant.tenantId, planName: tenant.plan.name, status: tenant.plan.status, actualCreditsUsed: tenant.actualCreditsUsed, effectiveCreditLimit: tenant.effectiveCreditLimit, remainingCredits: tenant.remainingCredits, storageBytesUsed: tenant.storageBytesUsed, storageLimitBytes: tenant.plan.storageLimitBytes, exportCount: tenant.exportCount, monthlyExportLimit: tenant.plan.monthlyExportLimit, warnings: tenant.warnings.map(item => ({ ...item, severity: item.code === 'hard_limit_reached' ? 'blocked' : item.severity })), actions: tenant.actions };
    },
    async updateTenantPlanForUser(user, tenantId, input: AdminBillingPlanUpdateRequest) {
      const memory = createBillingService(adminService);
      const result = await memory.updateTenantPlanForUser(user, tenantId, input);
      if (!result.ok) return result;
      const plan = result.data.plan;
      await database`insert into tenant_billing_plans (id, tenant_id, name, currency, monthly_credit_limit, soft_limit_percent, hard_stop_enabled, grace_credit_buffer, storage_limit_bytes, monthly_export_limit, feature_flags, status, updated_by_user_id, updated_at) values (${plan.id}, ${tenantId}, ${plan.name}, ${plan.currency}, ${plan.monthlyCreditLimit}, ${plan.softLimitPercent}, ${plan.hardStopEnabled}, ${plan.graceCreditBuffer}, ${plan.storageLimitBytes}, ${plan.monthlyExportLimit}, ${JSON.stringify(plan.featureFlags)}::jsonb, ${plan.status}, ${user.id}, ${plan.updatedAt}) on conflict (tenant_id) do update set name = excluded.name, currency = excluded.currency, monthly_credit_limit = excluded.monthly_credit_limit, soft_limit_percent = excluded.soft_limit_percent, hard_stop_enabled = excluded.hard_stop_enabled, grace_credit_buffer = excluded.grace_credit_buffer, storage_limit_bytes = excluded.storage_limit_bytes, monthly_export_limit = excluded.monthly_export_limit, feature_flags = excluded.feature_flags, status = excluded.status, updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at`;
      return result;
    },
    async createTenantAdjustmentForUser(user, tenantId, input: AdminBillingAdjustmentCreateRequest) {
      const memory = createBillingService(adminService);
      const result = await memory.createTenantAdjustmentForUser(user, tenantId, input);
      if (!result.ok) return result;
      const adjustment = result.data.adjustment;
      await database`insert into tenant_billing_adjustments (id, tenant_id, kind, credit_delta, expires_at, reason, created_by_user_id, created_at) values (${adjustment.id}, ${tenantId}, ${adjustment.kind}, ${adjustment.creditDelta}, ${adjustment.expiresAt}, ${adjustment.reason}, ${user.id}, ${adjustment.createdAt})`;
      return result;
    },
    async recordExportUsageForUser(user, input) {
      void user;
      void input;
    },
  };
}
