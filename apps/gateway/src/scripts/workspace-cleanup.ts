import {
  closeDatabaseClient,
  createDatabaseClient,
  migrateDatabase,
} from "@agentifui/db";

import { parseGatewayEnv } from "../config/env.js";
import { createPersistentAuditService } from "../services/persistent-audit-service.js";
import { runWorkspaceCleanup } from "../services/workspace-cleanup.js";

function readTenantId(args: string[], fallbackTenantId: string) {
  const tenantFlag = args.find((value) => value.startsWith("--tenant="));
  const tenantId = tenantFlag?.split("=")[1]?.trim();

  return tenantId || fallbackTenantId;
}

async function main() {
  const env = parseGatewayEnv(process.env);

  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required to run workspace cleanup.");
  }

  const mode = process.argv.includes("--execute") ? "execute" : "dry_run";
  const tenantId = readTenantId(process.argv.slice(2), env.defaultTenantId);
  const database = createDatabaseClient({
    connectionString: env.databaseUrl,
  });

  try {
    await migrateDatabase(database);

    const summary = await runWorkspaceCleanup({
      auditService: createPersistentAuditService(database),
      database,
      mode,
      tenantId,
      actorUserId: null,
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          mode,
          tenantId,
          summary,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await closeDatabaseClient(database);
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
