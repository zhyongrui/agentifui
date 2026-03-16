import type { AdminAppSummary } from '@agentifui/shared/admin';
import type { WorkspaceApp, WorkspaceAppKind, WorkspaceAppStatus } from '@agentifui/shared/apps';

import type { AppLocale } from './i18n';

const appTranslations: Record<
  string,
  Partial<Record<AppLocale, { name: string; summary: string }>>
> = {
  app_market_brief: {
    'zh-CN': {
      name: '市场简报',
      summary: '汇总市场动态、竞品观察和本周风险变化。',
    },
  },
  app_service_copilot: {
    'zh-CN': {
      name: '服务副驾',
      summary: '处理高频客户问答、知识库召回和服务摘要。',
    },
  },
  app_release_radar: {
    'zh-CN': {
      name: '发布雷达',
      summary: '核对上线清单、变更风险和发布审批状态。',
    },
  },
  app_policy_watch: {
    'zh-CN': {
      name: '政策观察',
      summary: '跟踪政策变化、合规要求和影响说明。',
    },
  },
  app_runbook_mentor: {
    'zh-CN': {
      name: '流程手册导师',
      summary: '把 SOP 转成可执行步骤，帮助团队完成标准化交付。',
    },
  },
  app_tenant_control: {
    'zh-CN': {
      name: '租户控制台',
      summary: '管理租户权限、访问例外和待审批的人机协作动作。',
    },
  },
};

const appKindLabels: Record<AppLocale, Record<WorkspaceAppKind, string>> = {
  'zh-CN': {
    chat: '对话',
    analysis: '分析',
    automation: '自动化',
    governance: '治理',
  },
  'en-US': {
    chat: 'chat',
    analysis: 'analysis',
    automation: 'automation',
    governance: 'governance',
  },
};

const appStatusLabels: Record<AppLocale, Record<WorkspaceAppStatus, string>> = {
  'zh-CN': {
    ready: '可用',
    beta: '测试中',
  },
  'en-US': {
    ready: 'ready',
    beta: 'beta',
  },
};

const appTagLabels: Record<AppLocale, Record<string, string>> = {
  'zh-CN': {
    research: '研究',
    daily: '日报',
    support: '客服',
    'knowledge-base': '知识库',
    release: '发布',
    governance: '治理',
    policy: '政策',
    compliance: '合规',
    ops: '运维',
    automation: '自动化',
    admin: '管理',
    access: '访问',
  },
  'en-US': {},
};

type AppLike = {
  id: string;
  slug: string;
  name: string;
  summary: string;
};

export function localizeWorkspaceApp<T extends AppLike>(app: T, locale: AppLocale): T {
  const translated = appTranslations[app.id]?.[locale];

  if (!translated) {
    return app;
  }

  return {
    ...app,
    name: translated.name,
    summary: translated.summary,
  };
}

export function localizeAppKind(kind: WorkspaceAppKind, locale: AppLocale) {
  return appKindLabels[locale][kind] ?? kind;
}

export function localizeAppStatus(status: WorkspaceAppStatus, locale: AppLocale) {
  return appStatusLabels[locale][status] ?? status;
}

export function localizeAppTag(tag: string, locale: AppLocale) {
  return appTagLabels[locale][tag] ?? tag;
}

export function localizeAdminApp(app: AdminAppSummary, locale: AppLocale): AdminAppSummary {
  return localizeWorkspaceApp(app, locale);
}

export function localizeWorkspaceCatalogApps<T extends AppLike>(apps: T[], locale: AppLocale): T[] {
  return apps.map(app => localizeWorkspaceApp(app, locale));
}
