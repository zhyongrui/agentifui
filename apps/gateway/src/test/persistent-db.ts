import {
  closeDatabaseClient,
  createDatabaseClient,
  ensureTenant,
  migrateDatabase,
  resetDatabase,
  type DatabaseClient,
} from '@agentifui/db';

import type { GatewayEnv } from '../config/env.js';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://agentifui:agentifui@localhost:5432/agentifui';

const PERSISTENT_TEST_ENV: GatewayEnv = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 4000,
  corsOrigin: true,
  databaseUrl: TEST_DATABASE_URL,
  ssoDomainMap: {
    'iflabx.com': 'iflabx-sso',
  },
  defaultTenantId: 'tenant-dev',
  defaultSsoUserStatus: 'pending',
  authLockoutThreshold: 5,
  authLockoutDurationMs: 1800000,
};

function createPersistentTestDatabase(): DatabaseClient {
  return createDatabaseClient({
    connectionString: TEST_DATABASE_URL,
  });
}

async function resetPersistentTestDatabase() {
  const database = createPersistentTestDatabase();

  try {
    await resetDatabase(database);
    await migrateDatabase(database);
    await ensureTenant(database, {
      tenantId: PERSISTENT_TEST_ENV.defaultTenantId,
    });
  } finally {
    await closeDatabaseClient(database);
  }
}

export {
  PERSISTENT_TEST_ENV,
  TEST_DATABASE_URL,
  createPersistentTestDatabase,
  resetPersistentTestDatabase,
};
