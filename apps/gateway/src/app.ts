import Fastify, { type FastifyInstance } from 'fastify';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  closeDatabaseClient,
  createDatabaseClient,
  ensureTenant,
  migrateDatabase,
  type DatabaseClient,
} from '@agentifui/db';

import type { GatewayEnv } from './config/env.js';
import { registerBasePlugins } from './plugins/base.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAdminConnectorRoutes } from './routes/admin-connectors.js';
import { registerAdminConnectorOpsRoutes } from './routes/admin-connectors-ops.js';
import { registerAdminBillingRoutes } from './routes/admin-billing.js';
import { registerAdminIdentityRoutes } from './routes/admin-identity.js';
import { registerAdminPolicyRoutes } from './routes/admin-policy.js';
import { registerAdminSourceRoutes } from './routes/admin-sources.js';
import { registerAdminWorkflowRoutes } from './routes/admin-workflows.js';
import { registerRootRoutes } from './routes/root.js';
import { registerWorkspaceRunControlRoutes } from './routes/workspace-run-control.js';
import { registerWorkspaceBillingRoutes } from './routes/workspace-billing.js';
import { registerWorkspaceSourceStatusRoutes } from './routes/workspace-source-status.js';
import { registerWorkspaceRoutes } from './routes/workspace.js';
import { createAdminService, type AdminService } from './services/admin-service.js';
import { createAuditService, type AuditService } from './services/audit-service.js';
import { createAuthService, type AuthService } from './services/auth-service.js';
import {
  createKnowledgeService,
  type KnowledgeService,
} from './services/knowledge-service.js';
import {
  createObservabilityService,
  type ObservabilityService,
} from './services/observability-service.js';
import {
  createBetterAuthCore,
  type BetterAuthCore,
} from './services/better-auth-core.js';
import { createPersistentAdminService } from './services/persistent-admin-service.js';
import { createPersistentAuditService } from './services/persistent-audit-service.js';
import { createPersistentAuthService } from './services/persistent-auth-service.js';
import { createPersistentKnowledgeService } from './services/persistent-knowledge-service.js';
import { createPersistentConnectorService } from './services/persistent-connector-service.js';
import {
  createPersistentWorkflowDefinitionService,
} from './services/persistent-workflow-definition-service.js';
import {
  createPersistentWorkspaceService,
  ensureWorkspaceCatalogSeed,
} from './services/persistent-workspace-service.js';
import {
  createConnectorService,
  type ConnectorService,
} from './services/connector-service.js';
import {
  createBillingService,
  type BillingService,
} from './services/billing-service.js';
import {
  createWorkflowDefinitionService,
  type WorkflowDefinitionService,
} from './services/workflow-definition-service.js';
import { createPersistentBillingService } from './services/persistent-billing-service.js';
import { createPersistentPolicyService } from './services/persistent-policy-service.js';
import { createLocalWorkspaceFileStorage } from './services/workspace-file-storage.js';
import { createPolicyService, type PolicyService } from './services/policy-service.js';
import {
  createWorkspaceService,
  type WorkspaceService,
} from './services/workspace-service.js';
import {
  createWorkspaceRuntimeService,
  type WorkspaceRuntimeService,
} from './services/workspace-runtime.js';
import {
  createToolRegistryService,
  type ToolRegistryService,
} from './services/tool-registry-service.js';
import { createPersistentToolRegistryService } from './services/persistent-tool-registry-service.js';

type BuildAppOptions = {
  logger?: boolean;
  database?: DatabaseClient;
  authService?: AuthService;
  auditService?: AuditService;
  adminService?: AdminService;
  knowledgeService?: KnowledgeService;
  connectorService?: ConnectorService;
  billingService?: BillingService;
  policyService?: PolicyService;
  workflowDefinitionService?: WorkflowDefinitionService;
  workspaceService?: WorkspaceService;
  runtimeService?: WorkspaceRuntimeService;
  toolRegistryService?: ToolRegistryService;
};

const DEFAULT_BETTER_AUTH_SECRET = 'agentifui-dev-secret-change-me';

export async function buildApp(
  env: GatewayEnv,
  options: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            transport:
              env.nodeEnv === 'development'
                ? { target: 'pino-pretty' }
                : undefined,
          },
  });
  const observabilityService: ObservabilityService = createObservabilityService();
  const requestStartTimes = new WeakMap<object, bigint>();

  const usePersistentBacking = Boolean(options.database || env.databaseUrl);
  const database =
    options.database ??
    (usePersistentBacking && env.databaseUrl
      ? createDatabaseClient({
          connectionString: env.databaseUrl,
        })
      : null);
  const ownsDatabase = Boolean(database && !options.database);
  let betterAuthCore: BetterAuthCore | null = null;
  const workspaceFileStorage = createLocalWorkspaceFileStorage({
    rootDir: env.uploadsDir ?? join(tmpdir(), 'agentifui-uploads'),
  });

  if (database) {
    await migrateDatabase(database);
    await ensureTenant(database, {
      tenantId: env.defaultTenantId,
    });
    await ensureWorkspaceCatalogSeed(database, env.defaultTenantId);
  }

  if (database && env.databaseUrl && !options.authService) {
    betterAuthCore = await createBetterAuthCore({
      baseUrl: env.betterAuthUrl ?? `http://127.0.0.1:${env.port}`,
      connectionString: env.databaseUrl,
      defaultTenantId: env.defaultTenantId,
      secret: env.betterAuthSecret ?? DEFAULT_BETTER_AUTH_SECRET,
    });
  }

  const authService =
    options.authService ??
    (database
      ? createPersistentAuthService(database, {
          betterAuthCore: betterAuthCore ?? undefined,
          defaultTenantId: env.defaultTenantId,
          defaultSsoUserStatus: env.defaultSsoUserStatus,
          lockoutThreshold: env.authLockoutThreshold,
          lockoutDurationMs: env.authLockoutDurationMs,
        })
      : createAuthService({
          defaultTenantId: env.defaultTenantId,
          defaultSsoUserStatus: env.defaultSsoUserStatus,
          lockoutThreshold: env.authLockoutThreshold,
          lockoutDurationMs: env.authLockoutDurationMs,
        }));
  const auditService =
    options.auditService ??
    (database ? createPersistentAuditService(database) : createAuditService());
  const adminService =
    options.adminService ?? (database ? createPersistentAdminService(database) : createAdminService());
  const knowledgeService =
    options.knowledgeService ??
    (database ? createPersistentKnowledgeService(database) : createKnowledgeService());
  const connectorService =
    options.connectorService ??
    (database ? createPersistentConnectorService(database) : createConnectorService());
  const billingService =
    options.billingService ??
    (database ? createPersistentBillingService(database, adminService) : createBillingService(adminService));
  const policyService =
    options.policyService ??
    (database ? createPersistentPolicyService(database, adminService) : createPolicyService(adminService));
  const workspaceService =
    options.workspaceService ??
    (database
      ? createPersistentWorkspaceService(database, {
          fileStorage: workspaceFileStorage,
        })
      : createWorkspaceService({
          fileStorage: workspaceFileStorage,
        }));
  const workflowDefinitionService =
    options.workflowDefinitionService ??
    (database
      ? createPersistentWorkflowDefinitionService(database)
      : createWorkflowDefinitionService());
  const runtimeService =
    options.runtimeService ??
    createWorkspaceRuntimeService({
      degradedRuntimeIds: env.degradedRuntimeIds,
      degradedProviderIds: env.degradedProviderIds,
      openCircuitProviderIds: env.openCircuitProviderIds,
      resolveTenantRuntimeMode: tenantId =>
        env.tenantRuntimeModes?.[tenantId] ?? 'standard',
    });
  const toolRegistryService =
    options.toolRegistryService ??
    (database
      ? createPersistentToolRegistryService(database)
      : createToolRegistryService());

  if (ownsDatabase && database) {
    app.addHook('onClose', async () => {
      if (betterAuthCore) {
        await betterAuthCore.close();
      }
      await closeDatabaseClient(database);
    });
  } else if (betterAuthCore) {
    app.addHook('onClose', async () => {
      await betterAuthCore.close();
    });
  }

  await registerBasePlugins(app, env);
  app.addHook('onRequest', async request => {
    observabilityService.onRequestStarted();
    requestStartTimes.set(request.raw, process.hrtime.bigint());
  });

  app.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStartTimes.get(request.raw) ?? process.hrtime.bigint();
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = request.routeOptions.url || new URL(request.url, 'http://localhost').pathname;

    observabilityService.onRequestCompleted({
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs,
    });

    request.log.info(
      {
        requestId: request.id,
        traceId: request.headers['x-trace-id']?.toString() ?? null,
        method: request.method,
        route,
        statusCode: reply.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
      },
      'request.completed'
    );
  });

  app.addHook('onRequestAbort', async request => {
    observabilityService.onRequestAborted();

    request.log.warn(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      'request.aborted'
    );
  });

  await registerRootRoutes(app, env, observabilityService, runtimeService);
  await registerAuthRoutes(app, env, authService, auditService, adminService);
  await registerAdminRoutes(
    app,
    authService,
    adminService,
    auditService,
    toolRegistryService,
    policyService,
  );
  await registerAdminIdentityRoutes(app, authService, adminService, auditService);
  await registerAdminPolicyRoutes(app, authService, adminService, policyService, auditService);
  await registerAdminBillingRoutes(
    app,
    authService,
    adminService,
    billingService,
    auditService,
    policyService,
  );
  await registerAdminSourceRoutes(app, authService, adminService, knowledgeService, auditService);
  await registerAdminWorkflowRoutes(
    app,
    authService,
    adminService,
    workflowDefinitionService,
    auditService,
  );
  await registerAdminConnectorRoutes(
    app,
    authService,
    adminService,
    connectorService,
    auditService,
  );
  await registerAdminConnectorOpsRoutes(
    app,
    authService,
    adminService,
    connectorService,
    auditService,
  );
  await registerWorkspaceRoutes(
    app,
    authService,
    workspaceService,
    auditService,
    runtimeService,
    adminService,
    billingService,
  );
  await registerWorkspaceRunControlRoutes(
    app,
    authService,
    workspaceService,
    auditService,
  );
  await registerWorkspaceBillingRoutes(app, authService, billingService);
  await registerWorkspaceSourceStatusRoutes(
    app,
    authService,
    knowledgeService,
    connectorService,
  );
  await registerChatRoutes(
    app,
    authService,
    workspaceService,
    auditService,
    knowledgeService,
    policyService,
    runtimeService,
    toolRegistryService,
  );

  return app;
}
