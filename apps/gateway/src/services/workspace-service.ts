import type { AuthUser } from '@agentifui/shared/auth';
import type {
  WorkspaceAppLaunch,
  WorkspaceCatalog,
  WorkspaceConversation,
  WorkspacePreferences,
  WorkspacePreferencesUpdateRequest,
  WorkspaceRunType,
} from '@agentifui/shared/apps';
import { evaluateAppLaunch } from '@agentifui/shared/apps';
import { randomUUID } from 'node:crypto';

import {
  WORKSPACE_GROUPS,
  buildWorkspaceCatalog,
  resolveDefaultMemberGroupIds,
  resolveSeededWorkspaceAppsForUser,
} from './workspace-catalog-fixtures.js';

type WorkspaceLaunchFailure = {
  ok: false;
  statusCode: 404 | 409;
  code: 'WORKSPACE_NOT_FOUND' | 'WORKSPACE_LAUNCH_BLOCKED';
  message: string;
  details?: unknown;
};

type WorkspaceLookupFailure = {
  ok: false;
  statusCode: 404;
  code: 'WORKSPACE_NOT_FOUND';
  message: string;
  details?: unknown;
};

type WorkspaceLaunchResult =
  | {
      ok: true;
      data: WorkspaceAppLaunch;
    }
  | WorkspaceLaunchFailure;

type WorkspaceConversationResult =
  | {
      ok: true;
      data: WorkspaceConversation;
    }
  | WorkspaceLookupFailure;

type WorkspaceService = {
  getCatalogForUser(user: AuthUser): WorkspaceCatalog | Promise<WorkspaceCatalog>;
  getPreferencesForUser(user: AuthUser): WorkspacePreferences | Promise<WorkspacePreferences>;
  updatePreferencesForUser(
    user: AuthUser,
    input: WorkspacePreferencesUpdateRequest
  ): WorkspacePreferences | Promise<WorkspacePreferences>;
  launchAppForUser(
    user: AuthUser,
    input: {
      appId: string;
      activeGroupId: string;
    }
  ): WorkspaceLaunchResult | Promise<WorkspaceLaunchResult>;
  getConversationForUser(
    user: AuthUser,
    conversationId: string
  ): WorkspaceConversationResult | Promise<WorkspaceConversationResult>;
};

type WorkspaceConversationRecord = WorkspaceConversation & {
  userId: string;
};

function buildEmptyPreferences(): WorkspacePreferences {
  return {
    favoriteAppIds: [],
    recentAppIds: [],
    defaultActiveGroupId: null,
    updatedAt: null,
  };
}

function dedupeIds(value: string[]) {
  return [...new Set(value)];
}

function recordRecentApp(currentIds: string[], appId: string, limit = 4) {
  return [appId, ...currentIds.filter(currentId => currentId !== appId)].slice(0, limit);
}

function buildLaunchUrl(conversationId: string) {
  return `/chat/${conversationId}`;
}

function buildTraceId() {
  return randomUUID().replace(/-/g, '');
}

function resolveRunType(kind: WorkspaceAppLaunch['app']['kind']): WorkspaceRunType {
  if (kind === 'automation') {
    return 'workflow';
  }

  if (kind === 'chat') {
    return 'generation';
  }

  return 'agent';
}

export function createWorkspaceService(): WorkspaceService {
  const preferencesByUserId = new Map<string, WorkspacePreferences>();
  const conversationsById = new Map<string, WorkspaceConversationRecord>();

  function getContextForUser(user: AuthUser) {
    const memberGroupIds = resolveDefaultMemberGroupIds(user.email);
    const apps = resolveSeededWorkspaceAppsForUser(user);
    const groups = WORKSPACE_GROUPS.filter(group => memberGroupIds.includes(group.id));

    return {
      apps,
      groups,
      memberGroupIds,
    };
  }

  function sanitizePreferencesForUser(
    user: AuthUser,
    input: WorkspacePreferences
  ): WorkspacePreferences {
    const context = getContextForUser(user);
    const visibleAppIds = new Set(context.apps.map(app => app.id));

    return {
      favoriteAppIds: dedupeIds(input.favoriteAppIds).filter(appId => visibleAppIds.has(appId)),
      recentAppIds: dedupeIds(input.recentAppIds).filter(appId => visibleAppIds.has(appId)),
      defaultActiveGroupId:
        input.defaultActiveGroupId && context.memberGroupIds.includes(input.defaultActiveGroupId)
          ? input.defaultActiveGroupId
          : null,
      updatedAt: input.updatedAt,
    };
  }

  return {
    getCatalogForUser(user) {
      const context = getContextForUser(user);
      const preferences = sanitizePreferencesForUser(
        user,
        preferencesByUserId.get(user.id) ?? buildEmptyPreferences()
      );

      return buildWorkspaceCatalog(user, {
        groups: context.groups,
        apps: context.apps,
        memberGroupIds: context.memberGroupIds,
        preferences,
      });
    },
    getPreferencesForUser(user) {
      return sanitizePreferencesForUser(
        user,
        preferencesByUserId.get(user.id) ?? buildEmptyPreferences()
      );
    },
    updatePreferencesForUser(user, input) {
      const nextPreferences = sanitizePreferencesForUser(user, {
        favoriteAppIds: input.favoriteAppIds,
        recentAppIds: input.recentAppIds,
        defaultActiveGroupId: input.defaultActiveGroupId,
        updatedAt: new Date().toISOString(),
      });

      preferencesByUserId.set(user.id, nextPreferences);

      return nextPreferences;
    },
    async launchAppForUser(user, input) {
      const catalog = await this.getCatalogForUser(user);
      const app = catalog.apps.find(candidate => candidate.id === input.appId);

      if (!app) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace app could not be found.',
        };
      }

      const quotaUsages =
        catalog.quotaUsagesByGroupId[input.activeGroupId] ??
        catalog.quotaUsagesByGroupId[catalog.defaultActiveGroupId] ??
        [];
      const guard = evaluateAppLaunch({
        app,
        activeGroupId: input.activeGroupId,
        memberGroupIds: catalog.memberGroupIds,
        quotas: quotaUsages,
        quotaServiceState: catalog.quotaServiceState,
      });

      if (!guard.canLaunch || !guard.attributedGroupId) {
        return {
          ok: false,
          statusCode: 409,
          code: 'WORKSPACE_LAUNCH_BLOCKED',
          message: 'The workspace app launch is blocked by the current authorization or quota state.',
          details: guard,
        };
      }

      const attributedGroup = catalog.groups.find(group => group.id === guard.attributedGroupId);

      if (!attributedGroup) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The attributed workspace group could not be found.',
        };
      }

      await this.updatePreferencesForUser(user, {
        favoriteAppIds: catalog.favoriteAppIds,
        recentAppIds: recordRecentApp(catalog.recentAppIds, app.id),
        defaultActiveGroupId: attributedGroup.id,
      });

      const launchId = randomUUID();
      const conversationId = `conv_${randomUUID()}`;
      const runId = `run_${randomUUID()}`;
      const traceId = buildTraceId();
      const launchedAt = new Date().toISOString();
      const conversation: WorkspaceConversationRecord = {
        id: conversationId,
        title: app.name,
        status: 'active',
        createdAt: launchedAt,
        updatedAt: launchedAt,
        launchId,
        userId: user.id,
        app: {
          id: app.id,
          slug: app.slug,
          name: app.name,
          summary: app.summary,
          kind: app.kind,
          status: app.status,
          shortCode: app.shortCode,
        },
        activeGroup: attributedGroup,
        run: {
          id: runId,
          type: resolveRunType(app.kind),
          status: 'pending',
          traceId,
          createdAt: launchedAt,
        },
      };

      conversationsById.set(conversationId, conversation);

      return {
        ok: true,
        data: {
          id: launchId,
          status: 'conversation_ready',
          launchUrl: buildLaunchUrl(conversationId),
          launchedAt,
          conversationId,
          runId,
          traceId,
          app: {
            id: app.id,
            slug: app.slug,
            name: app.name,
            summary: app.summary,
            kind: app.kind,
            status: app.status,
            shortCode: app.shortCode,
            launchCost: app.launchCost,
          },
          attributedGroup,
        },
      };
    },
    getConversationForUser(user, conversationId) {
      const conversation = conversationsById.get(conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const { userId, ...conversationData } = conversation;

      return {
        ok: true,
        data: conversationData,
      };
    },
  };
}

export type { WorkspaceConversationResult, WorkspaceLaunchResult, WorkspaceService };
