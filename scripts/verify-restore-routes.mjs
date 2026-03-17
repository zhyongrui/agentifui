import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import postgres from 'postgres';

import { getBackupInputDir } from './lib/backup-helpers.mjs';

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error('DATABASE_URL is required.');
  }

  return value;
}

async function maybeVerifyHttp(baseUrl, token, checks) {
  if (!baseUrl || !token) {
    return [];
  }

  const results = [];

  for (const check of checks) {
    const response = await fetch(`${baseUrl}${check.gatewayPath}`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    results.push({
      gatewayPath: check.gatewayPath,
      ok: response.ok,
      status: response.status,
    });
  }

  return results;
}

async function main() {
  const inputDir = getBackupInputDir();
  const manifestPath = path.join(inputDir, 'manifest.json');
  const restoreReportPath = path.join(inputDir, 'restore-report.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const restoreReport = JSON.parse(await readFile(restoreReportPath, 'utf8'));
  const sql = postgres(requireDatabaseUrl(), {
    max: 1,
    prepare: false,
  });

  try {
    const checks = [];
    const artifact = manifest.sanity?.artifact ?? null;
    const conversation = manifest.sanity?.conversation ?? null;
    const share = manifest.sanity?.share ?? null;

    if (conversation) {
      const [row] = await sql`
        select id
        from conversations
        where id = ${conversation.id}
      `;
      checks.push({
        kind: 'conversation',
        ok: Boolean(row),
        routePath: `/chat/${conversation.id}`,
        gatewayPath: `/api/gateway/workspace/conversations/${conversation.id}`,
      });
    }

    if (artifact) {
      const [row] = await sql`
        select id
        from workspace_artifacts
        where id = ${artifact.id}
      `;
      checks.push({
        kind: 'artifact',
        ok: Boolean(row),
        routePath: `/chat/artifacts/${artifact.id}?conversationId=${artifact.conversationId}&runId=${artifact.runId}`,
        gatewayPath: `/api/gateway/workspace/artifacts/${artifact.id}`,
      });
    }

    if (share) {
      const [row] = await sql`
        select id
        from workspace_conversation_shares
        where id = ${share.id}
      `;
      checks.push({
        kind: 'share',
        ok: Boolean(row),
        routePath: `/chat/shared/${share.id}`,
        gatewayPath: `/api/gateway/workspace/shares/${share.id}/conversation`,
      });

      if (artifact) {
        checks.push({
          kind: 'shared_artifact',
          ok: Boolean(row),
          routePath: `/chat/artifacts/${artifact.id}?shareId=${share.id}&shareAccess=read_only`,
          gatewayPath: `/api/gateway/workspace/shares/${share.id}/artifacts/${artifact.id}`,
        });
      }
    }

    const httpChecks = await maybeVerifyHttp(
      process.env.APP_BASE_URL?.trim(),
      process.env.AUTH_BEARER_TOKEN?.trim(),
      checks,
    );
    const report = {
      generatedAt: new Date().toISOString(),
      inputDir,
      manifestPath,
      restoreReportPath,
      restoreSanityFailures: restoreReport.sanityFailures ?? [],
      checks,
      httpChecks,
    };

    await mkdir(path.join(inputDir, 'verification'), { recursive: true });
    const outputPath = path.join(inputDir, 'verification', 'route-verification.json');
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ outputPath, checks: checks.length, httpChecks: httpChecks.length }, null, 2));

    if (checks.some((check) => !check.ok) || httpChecks.some((check) => !check.ok)) {
      throw new Error('Restore route verification failed.');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
