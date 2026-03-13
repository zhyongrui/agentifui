import type { AuthUser } from '@agentifui/shared/auth';
import type {
  WorkspaceAppLaunch,
  WorkspaceCatalog,
  WorkspaceConversationAttachment,
  WorkspaceConversation,
  WorkspaceConversationMessage,
  WorkspacePreferences,
  WorkspacePreferencesUpdateRequest,
  WorkspaceRun,
  WorkspaceRunStatus,
  WorkspaceRunSummary,
  WorkspaceRunTrigger,
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
import type { WorkspaceFileStorage } from './workspace-file-storage.js';

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

type WorkspaceConversationRunsResult =
  | {
      ok: true;
      data: {
        conversationId: string;
        runs: WorkspaceRunSummary[];
      };
    }
  | WorkspaceLookupFailure;

type WorkspaceRunResult =
  | {
      ok: true;
      data: WorkspaceRun;
    }
  | WorkspaceLookupFailure;

type WorkspaceRunCreateInput = {
  conversationId: string;
  triggeredFrom: WorkspaceRunTrigger;
};

type WorkspaceConversationUploadInput = {
  conversationId: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
};

type WorkspaceConversationAttachmentLookupInput = {
  conversationId: string;
  fileIds: string[];
};

type WorkspaceRunUpdateInput = {
  conversationId: string;
  runId: string;
  status: WorkspaceRunStatus;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  messageHistory?: WorkspaceConversationMessage[];
  error?: string;
  elapsedTime?: number;
  totalTokens?: number;
  totalSteps?: number;
  finishedAt?: string | null;
};

type WorkspaceConversationUploadResult =
  | {
      ok: true;
      data: WorkspaceConversationAttachment;
    }
  | WorkspaceLookupFailure;

type WorkspaceConversationAttachmentLookupResult =
  | {
      ok: true;
      data: WorkspaceConversationAttachment[];
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
  listConversationRunsForUser(
    user: AuthUser,
    conversationId: string
  ): WorkspaceConversationRunsResult | Promise<WorkspaceConversationRunsResult>;
  getRunForUser(user: AuthUser, runId: string): WorkspaceRunResult | Promise<WorkspaceRunResult>;
  uploadConversationFileForUser(
    user: AuthUser,
    input: WorkspaceConversationUploadInput
  ): WorkspaceConversationUploadResult | Promise<WorkspaceConversationUploadResult>;
  listConversationAttachmentsForUser(
    user: AuthUser,
    input: WorkspaceConversationAttachmentLookupInput
  ):
    | WorkspaceConversationAttachmentLookupResult
    | Promise<WorkspaceConversationAttachmentLookupResult>;
  createConversationRunForUser(
    user: AuthUser,
    input: WorkspaceRunCreateInput
  ): WorkspaceConversationResult | Promise<WorkspaceConversationResult>;
  updateConversationRunForUser(
    user: AuthUser,
    input: WorkspaceRunUpdateInput
  ): WorkspaceConversationResult | Promise<WorkspaceConversationResult>;
};

type WorkspaceConversationRecord = WorkspaceConversation & {
  userId: string;
};

type WorkspaceRunRecord = WorkspaceRun & {
  userId: string;
};

type WorkspaceConversationAttachmentRecord = {
  attachment: WorkspaceConversationAttachment;
  conversationId: string;
  storageKey: string | null;
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

function buildRunSummary(run: WorkspaceRunRecord): WorkspaceRunSummary {
  return {
    id: run.id,
    type: run.type,
    status: run.status,
    triggeredFrom: run.triggeredFrom,
    traceId: run.traceId,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    elapsedTime: run.elapsedTime,
    totalTokens: run.totalTokens,
    totalSteps: run.totalSteps,
  };
}

function buildUsageFromOutputs(run: WorkspaceRunRecord): WorkspaceRun['usage'] {
  const candidate = run.outputs.usage;

  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as Record<string, unknown>).promptTokens === 'number' &&
    typeof (candidate as Record<string, unknown>).completionTokens === 'number' &&
    typeof (candidate as Record<string, unknown>).totalTokens === 'number'
  ) {
    const usage = candidate as {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };

    return {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
    };
  }

  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: run.totalTokens,
  };
}

function createRunRecord(input: {
  conversation: WorkspaceConversationRecord;
  createdAt: string;
  runId: string;
  traceId: string;
  triggeredFrom: WorkspaceRunTrigger;
  userId: string;
}): WorkspaceRunRecord {
  return {
    id: input.runId,
    conversationId: input.conversation.id,
    userId: input.userId,
    type: input.conversation.run.type,
    status: 'pending',
    triggeredFrom: input.triggeredFrom,
    traceId: input.traceId,
    createdAt: input.createdAt,
    finishedAt: null,
    elapsedTime: 0,
    totalTokens: 0,
    totalSteps: 0,
    app: input.conversation.app,
    activeGroup: input.conversation.activeGroup,
    error: null,
    inputs: {},
    outputs: {},
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  };
}

export function createWorkspaceService(options: {
  fileStorage?: WorkspaceFileStorage;
} = {}): WorkspaceService {
  const preferencesByUserId = new Map<string, WorkspacePreferences>();
  const conversationsById = new Map<string, WorkspaceConversationRecord>();
  const runsById = new Map<string, WorkspaceRunRecord>();
  const runIdsByConversationId = new Map<string, string[]>();
  const attachmentsByConversationId = new Map<string, string[]>();
  const attachmentsById = new Map<string, WorkspaceConversationAttachmentRecord>();

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

  function updateConversationLatestRun(
    conversation: WorkspaceConversationRecord,
    run: WorkspaceRunRecord
  ) {
    conversation.run = buildRunSummary(run);
    conversation.updatedAt = run.finishedAt ?? run.createdAt;
  }

  function listRunRecords(conversationId: string) {
    return (runIdsByConversationId.get(conversationId) ?? [])
      .map(runId => runsById.get(runId))
      .filter((run): run is WorkspaceRunRecord => Boolean(run))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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
        messages: [],
        run: {
          id: '',
          type: resolveRunType(app.kind),
          status: 'pending',
          triggeredFrom: 'app_launch',
          traceId: '',
          createdAt: launchedAt,
          finishedAt: null,
          elapsedTime: 0,
          totalTokens: 0,
          totalSteps: 0,
        },
      };
      const runId = `run_${randomUUID()}`;
      const traceId = buildTraceId();
      const run = createRunRecord({
        conversation,
        createdAt: launchedAt,
        runId,
        traceId,
        triggeredFrom: 'app_launch',
        userId: user.id,
      });

      runsById.set(runId, run);
      runIdsByConversationId.set(conversationId, [runId]);
      updateConversationLatestRun(conversation, run);
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

      const latestRun = listRunRecords(conversationId)[0];

      if (latestRun) {
        updateConversationLatestRun(conversation, latestRun);
      }

      const { userId, ...conversationData } = conversation;

      return {
        ok: true,
        data: conversationData,
      };
    },
    listConversationRunsForUser(user, conversationId) {
      const conversation = conversationsById.get(conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      return {
        ok: true,
        data: {
          conversationId,
          runs: listRunRecords(conversationId).map(buildRunSummary),
        },
      };
    },
    getRunForUser(user, runId) {
      const run = runsById.get(runId);

      if (!run || run.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace run could not be found.',
        };
      }

      run.usage = buildUsageFromOutputs(run);

      const { userId, ...runData } = run;

      return {
        ok: true,
        data: runData,
      };
    },
    async uploadConversationFileForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const attachmentId = `file_${randomUUID()}`;
      let storageKey: string | null = null;

      if (options.fileStorage) {
        const stored = await options.fileStorage.saveFile({
          tenantId: user.tenantId,
          userId: user.id,
          fileId: attachmentId,
          fileName: input.fileName,
          bytes: input.bytes,
        });
        storageKey = stored.storageKey;
      }

      const attachment: WorkspaceConversationAttachment = {
        id: attachmentId,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength,
        uploadedAt: new Date().toISOString(),
      };

      attachmentsById.set(attachmentId, {
        attachment,
        conversationId: input.conversationId,
        storageKey,
        userId: user.id,
      });
      attachmentsByConversationId.set(input.conversationId, [
        ...(attachmentsByConversationId.get(input.conversationId) ?? []),
        attachmentId,
      ]);

      return {
        ok: true,
        data: attachment,
      };
    },
    listConversationAttachmentsForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const attachments = input.fileIds.flatMap(fileId => {
        const record = attachmentsById.get(fileId);

        if (
          !record ||
          record.userId !== user.id ||
          record.conversationId !== input.conversationId
        ) {
          return [];
        }

        return [record.attachment];
      });

      return {
        ok: true,
        data: attachments,
      };
    },
    createConversationRunForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);

      if (!conversation || conversation.userId !== user.id) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      const createdAt = new Date().toISOString();
      const run = createRunRecord({
        conversation,
        createdAt,
        runId: `run_${randomUUID()}`,
        traceId: buildTraceId(),
        triggeredFrom: input.triggeredFrom,
        userId: user.id,
      });

      runsById.set(run.id, run);
      runIdsByConversationId.set(conversation.id, [
        ...(runIdsByConversationId.get(conversation.id) ?? []),
        run.id,
      ]);
      updateConversationLatestRun(conversation, run);

      const { userId, ...conversationData } = conversation;

      return {
        ok: true,
        data: conversationData,
      };
    },
    updateConversationRunForUser(user, input) {
      const conversation = conversationsById.get(input.conversationId);
      const run = runsById.get(input.runId);

      if (
        !conversation ||
        conversation.userId !== user.id ||
        !run ||
        run.userId !== user.id ||
        run.conversationId !== input.conversationId
      ) {
        return {
          ok: false,
          statusCode: 404,
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The target workspace conversation could not be found.',
        };
      }

      run.status = input.status;
      run.finishedAt =
        input.finishedAt ??
        (input.status === 'succeeded' || input.status === 'failed' || input.status === 'stopped'
          ? new Date().toISOString()
          : run.finishedAt);
      run.elapsedTime = input.elapsedTime ?? run.elapsedTime;
      run.totalTokens = input.totalTokens ?? run.totalTokens;
      run.totalSteps = input.totalSteps ?? run.totalSteps;
      run.error = input.error ?? run.error;

      if (input.inputs) {
        run.inputs = {
          ...run.inputs,
          ...input.inputs,
        };
      }

      if (input.outputs) {
        run.outputs = {
          ...run.outputs,
          ...input.outputs,
        };
      }

      run.usage = buildUsageFromOutputs(run);

      if (input.messageHistory) {
        conversation.messages = input.messageHistory;
      }

      updateConversationLatestRun(conversation, run);

      const { userId, ...conversationData } = conversation;

      return {
        ok: true,
        data: conversationData,
      };
    },
  };
}

export type {
  WorkspaceConversationAttachmentLookupInput,
  WorkspaceConversationAttachmentLookupResult,
  WorkspaceConversationResult,
  WorkspaceConversationRunsResult,
  WorkspaceConversationUploadInput,
  WorkspaceConversationUploadResult,
  WorkspaceLaunchResult,
  WorkspaceRunCreateInput,
  WorkspaceRunResult,
  WorkspaceRunUpdateInput,
  WorkspaceService,
};
