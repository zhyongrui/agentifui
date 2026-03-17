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
  const header = ['tenant_id', 'tenant_name', 'plan_name', 'status', 'actual_credits_used', 'effective_credit_limit', 'remaining_credits', 'total_estimated_usd', 'storage_bytes_used', 'export_count', 'warnings'];
  const rows = bundle.tenants.map(tenant => [tenant.tenantId, tenant.tenantName, tenant.plan.name, tenant.plan.status, tenant.actualCreditsUsed, tenant.effectiveCreditLimit, tenant.remainingCredits, tenant.totalEstimatedUsd, tenant.storageBytesUsed, tenant.exportCount, tenant.warnings.map(item => item.code).join('; ')].map(toCsvCell).join(','));
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

export async function registerAdminBillingRoutes(app: FastifyInstance, authService: AuthService, adminService: AdminService, billingService: BillingService, auditService: AuditService) {
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
