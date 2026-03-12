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
import { registerRootRoutes } from './routes/root.js';
import { registerWorkspaceRoutes } from './routes/workspace.js';
import { createAuditService, type AuditService } from './services/audit-service.js';
import { createAuthService, type AuthService } from './services/auth-service.js';
import { createPersistentAuditService } from './services/persistent-audit-service.js';
import { createPersistentAuthService } from './services/persistent-auth-service.js';
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

  if (database) {
    await migrateDatabase(database);
    await ensureTenant(database, {
      tenantId: env.defaultTenantId,
    });
  }

  const authService =
    options.authService ??
    (database
      ? createPersistentAuthService(database, {
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
  const workspaceService = options.workspaceService ?? createWorkspaceService();

  if (ownsDatabase && database) {
    app.addHook('onClose', async () => {
      await closeDatabaseClient(database);
    });
  }

  await registerBasePlugins(app, env);
  await registerRootRoutes(app, env);
  await registerAuthRoutes(app, env, authService, auditService);
  await registerWorkspaceRoutes(app, authService, workspaceService);

  return app;
}
