import Fastify, { type FastifyInstance } from 'fastify';
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
import { registerRootRoutes } from './routes/root.js';
import { registerWorkspaceRoutes } from './routes/workspace.js';
import { createAuditService, type AuditService } from './services/audit-service.js';
import { createAuthService, type AuthService } from './services/auth-service.js';
import {
  createBetterAuthCore,
  type BetterAuthCore,
} from './services/better-auth-core.js';
import { createPersistentAuditService } from './services/persistent-audit-service.js';
import { createPersistentAuthService } from './services/persistent-auth-service.js';
import {
  createPersistentWorkspaceService,
  ensureWorkspaceCatalogSeed,
} from './services/persistent-workspace-service.js';
import {
  createWorkspaceService,
  type WorkspaceService,
} from './services/workspace-service.js';

type BuildAppOptions = {
  logger?: boolean;
  database?: DatabaseClient;
  authService?: AuthService;
  auditService?: AuditService;
  workspaceService?: WorkspaceService;
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
  const workspaceService =
    options.workspaceService ??
    (database ? createPersistentWorkspaceService(database) : createWorkspaceService());

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
  await registerRootRoutes(app, env);
  await registerAuthRoutes(app, env, authService, auditService);
  await registerWorkspaceRoutes(app, authService, workspaceService);
  await registerChatRoutes(app, authService, workspaceService);

  return app;
}
