import 'dotenv/config';

import { createDatabaseClient, ensureTenant, migrateDatabase } from '../runtime.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const defaultTenantId = process.env.GATEWAY_DEFAULT_TENANT_ID ?? 'dev-tenant';

  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run database migrations.');
  }

  const database = createDatabaseClient({
    connectionString,
  });

  try {
    await migrateDatabase(database);
    await ensureTenant(database, {
      tenantId: defaultTenantId,
    });
  } finally {
    await database.end({ timeout: 5 });
  }
}

void main();
