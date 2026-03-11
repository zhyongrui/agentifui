import { describe, expect, it } from 'vitest';

import type { QuotaUsage, WorkspaceApp } from './contracts.js';
import {
  buildWorkspaceSections,
  evaluateAppLaunch,
  getQuotaSeverity,
  listQuotaAlerts,
  listVisibleApps,
  searchWorkspaceApps,
} from './workspace.js';

const apps: WorkspaceApp[] = [
  {
    id: 'app_market_brief',
    slug: 'market-brief',
    name: 'Market Brief',
    summary: 'Daily market digest for product teams.',
    kind: 'analysis',
    status: 'ready',
    shortCode: 'MB',
    tags: ['research', 'daily'],
    grantedGroupIds: ['grp_product', 'grp_research'],
    launchCost: 40,
  },
  {
    id: 'app_release_radar',
    slug: 'release-radar',
    name: 'Release Radar',
    summary: 'Release governance and launch readiness.',
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
    summary: 'Track policy changes and compliance notes.',
    kind: 'governance',
    status: 'ready',
    shortCode: 'PW',
    tags: ['policy', 'compliance'],
    grantedGroupIds: ['grp_research'],
    launchCost: 25,
  },
  {
    id: 'app_hidden',
    slug: 'hidden',
    name: 'Hidden App',
    summary: 'Should stay invisible.',
    kind: 'chat',
    status: 'ready',
    shortCode: 'HA',
    tags: ['restricted'],
    grantedGroupIds: ['grp_security'],
    launchCost: 10,
  },
];

const quotas: QuotaUsage[] = [
  {
    scope: 'tenant',
    scopeId: 'tenant_dev',
    scopeLabel: 'Tenant quota',
    used: 820,
    limit: 1000,
  },
  {
    scope: 'group',
    scopeId: 'grp_product',
    scopeLabel: 'Product Studio quota',
    used: 930,
    limit: 1000,
  },
  {
    scope: 'user',
    scopeId: 'usr_demo',
    scopeLabel: 'Your monthly quota',
    used: 610,
    limit: 1000,
  },
];

const marketBrief = apps[0]!;
const releaseRadar = apps[1]!;
const policyWatch = apps[2]!;
const baseQuota = quotas[0]!;

describe('workspace helpers', () => {
  it('shows apps granted by the union of member groups', () => {
    expect(listVisibleApps(apps, ['grp_product', 'grp_research']).map(app => app.id)).toEqual([
      'app_market_brief',
      'app_release_radar',
      'app_policy_watch',
    ]);
  });

  it('filters apps by name, summary and tags', () => {
    expect(searchWorkspaceApps(apps, 'compliance').map(app => app.id)).toEqual([
      'app_policy_watch',
    ]);
  });

  it('builds recent and favorite sections from the visible app set', () => {
    expect(
      buildWorkspaceSections({
        apps,
        memberGroupIds: ['grp_product', 'grp_research'],
        favoriteIds: ['app_policy_watch', 'app_hidden'],
        recentIds: ['app_release_radar', 'app_hidden', 'app_market_brief'],
        search: '',
      })
    ).toEqual({
      recent: [releaseRadar, marketBrief],
      favorites: [policyWatch],
      all: [marketBrief, policyWatch, releaseRadar],
    });
  });

  it('marks usage thresholds at 80, 90 and 100 percent', () => {
    expect(getQuotaSeverity({ ...baseQuota, used: 799 })).toBe('healthy');
    expect(getQuotaSeverity({ ...baseQuota, used: 800 })).toBe('warning');
    expect(getQuotaSeverity({ ...baseQuota, used: 900 })).toBe('critical');
    expect(getQuotaSeverity({ ...baseQuota, used: 1000 })).toBe('blocked');
  });

  it('orders quota alerts by severity', () => {
    expect(listQuotaAlerts(quotas).map(usage => usage.scope)).toEqual(['group', 'tenant']);
  });

  it('attributes launch checks to the current working group when it is eligible', () => {
    expect(
      evaluateAppLaunch({
        app: marketBrief,
        activeGroupId: 'grp_product',
        memberGroupIds: ['grp_product', 'grp_research'],
        quotas,
        quotaServiceState: 'available',
      })
    ).toEqual({
      canLaunch: true,
      reason: 'ok',
      attributedGroupId: 'grp_product',
      eligibleGroupIds: ['grp_product', 'grp_research'],
      blockingScopes: [],
    });
  });

  it('requires a group switch when the current working group does not grant the app', () => {
    expect(
      evaluateAppLaunch({
        app: policyWatch,
        activeGroupId: 'grp_product',
        memberGroupIds: ['grp_product', 'grp_research'],
        quotas,
        quotaServiceState: 'available',
      })
    ).toEqual({
      canLaunch: false,
      reason: 'group_switch_required',
      attributedGroupId: null,
      eligibleGroupIds: ['grp_research'],
      blockingScopes: [],
    });
  });

  it('blocks launches that would exceed quota or when quota service is degraded', () => {
    expect(
      evaluateAppLaunch({
        app: releaseRadar,
        activeGroupId: 'grp_product',
        memberGroupIds: ['grp_product', 'grp_research'],
        quotas,
        quotaServiceState: 'available',
      })
    ).toMatchObject({
      canLaunch: false,
      reason: 'quota_exceeded',
      attributedGroupId: 'grp_product',
    });

    expect(
      evaluateAppLaunch({
        app: marketBrief,
        activeGroupId: 'grp_product',
        memberGroupIds: ['grp_product', 'grp_research'],
        quotas,
        quotaServiceState: 'degraded',
      })
    ).toEqual({
      canLaunch: false,
      reason: 'quota_service_degraded',
      attributedGroupId: null,
      eligibleGroupIds: ['grp_product', 'grp_research'],
      blockingScopes: [],
    });
  });
});
