import { randomUUID } from 'node:crypto';

import type {
  AdminPolicyEvaluationTrace,
  AdminPolicyException,
  AdminPolicyExceptionCreateRequest,
  AdminPolicyExceptionReviewRequest,
  AdminPolicyPackSimulationScope,
  AdminTenantGovernanceSettings,
} from '@agentifui/shared/admin';
import type { AuthUser } from '@agentifui/shared/auth';

import type { AdminMutationResult, AdminService } from './admin-service.js';
import { evaluatePolicy } from './policy-engine.js';

type PolicyOverviewInput = {
  tenantId?: string | null;
};

type EvaluatePolicyInput = {
  appId?: string | null;
  content: string;
  conversationId?: string | null;
  groupId?: string | null;
  persist?: boolean;
  runId?: string | null;
  runtimeId?: string | null;
  scope: AdminPolicyPackSimulationScope;
  tenantId?: string | null;
  traceId?: string | null;
};

export type PolicyService = {
  createExceptionForUser(
    user: AuthUser,
    input: AdminPolicyExceptionCreateRequest
  ): Promise<AdminMutationResult<{ exception: AdminPolicyException }>> | AdminMutationResult<{
    exception: AdminPolicyException;
  }>;
  evaluateForUser(
    user: AuthUser,
    input: EvaluatePolicyInput
  ): Promise<AdminPolicyEvaluationTrace> | AdminPolicyEvaluationTrace;
  getOverviewForUser(
    user: AuthUser,
    input?: PolicyOverviewInput
  ): Promise<{
    exceptions: AdminPolicyException[];
    governance: AdminTenantGovernanceSettings | null;
    recentEvaluations: AdminPolicyEvaluationTrace[];
  }> | {
    exceptions: AdminPolicyException[];
    governance: AdminTenantGovernanceSettings | null;
    recentEvaluations: AdminPolicyEvaluationTrace[];
  };
  reviewExceptionForUser(
    user: AuthUser,
    exceptionId: string,
    input: AdminPolicyExceptionReviewRequest
  ): Promise<AdminMutationResult<{ exception: AdminPolicyException }>> | AdminMutationResult<{
    exception: AdminPolicyException;
  }>;
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

async function resolveGovernance(
  adminService: AdminService,
  user: AuthUser,
  tenantId: string
): Promise<AdminTenantGovernanceSettings> {
  const overview = await adminService.getIdentityOverviewForUser(user, {
    tenantId,
  });

  return overview.governance ?? buildDefaultGovernance(tenantId);
}

function toTrace(
  input: EvaluatePolicyInput,
  tenantId: string,
  evaluation: ReturnType<typeof evaluatePolicy>
): AdminPolicyEvaluationTrace {
  void input.traceId;
  void input.runId;
  void input.conversationId;

  return {
    id: `pol_eval_${randomUUID()}`,
    tenantId,
    scope: input.scope,
    outcome: evaluation.outcome,
    reasons: evaluation.reasons,
    detectorMatches: evaluation.detectorMatches,
    exceptionIds: evaluation.exceptionIds,
    occurredAt: new Date().toISOString(),
  };
}

export function createPolicyService(adminService: AdminService): PolicyService {
  const exceptions: AdminPolicyException[] = [];
  const evaluations: AdminPolicyEvaluationTrace[] = [];

  return {
    async getOverviewForUser(user, input) {
      const tenantId = normalizeTenantId(user, input?.tenantId);

      return {
        governance: await resolveGovernance(adminService, user, tenantId),
        exceptions: exceptions
          .filter(exception => exception.tenantId === tenantId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        recentEvaluations: evaluations
          .filter(evaluation => evaluation.tenantId === tenantId)
          .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
          .slice(0, 25),
      };
    },
    async evaluateForUser(user, input) {
      const tenantId = normalizeTenantId(user, input.tenantId);
      const governance = await resolveGovernance(adminService, user, tenantId);
      const activeExceptions = exceptions.filter(exception => exception.tenantId === tenantId);
      const evaluation = evaluatePolicy({
        governance,
        scope: input.scope,
        content: input.content,
        groupId: input.groupId,
        appId: input.appId,
        runtimeId: input.runtimeId,
        exceptions: activeExceptions,
      });
      const trace = toTrace(input, tenantId, evaluation);

      if (input.persist !== false) {
        evaluations.unshift(trace);
      }

      return trace;
    },
    createExceptionForUser(user, input) {
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

      exceptions.unshift(exception);

      return {
        ok: true,
        data: {
          exception,
        },
      };
    },
    reviewExceptionForUser(user, exceptionId, input) {
      const index = exceptions.findIndex(exception => exception.id === exceptionId);

      if (index === -1) {
        return {
          ok: false,
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
          message: 'Policy exception was not found.',
        };
      }

      const current = exceptions[index]!;
      const next: AdminPolicyException = {
        ...current,
        expiresAt: input.expiresAt === undefined ? current.expiresAt : input.expiresAt?.trim() || null,
        reviewHistory: [
          ...current.reviewHistory,
          {
            occurredAt: new Date().toISOString(),
            actorUserId: user.id,
            note: input.note?.trim() || null,
          },
        ],
      };

      exceptions.splice(index, 1, next);

      return {
        ok: true,
        data: {
          exception: next,
        },
      };
    },
  };
}

export type { EvaluatePolicyInput };
