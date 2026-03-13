import type { AuthUser } from '@agentifui/shared/auth';
import type {
  QuotaServiceState,
  QuotaUsage,
  WorkspaceApp,
  WorkspaceCatalog,
  WorkspaceGroup,
  WorkspacePreferences,
} from '@agentifui/shared/apps';

import {
  buildDefaultQuotaLimitRecords,
  buildQuotaUsagesByGroupId,
} from './workspace-quota.js';

type WorkspaceRoleSeed = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  scope: 'platform' | 'tenant' | 'group' | 'user';
  isSystem: boolean;
};

type WorkspaceAppFixture = WorkspaceApp & {
  grantedRoleIds: string[];
  sortOrder: number;
};

const WORKSPACE_ROLES: WorkspaceRoleSeed[] = [
  {
    id: 'root_admin',
    name: 'root_admin',
    displayName: 'Root Admin',
    description: '平台级紧急运维角色，默认不分配。',
    scope: 'platform',
    isSystem: true,
  },
  {
    id: 'tenant_admin',
    name: 'tenant_admin',
    displayName: 'Tenant Admin',
    description: '租户治理和授权配置角色。',
    scope: 'tenant',
    isSystem: true,
  },
  {
    id: 'user',
    name: 'user',
    displayName: 'User',
    description: '默认普通使用者角色。',
    scope: 'user',
    isSystem: true,
  },
];

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
    grantedRoleIds: [],
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
    grantedRoleIds: [],
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
    grantedRoleIds: [],
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
    grantedRoleIds: [],
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
    grantedRoleIds: [],
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
    grantedRoleIds: [],
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
  {
    id: 'app_tenant_control',
    grantedRoleIds: ['tenant_admin'],
    sortOrder: 70,
    slug: 'tenant-control',
    name: 'Tenant Control',
    summary: '租户管理员使用的授权与配置控制台入口。',
    kind: 'governance',
    status: 'beta',
    shortCode: 'TC',
    tags: ['admin', 'rbac'],
    grantedGroupIds: [],
    launchCost: 12,
  },
];

function resolveDefaultMemberGroupIds(email: string): string[] {
  const normalizedEmail = email.toLowerCase();

  if (normalizedEmail.startsWith('security') || normalizedEmail.includes('audit')) {
    return ['grp_security'];
  }

  return ['grp_product', 'grp_research'];
}

function resolveDefaultRoleIds(email: string): string[] {
  const normalizedEmail = email.toLowerCase();

  if (normalizedEmail.startsWith('root') || normalizedEmail.includes('platform-admin')) {
    return ['root_admin', 'tenant_admin', 'user'];
  }

  if (normalizedEmail.startsWith('admin') || normalizedEmail.includes('owner')) {
    return ['tenant_admin', 'user'];
  }

  return ['user'];
}

function toWorkspaceAppFixture(
  app: WorkspaceAppFixture,
  memberGroupIds: string[]
): WorkspaceApp {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    summary: app.summary,
    kind: app.kind,
    status: app.status,
    shortCode: app.shortCode,
    tags: app.tags,
    grantedGroupIds: app.grantedGroupIds.length > 0 ? app.grantedGroupIds : memberGroupIds,
    launchCost: app.launchCost,
  };
}

function resolveSeededWorkspaceAppsForUser(user: AuthUser): WorkspaceApp[] {
  const memberGroupIds = resolveDefaultMemberGroupIds(user.email);
  const roleIds = resolveDefaultRoleIds(user.email);

  return WORKSPACE_APPS.filter(app => {
    if (app.grantedGroupIds.some(groupId => memberGroupIds.includes(groupId))) {
      return true;
    }

    return app.grantedRoleIds.some(roleId => roleIds.includes(roleId));
  }).map(app => toWorkspaceAppFixture(app, memberGroupIds));
}

function buildWorkspaceCatalog(
  user: AuthUser,
  input: {
    apps: WorkspaceApp[];
    groups: WorkspaceGroup[];
    memberGroupIds: string[];
    preferences?: Pick<
      WorkspacePreferences,
      'favoriteAppIds' | 'recentAppIds' | 'defaultActiveGroupId'
    >;
    quotaServiceState?: QuotaServiceState;
    quotaUsagesByGroupId?: Record<string, QuotaUsage[]>;
  }
): WorkspaceCatalog {
  const fallbackActiveGroupId = input.memberGroupIds[0]!;
  const defaultActiveGroupId =
    input.preferences?.defaultActiveGroupId &&
    input.memberGroupIds.includes(input.preferences.defaultActiveGroupId)
      ? input.preferences.defaultActiveGroupId
      : fallbackActiveGroupId;

  return {
    groups: input.groups,
    memberGroupIds: input.memberGroupIds,
    defaultActiveGroupId,
    apps: input.apps,
    favoriteAppIds: input.preferences?.favoriteAppIds ?? [],
    recentAppIds: input.preferences?.recentAppIds ?? [],
    quotaServiceState: input.quotaServiceState ?? 'available',
    quotaUsagesByGroupId:
      input.quotaUsagesByGroupId ??
      buildQuotaUsagesByGroupId({
        memberGroupIds: input.memberGroupIds,
        quotaLimits: buildDefaultQuotaLimitRecords(user, input.memberGroupIds),
        usageTotals: {
          tenant: 0,
          user: 0,
          groupsById: Object.fromEntries(input.memberGroupIds.map(groupId => [groupId, 0])),
        },
      }),
    generatedAt: new Date().toISOString(),
  };
}

export {
  WORKSPACE_APPS,
  WORKSPACE_GROUPS,
  WORKSPACE_ROLES,
  buildWorkspaceCatalog,
  resolveDefaultRoleIds,
  resolveDefaultMemberGroupIds,
  resolveSeededWorkspaceAppsForUser,
};
