import type { AuthUser } from '@agentifui/shared/auth';
import type {
  QuotaUsage,
  WorkspaceApp,
  WorkspaceCatalog,
  WorkspaceGroup,
} from '@agentifui/shared/apps';

type WorkspaceAppFixture = WorkspaceApp & {
  sortOrder: number;
};

const WORKSPACE_GROUPS: WorkspaceGroup[] = [
  {
    id: 'grp_product',
    name: 'Product Studio',
    description: '负责产品体验、上线节奏和需求验证。',
  },
  {
    id: 'grp_research',
    name: 'Research Lab',
    description: '负责分析洞察、策略研究和知识整理。',
  },
  {
    id: 'grp_security',
    name: 'Security Office',
    description: '负责审计、安全策略与风险响应。',
  },
];

const WORKSPACE_APPS: WorkspaceAppFixture[] = [
  {
    id: 'app_market_brief',
    sortOrder: 10,
    slug: 'market-brief',
    name: 'Market Brief',
    summary: '汇总市场动态、竞品观察和本周风险变化。',
    kind: 'analysis',
    status: 'ready',
    shortCode: 'MB',
    tags: ['research', 'daily'],
    grantedGroupIds: ['grp_product', 'grp_research'],
    launchCost: 40,
  },
  {
    id: 'app_service_copilot',
    sortOrder: 20,
    slug: 'service-copilot',
    name: 'Service Copilot',
    summary: '处理高频客户问答、知识库召回和服务摘要。',
    kind: 'chat',
    status: 'ready',
    shortCode: 'SC',
    tags: ['support', 'knowledge-base'],
    grantedGroupIds: ['grp_product'],
    launchCost: 18,
  },
  {
    id: 'app_release_radar',
    sortOrder: 30,
    slug: 'release-radar',
    name: 'Release Radar',
    summary: '核对上线清单、变更风险和发布审批状态。',
    kind: 'governance',
    status: 'beta',
    shortCode: 'RR',
    tags: ['release', 'governance'],
    grantedGroupIds: ['grp_product'],
    launchCost: 90,
  },
  {
    id: 'app_policy_watch',
    sortOrder: 40,
    slug: 'policy-watch',
    name: 'Policy Watch',
    summary: '跟踪政策变化、合规要求和影响说明。',
    kind: 'governance',
    status: 'ready',
    shortCode: 'PW',
    tags: ['policy', 'compliance'],
    grantedGroupIds: ['grp_research'],
    launchCost: 25,
  },
  {
    id: 'app_runbook_mentor',
    sortOrder: 50,
    slug: 'runbook-mentor',
    name: 'Runbook Mentor',
    summary: '把 SOP 转成可执行步骤，帮助团队完成标准化交付。',
    kind: 'automation',
    status: 'ready',
    shortCode: 'RM',
    tags: ['ops', 'automation'],
    grantedGroupIds: ['grp_product', 'grp_research'],
    launchCost: 22,
  },
  {
    id: 'app_audit_lens',
    sortOrder: 60,
    slug: 'audit-lens',
    name: 'Audit Lens',
    summary: '安全团队专用的审计与告警排查工具。',
    kind: 'governance',
    status: 'beta',
    shortCode: 'AL',
    tags: ['security', 'audit'],
    grantedGroupIds: ['grp_security'],
    launchCost: 30,
  },
];

function resolveDefaultMemberGroupIds(email: string): string[] {
  const normalizedEmail = email.toLowerCase();

  if (normalizedEmail.startsWith('security') || normalizedEmail.includes('audit')) {
    return ['grp_security'];
  }

  return ['grp_product', 'grp_research'];
}

function buildTenantQuota(user: AuthUser): QuotaUsage {
  return {
    scope: 'tenant',
    scopeId: user.tenantId,
    scopeLabel: 'Tenant monthly quota',
    used: 820,
    limit: 1000,
  };
}

function buildUserQuota(user: AuthUser): QuotaUsage {
  return {
    scope: 'user',
    scopeId: user.id,
    scopeLabel: 'Your monthly quota',
    used: 610,
    limit: 1000,
  };
}

function buildGroupQuota(groupId: string): QuotaUsage {
  if (groupId === 'grp_research') {
    return {
      scope: 'group',
      scopeId: groupId,
      scopeLabel: 'Research Lab quota',
      used: 760,
      limit: 1000,
    };
  }

  if (groupId === 'grp_security') {
    return {
      scope: 'group',
      scopeId: groupId,
      scopeLabel: 'Security Office quota',
      used: 540,
      limit: 1000,
    };
  }

  return {
    scope: 'group',
    scopeId: groupId,
    scopeLabel: 'Product Studio quota',
    used: 930,
    limit: 1000,
  };
}

function buildWorkspaceCatalog(
  user: AuthUser,
  input: {
    apps: WorkspaceApp[];
    groups: WorkspaceGroup[];
    memberGroupIds: string[];
  }
): WorkspaceCatalog {
  const defaultActiveGroupId = input.memberGroupIds[0]!;
  const tenantQuota = buildTenantQuota(user);
  const userQuota = buildUserQuota(user);

  return {
    groups: input.groups,
    memberGroupIds: input.memberGroupIds,
    defaultActiveGroupId,
    apps: input.apps,
    quotaServiceState: 'available',
    quotaUsagesByGroupId: Object.fromEntries(
      input.memberGroupIds.map(groupId => [groupId, [tenantQuota, buildGroupQuota(groupId), userQuota]])
    ),
    generatedAt: new Date().toISOString(),
  };
}

export {
  WORKSPACE_APPS,
  WORKSPACE_GROUPS,
  buildWorkspaceCatalog,
  resolveDefaultMemberGroupIds,
};
