import 'dotenv/config';

import {
  createDatabaseClient,
  migrateDatabase,
  resetDatabase,
} from '../runtime.js';

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required to reset the database.');
  }

  const resetClient = createDatabaseClient({
    connectionString,
  });

  try {
    await resetDatabase(resetClient);
  } finally {
    await resetClient.end({ timeout: 5 });
  }

  const migrateClient = createDatabaseClient({
    connectionString,
  });

  try {
    await migrateDatabase(migrateClient);
  } finally {
    await migrateClient.end({ timeout: 5 });
  }
}

void main();
