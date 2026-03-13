import type { AuthUser } from '@agentifui/shared/auth';
import type { QuotaScope, QuotaUsage } from '@agentifui/shared/apps';

const WORKSPACE_QUOTA_TOKENS_PER_CREDIT = 25;

type WorkspaceQuotaLimitRecord = {
  scope: QuotaScope;
  scopeId: string;
  scopeLabel: string;
  limit: number;
  baseUsed: number;
};

type WorkspaceQuotaUsageTotals = {
  tenant: number;
  user: number;
  groupsById: Record<string, number>;
};

function buildGroupQuotaSeed(groupId: string): WorkspaceQuotaLimitRecord {
  if (groupId === 'grp_research' || groupId.includes('grp_research')) {
    return {
      scope: 'group',
      scopeId: groupId,
      scopeLabel: 'Research Lab quota',
      limit: 1000,
      baseUsed: 760,
    };
  }

  if (groupId === 'grp_security' || groupId.includes('grp_security')) {
    return {
      scope: 'group',
      scopeId: groupId,
      scopeLabel: 'Security Office quota',
      limit: 1000,
      baseUsed: 540,
    };
  }

  return {
    scope: 'group',
    scopeId: groupId,
    scopeLabel: 'Product Studio quota',
    limit: 1000,
    baseUsed: 930,
  };
}

export function buildDefaultQuotaLimitRecords(
  user: AuthUser,
  memberGroupIds: string[]
): WorkspaceQuotaLimitRecord[] {
  return [
    {
      scope: 'tenant',
      scopeId: user.tenantId,
      scopeLabel: 'Tenant monthly quota',
      limit: 1000,
      baseUsed: 820,
    },
    ...memberGroupIds.map(groupId => buildGroupQuotaSeed(groupId)),
    {
      scope: 'user',
      scopeId: user.id,
      scopeLabel: 'Your monthly quota',
      limit: 1000,
      baseUsed: 610,
    },
  ];
}

export function calculateCompletionQuotaCost(totalTokens: number) {
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(totalTokens / WORKSPACE_QUOTA_TOKENS_PER_CREDIT));
}

export function buildQuotaUsagesByGroupId(input: {
  memberGroupIds: string[];
  quotaLimits: WorkspaceQuotaLimitRecord[];
  usageTotals: WorkspaceQuotaUsageTotals;
}): Record<string, QuotaUsage[]> {
  const limitByScopeKey = new Map(
    input.quotaLimits.map(limit => [`${limit.scope}:${limit.scopeId}`, limit] as const)
  );
  const tenantLimit = limitByScopeKey.get(`tenant:${input.quotaLimits.find(limit => limit.scope === 'tenant')?.scopeId ?? ''}`);

  return Object.fromEntries(
    input.memberGroupIds.map(groupId => {
      const groupLimit = limitByScopeKey.get(`group:${groupId}`);
      const userLimit = input.quotaLimits.find(limit => limit.scope === 'user');
      const usages: QuotaUsage[] = [];

      if (tenantLimit) {
        usages.push({
          scope: 'tenant',
          scopeId: tenantLimit.scopeId,
          scopeLabel: tenantLimit.scopeLabel,
          used: tenantLimit.baseUsed + input.usageTotals.tenant,
          limit: tenantLimit.limit,
        });
      }

      if (groupLimit) {
        usages.push({
          scope: 'group',
          scopeId: groupLimit.scopeId,
          scopeLabel: groupLimit.scopeLabel,
          used: groupLimit.baseUsed + (input.usageTotals.groupsById[groupId] ?? 0),
          limit: groupLimit.limit,
        });
      }

      if (userLimit) {
        usages.push({
          scope: 'user',
          scopeId: userLimit.scopeId,
          scopeLabel: userLimit.scopeLabel,
          used: userLimit.baseUsed + input.usageTotals.user,
          limit: userLimit.limit,
        });
      }

      return [groupId, usages];
    })
  );
}

export type { WorkspaceQuotaLimitRecord, WorkspaceQuotaUsageTotals };
