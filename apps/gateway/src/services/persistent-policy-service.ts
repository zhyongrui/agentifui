import { randomUUID } from 'node:crypto';

import type { DatabaseClient } from '@agentifui/db';
import type {
  AdminPolicyDetectorMatch,
  AdminPolicyEvaluationTrace,
  AdminPolicyException,
  AdminPolicyExceptionCreateRequest,
  AdminPolicyExceptionReviewRequest,
  AdminTenantGovernanceSettings,
} from '@agentifui/shared/admin';
import type { AuthUser } from '@agentifui/shared/auth';

import type { AdminMutationResult, AdminService } from './admin-service.js';
import { evaluatePolicy } from './policy-engine.js';
import type { EvaluatePolicyInput, PolicyService } from './policy-service.js';

type PolicyExceptionRow = {
  created_at: Date | string;
  created_by_user_id: string | null;
  detector: AdminPolicyException['detector'];
  expires_at: Date | string | null;
  id: string;
  label: string;
  review_history: Array<{
    actorUserId?: string | null;
    note?: string | null;
    occurredAt?: string | null;
  }> | string;
  scope: AdminPolicyException['scope'];
  scope_id: string | null;
  tenant_id: string;
};

type PolicyEvaluationRow = {
  created_at: Date | string;
  detector_matches: AdminPolicyDetectorMatch[] | string;
  exception_ids: string[] | string;
  id: string;
  outcome: AdminPolicyEvaluationTrace['outcome'];
  reasons: string[] | string;
  scope: AdminPolicyEvaluationTrace['scope'];
  tenant_id: string;
};

function buildDefaultGovernance(tenantId: string): AdminTenantGovernanceSettings {
  return {
    tenantId,
    legalHoldEnabled: false,
    retentionOverrideDays: null,
    scimPlanning: {
      enabled: false,
      ownerEmail: null,
      notes: null,
    },
    policyPack: {
      runtimeMode: 'standard',
      retrievalMode: 'allowed',
      sharingMode: 'editor',
      artifactDownloadMode: 'shared_readers',
      exportMode: 'allowed',
      retentionMode: 'standard',
    },
  };
}

function normalizeTenantId(user: AuthUser, tenantId?: string | null) {
  return tenantId?.trim() || user.tenantId;
}

function toIso(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeJsonArray<T>(value: T[] | string | null | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function resolveGovernance(
  adminService: AdminService,
  user: AuthUser,
  tenantId: string
) {
  const overview = await adminService.getIdentityOverviewForUser(user, {
    tenantId,
  });

  return overview.governance ?? buildDefaultGovernance(tenantId);
}

function toException(row: PolicyExceptionRow): AdminPolicyException {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    scope: row.scope,
    scopeId: row.scope_id,
    detector: row.detector,
    label: row.label,
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    createdByUserId: row.created_by_user_id,
    reviewHistory: normalizeJsonArray<{
      actorUserId?: string | null;
      note?: string | null;
      occurredAt?: string | null;
    }>(row.review_history).map(entry => ({
      occurredAt: entry.occurredAt ?? new Date().toISOString(),
      actorUserId: entry.actorUserId ?? null,
      note: entry.note ?? null,
    })),
  };
}

function toEvaluation(row: PolicyEvaluationRow): AdminPolicyEvaluationTrace {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    scope: row.scope,
    outcome: row.outcome,
    reasons: normalizeJsonArray<string>(row.reasons),
    detectorMatches: normalizeJsonArray<AdminPolicyDetectorMatch>(row.detector_matches),
    exceptionIds: normalizeJsonArray<string>(row.exception_ids),
    occurredAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

export function createPersistentPolicyService(
  database: DatabaseClient,
  adminService: AdminService
): PolicyService {
  return {
    async getOverviewForUser(user, input) {
      const tenantId = normalizeTenantId(user, input?.tenantId);
      const [exceptions, recentEvaluations, governance] = await Promise.all([
        database<PolicyExceptionRow[]>`
          select id, tenant_id, scope, scope_id, detector, label, expires_at, review_history, created_by_user_id, created_at
          from tenant_policy_exceptions
          where tenant_id = ${tenantId}
          order by created_at desc
        `,
        database<PolicyEvaluationRow[]>`
          select id, tenant_id, scope, outcome, reasons, detector_matches, exception_ids, created_at
          from tenant_policy_evaluations
          where tenant_id = ${tenantId}
          order by created_at desc
          limit 25
        `,
        resolveGovernance(adminService, user, tenantId),
      ]);

      return {
        governance,
        exceptions: exceptions.map(toException),
        recentEvaluations: recentEvaluations.map(toEvaluation),
      };
    },
    async evaluateForUser(user, input) {
      const tenantId = normalizeTenantId(user, input.tenantId);
      const [governance, exceptionRows] = await Promise.all([
        resolveGovernance(adminService, user, tenantId),
        database<PolicyExceptionRow[]>`
          select id, tenant_id, scope, scope_id, detector, label, expires_at, review_history, created_by_user_id, created_at
          from tenant_policy_exceptions
          where tenant_id = ${tenantId}
          order by created_at desc
        `,
      ]);
      const evaluation = evaluatePolicy({
        governance,
        scope: input.scope,
        content: input.content,
        groupId: input.groupId,
        appId: input.appId,
        runtimeId: input.runtimeId,
        exceptions: exceptionRows.map(toException),
      });
      const trace: AdminPolicyEvaluationTrace = {
        id: `pol_eval_${randomUUID()}`,
        tenantId,
        scope: input.scope,
        outcome: evaluation.outcome,
        reasons: evaluation.reasons,
        detectorMatches: evaluation.detectorMatches,
        exceptionIds: evaluation.exceptionIds,
        occurredAt: new Date().toISOString(),
      };

      if (input.persist !== false) {
        await database`
          insert into tenant_policy_evaluations (
            id,
            tenant_id,
            scope,
            outcome,
            reasons,
            detector_matches,
            exception_ids,
            trace_id,
            run_id,
            conversation_id,
            created_at
          )
          values (
            ${trace.id},
            ${tenantId},
            ${trace.scope},
            ${trace.outcome},
            ${JSON.stringify(trace.reasons)}::jsonb,
            ${JSON.stringify(trace.detectorMatches)}::jsonb,
            ${JSON.stringify(trace.exceptionIds)}::jsonb,
            ${input.traceId ?? null},
            ${input.runId ?? null},
            ${input.conversationId ?? null},
            ${trace.occurredAt}::timestamptz
          )
        `;
      }

      return trace;
    },
    async createExceptionForUser(user, input) {
      const tenantId = normalizeTenantId(user, input.tenantId);
      const label = input.label.trim();

      if (!label) {
        return {
          ok: false,
          statusCode: 400,
          code: 'ADMIN_INVALID_PAYLOAD',
          message: 'Policy exceptions require a label.',
        };
      }

      const exception: AdminPolicyException = {
        id: `pol_exc_${randomUUID()}`,
        tenantId,
        scope: input.scope,
        scopeId: input.scopeId?.trim() || null,
        detector: input.detector,
        label,
        expiresAt: input.expiresAt?.trim() || null,
        createdAt: new Date().toISOString(),
        createdByUserId: user.id,
        reviewHistory: input.note?.trim()
          ? [
              {
                occurredAt: new Date().toISOString(),
                actorUserId: user.id,
                note: input.note.trim(),
              },
            ]
          : [],
      };

      await database`
        insert into tenant_policy_exceptions (
          id,
          tenant_id,
          scope,
          scope_id,
          detector,
          label,
          expires_at,
          review_history,
          created_by_user_id,
          created_at
        )
        values (
          ${exception.id},
          ${tenantId},
          ${exception.scope},
          ${exception.scopeId},
          ${exception.detector},
          ${exception.label},
          ${exception.expiresAt}::timestamptz,
          ${JSON.stringify(exception.reviewHistory)}::jsonb,
          ${user.id},
          ${exception.createdAt}::timestamptz
        )
      `;

      return {
        ok: true,
        data: {
          exception,
        },
      };
    },
    async reviewExceptionForUser(user, exceptionId, input) {
      const rows = await database<PolicyExceptionRow[]>`
        select id, tenant_id, scope, scope_id, detector, label, expires_at, review_history, created_by_user_id, created_at
        from tenant_policy_exceptions
        where id = ${exceptionId}
        limit 1
      `;
      const current = rows[0];

      if (!current) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'Policy exception was not found.',
        };
      }

      const next = {
        ...toException(current),
        expiresAt: input.expiresAt === undefined ? toIso(current.expires_at) : input.expiresAt?.trim() || null,
        reviewHistory: [
          ...toException(current).reviewHistory,
          {
            occurredAt: new Date().toISOString(),
            actorUserId: user.id,
            note: input.note?.trim() || null,
          },
        ],
      };

      await database`
        update tenant_policy_exceptions
        set expires_at = ${next.expiresAt}::timestamptz,
            review_history = ${JSON.stringify(next.reviewHistory)}::jsonb
        where id = ${exceptionId}
      `;

      return {
        ok: true,
        data: {
          exception: next,
        },
      };
    },
  };
}
