import type { QuotaUsage, WorkspaceApp, WorkspaceGroup } from '@agentifui/shared/apps';

import type { AuthSession } from './auth-session';

export const WORKSPACE_FAVORITES_KEY = 'agentifui.workspace.favorite-apps';
export const WORKSPACE_RECENTS_KEY = 'agentifui.workspace.recent-apps';
export const WORKSPACE_ACTIVE_GROUP_KEY = 'agentifui.workspace.active-group-id';

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type AppsWorkspaceFixture = {
  groups: WorkspaceGroup[];
  memberGroupIds: string[];
  initialActiveGroupId: string;
  apps: WorkspaceApp[];
  quotaUsagesByGroupId: Record<string, QuotaUsage[]>;
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

const WORKSPACE_APPS: WorkspaceApp[] = [
  {
    id: 'app_market_brief',
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

function createTenantQuota(session: AuthSession): QuotaUsage {
  return {
    scope: 'tenant',
    scopeId: session.user.tenantId,
    scopeLabel: 'Tenant monthly quota',
    used: 820,
    limit: 1000,
  };
}

function createUserQuota(session: AuthSession): QuotaUsage {
  return {
    scope: 'user',
    scopeId: session.user.id,
    scopeLabel: 'Your monthly quota',
    used: 610,
    limit: 1000,
  };
}

export function createAppsWorkspaceFixture(session: AuthSession): AppsWorkspaceFixture {
  return {
    groups: WORKSPACE_GROUPS,
    memberGroupIds: ['grp_product', 'grp_research'],
    initialActiveGroupId: 'grp_product',
    apps: WORKSPACE_APPS,
    quotaUsagesByGroupId: {
      grp_product: [
        createTenantQuota(session),
        {
          scope: 'group',
          scopeId: 'grp_product',
          scopeLabel: 'Product Studio quota',
          used: 930,
          limit: 1000,
        },
        createUserQuota(session),
      ],
      grp_research: [
        createTenantQuota(session),
        {
          scope: 'group',
          scopeId: 'grp_research',
          scopeLabel: 'Research Lab quota',
          used: 760,
          limit: 1000,
        },
        createUserQuota(session),
      ],
    },
  };
}

export function readStoredIds(storage: Pick<Storage, 'getItem'>, key: string): string[] {
  const raw = storage.getItem(key);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return [...new Set(parsed.filter((value): value is string => typeof value === 'string'))];
  } catch {
    return [];
  }
}

export function writeStoredIds(storage: BrowserStorage, key: string, value: string[]) {
  storage.setItem(key, JSON.stringify([...new Set(value)]));
}

export function readStoredGroupId(storage: Pick<Storage, 'getItem'>, key: string): string | null {
  const value = storage.getItem(key);

  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function writeStoredGroupId(storage: BrowserStorage, key: string, value: string) {
  storage.setItem(key, value);
}

export function toggleFavoriteApp(currentIds: string[], appId: string): string[] {
  return currentIds.includes(appId)
    ? currentIds.filter(currentId => currentId !== appId)
    : [...currentIds, appId];
}

export function recordRecentApp(currentIds: string[], appId: string, limit = 4): string[] {
  return [appId, ...currentIds.filter(currentId => currentId !== appId)].slice(0, limit);
}

export function resolveActiveGroupId(
  candidateGroupId: string | null,
  memberGroupIds: string[],
  fallbackGroupId: string
): string {
  if (candidateGroupId && memberGroupIds.includes(candidateGroupId)) {
    return candidateGroupId;
  }

  return fallbackGroupId;
}
