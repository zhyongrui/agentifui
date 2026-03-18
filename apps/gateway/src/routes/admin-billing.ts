import type {
  AdminBillingAdjustmentCreateRequest,
  AdminBillingAdjustmentCreateResponse,
  AdminBillingExportFormat,
  AdminBillingExportJsonBundle,
  AdminBillingExportMetadata,
  AdminBillingPlanUpdateRequest,
  AdminBillingPlanUpdateResponse,
  AdminBillingResponse,
  AdminErrorResponse,
} from '@agentifui/shared/admin';
import type { FastifyInstance } from 'fastify';

import type { AdminService } from '../services/admin-service.js';
import type { AuditService } from '../services/audit-service.js';
import type { AuthService } from '../services/auth-service.js';
import type { BillingService } from '../services/billing-service.js';
import type { PolicyService } from '../services/policy-service.js';

function buildErrorResponse(code: AdminErrorResponse['error']['code'], message: string, details?: unknown): AdminErrorResponse {
  return { ok: false, error: { code, message, details } };
}

function readBearerToken(value: string | undefined): string | null {
  if (!value) return null;
  const [scheme, token] = value.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

function toCsvCell(value: string | number | null) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function buildCsv(bundle: AdminBillingExportJsonBundle) {
  const header = [
    'row_type',
    'tenant_id',
    'tenant_name',
    'plan_name',
    'status',
    'breakdown_scope',
    'breakdown_key',
    'breakdown_label',
    'action',
    'adjustment_kind',
    'quantity',
    'credits',
    'estimated_usd',
    'launch_count',
    'run_count',
    'retrieval_count',
    'storage_bytes',
    'export_count',
    'detail',
  ];
  const rows = bundle.tenants.flatMap(tenant => {
    const summaryRow = [
      'tenant_summary',
      tenant.tenantId,
      tenant.tenantName,
      tenant.plan.name,
      tenant.plan.status,
      null,
      null,
      null,
      null,
      null,
      null,
      tenant.actualCreditsUsed,
      tenant.totalEstimatedUsd,
      null,
      null,
      null,
      tenant.storageBytesUsed,
      tenant.exportCount,
      tenant.warnings.map(item => item.code).join('; '),
    ];
    const actionRows = tenant.actions.map(action => [
      'action',
      tenant.tenantId,
      tenant.tenantName,
      tenant.plan.name,
      tenant.plan.status,
      null,
      null,
      null,
      action.action,
      null,
      action.quantity,
      action.credits,
      action.estimatedUsd,
      null,
      null,
      null,
      null,
      null,
      action.unit,
    ]);
    const adjustmentRows = tenant.adjustments.map(adjustment => [
      'adjustment',
      tenant.tenantId,
      tenant.tenantName,
      tenant.plan.name,
      tenant.plan.status,
      null,
      null,
      null,
      null,
      adjustment.kind,
      null,
      adjustment.creditDelta,
      null,
      null,
      null,
      null,
      null,
      null,
      adjustment.reason,
    ]);
    const breakdownRows = [
      ...tenant.breakdowns.apps,
      ...tenant.breakdowns.groups,
      ...tenant.breakdowns.providers,
    ].map(entry => [
      'breakdown',
      tenant.tenantId,
      tenant.tenantName,
      tenant.plan.name,
      tenant.plan.status,
      entry.scope,
      entry.key,
      entry.label,
      null,
      null,
      null,
      entry.credits,
      entry.estimatedUsd,
      entry.launchCount,
      entry.runCount,
      entry.retrievalCount,
      entry.storageBytes,
      entry.exportCount,
      null,
    ]);

    return [summaryRow, ...actionRows, ...adjustmentRows, ...breakdownRows]
      .map(row => row.map(value => toCsvCell(value)).join(','));
  });
  return [header.map(toCsvCell).join(','), ...rows].join('\n');
}

function buildExportMetadata(format: AdminBillingExportFormat, tenantCount: number): AdminBillingExportMetadata {
  const exportedAt = new Date().toISOString();
  return { format, filename: `admin-billing-${exportedAt.replace(/[:.]/g, '-')}.${format}`, exportedAt, tenantCount };
}

async function requireAdminSession(authService: AuthService, adminService: AdminService, authorization: string | undefined) {
  const sessionToken = readBearerToken(authorization);
  if (!sessionToken) return { ok: false as const, statusCode: 401 as const, response: buildErrorResponse('ADMIN_UNAUTHORIZED', 'Admin access requires a bearer session.') };
  const user = await authService.getUserBySessionToken(sessionToken);
  if (!user) return { ok: false as const, statusCode: 401 as const, response: buildErrorResponse('ADMIN_UNAUTHORIZED', 'The admin session is invalid or expired.') };
  if (!(await adminService.canReadAdminForUser(user))) return { ok: false as const, statusCode: 403 as const, response: buildErrorResponse('ADMIN_FORBIDDEN', 'This user cannot access billing controls.') };
  return { ok: true as const, user };
}

export async function registerAdminBillingRoutes(app: FastifyInstance, authService: AuthService, adminService: AdminService, billingService: BillingService, auditService: AuditService, policyService: PolicyService) {
  app.get('/admin/billing', async (request, reply): Promise<AdminBillingResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);
    if (!session.ok) { reply.code(session.statusCode); return session.response; }
    const query = (request.query ?? {}) as { tenantId?: string; search?: string };
    return { ok: true, data: await billingService.listBillingForUser(session.user, { tenantId: query.tenantId ?? null, search: query.search ?? null }) };
  });

  app.put('/admin/billing/tenants/:tenantId/plan', async (request, reply): Promise<AdminBillingPlanUpdateResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);
    if (!session.ok) { reply.code(session.statusCode); return session.response; }
    const tenantId = ((request.params ?? {}) as { tenantId?: string }).tenantId?.trim();
    const body = (request.body ?? {}) as Partial<AdminBillingPlanUpdateRequest>;
    if (!tenantId) { reply.code(400); return buildErrorResponse('ADMIN_INVALID_PAYLOAD', 'tenantId is required.'); }
    const result = await billingService.updateTenantPlanForUser(session.user, tenantId, body);
    if (!result.ok) { reply.code(result.statusCode); return buildErrorResponse(result.code, result.message, result.details); }
    await auditService.recordEvent({ tenantId, actorUserId: session.user.id, action: 'admin.billing.plan_updated', entityType: 'billing_plan', entityId: result.data.plan.id, ipAddress: request.ip, payload: { tenantId, plan: result.data.plan } });
    return { ok: true, data: result.data };
  });

  app.post('/admin/billing/tenants/:tenantId/adjustments', async (request, reply): Promise<AdminBillingAdjustmentCreateResponse | AdminErrorResponse> => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);
    if (!session.ok) { reply.code(session.statusCode); return session.response; }
    const tenantId = ((request.params ?? {}) as { tenantId?: string }).tenantId?.trim();
    const body = (request.body ?? {}) as Partial<AdminBillingAdjustmentCreateRequest>;
    if (!tenantId || typeof body.kind !== 'string' || typeof body.creditDelta !== 'number') { reply.code(400); return buildErrorResponse('ADMIN_INVALID_PAYLOAD', 'tenantId, kind, and creditDelta are required.'); }
    const result = await billingService.createTenantAdjustmentForUser(session.user, tenantId, body as AdminBillingAdjustmentCreateRequest);
    if (!result.ok) { reply.code(result.statusCode); return buildErrorResponse(result.code, result.message, result.details); }
    await auditService.recordEvent({ tenantId, actorUserId: session.user.id, action: 'admin.billing.adjustment_created', entityType: 'billing_adjustment', entityId: result.data.adjustment.id, ipAddress: request.ip, payload: { tenantId, adjustment: result.data.adjustment } });
    return { ok: true, data: result.data };
  });

  app.get('/admin/billing/export', async (request, reply) => {
    const session = await requireAdminSession(authService, adminService, request.headers.authorization);
    if (!session.ok) { reply.code(session.statusCode); return session.response; }
    const query = (request.query ?? {}) as { format?: AdminBillingExportFormat; tenantId?: string; search?: string };
    const format = query.format === 'csv' || query.format === 'json' ? query.format : 'json';
    const exportPolicy = await policyService.evaluateForUser(session.user, {
      tenantId: query.tenantId ?? session.user.tenantId,
      scope: 'export',
      content: JSON.stringify({
        resource: '/admin/billing/export',
        format,
        tenantId: query.tenantId ?? null,
        search: query.search ?? null,
      }),
    });
    if (exportPolicy.outcome !== 'allowed') {
      reply.code(403);
      return buildErrorResponse(
        'ADMIN_FORBIDDEN',
        exportPolicy.reasons[0] ?? 'Billing exports are blocked by the current tenant policy pack.',
        {
          evaluation: exportPolicy,
        }
      );
    }
    const data = await billingService.listBillingForUser(session.user, { tenantId: query.tenantId ?? null, search: query.search ?? null });
    const metadata = buildExportMetadata(format, data.tenants.length);
    const bundle: AdminBillingExportJsonBundle = { metadata, generatedAt: data.generatedAt, tenants: data.tenants, totals: data.totals };
    await billingService.recordExportUsageForUser(session.user, { referenceType: 'admin_billing_export', referenceId: null });
    await auditService.recordEvent({ tenantId: session.user.tenantId, actorUserId: session.user.id, action: 'admin.billing.exported', entityType: 'tenant', entityId: query.tenantId ?? session.user.tenantId, ipAddress: request.ip, payload: { format, tenantCount: data.tenants.length } });
    reply.header('x-agentifui-export-format', format);
    reply.header('x-agentifui-export-filename', metadata.filename);
    reply.header('x-agentifui-exported-at', metadata.exportedAt);
    reply.header('x-agentifui-export-count', String(data.tenants.length));
    reply.header('content-disposition', `attachment; filename="${metadata.filename}"`);
    if (format === 'csv') {
      reply.header('content-type', 'text/csv; charset=utf-8');
      return buildCsv(bundle);
    }
    return bundle;
  });
}
