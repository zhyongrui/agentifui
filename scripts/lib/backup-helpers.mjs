import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import postgres from 'postgres';

import { writeJsonArtifact } from './perf-helpers.mjs';

const BACKUP_TABLES = [
  'tenants',
  'groups',
  'users',
  'group_members',
  'auth_identities',
  'invitations',
  'mfa_factors',
  'audit_events',
  'auth_sessions',
  'auth_challenges',
  'better_auth_accounts',
  'better_auth_sessions',
  'better_auth_verifications',
  'rbac_roles',
  'rbac_user_roles',
  'workspace_apps',
  'workspace_app_access_grants',
  'workspace_group_app_grants',
  'workspace_app_tool_overrides',
  'workspace_user_preferences',
  'workspace_quota_limits',
  'conversations',
  'runs',
  'run_timeline_events',
  'workspace_uploaded_files',
  'workspace_artifacts',
  'knowledge_sources',
  'knowledge_source_chunks',
  'workspace_app_launches',
  'workspace_conversation_shares',
];

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error('DATABASE_URL is required.');
  }

  return value;
}

function buildDefaultBackupDir() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve('artifacts', 'backups', `backup-${timestamp}`);
}

function getBackupOutputDir() {
  return path.resolve(process.env.BACKUP_OUTPUT_DIR?.trim() || buildDefaultBackupDir());
}

function getBackupInputDir() {
  const value = process.env.BACKUP_INPUT_DIR?.trim();

  if (!value) {
    throw new Error('BACKUP_INPUT_DIR is required for restore.');
  }

  return path.resolve(value);
}

function getUploadsDir() {
  const configured = process.env.GATEWAY_UPLOADS_DIR?.trim();

  return configured ? path.resolve(configured) : null;
}

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
      cwd: options.cwd ?? process.cwd(),
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function createSqlClient() {
  return postgres(requireDatabaseUrl(), {
    max: 1,
    prepare: false,
  });
}

async function readTableCounts() {
  const database = await createSqlClient();

  try {
    const entries = await Promise.all(
      BACKUP_TABLES.map(async (tableName) => {
        const [row] = await database.unsafe(`select count(*)::int as count from ${tableName}`);
        return [tableName, row?.count ?? 0];
      }),
    );

    return Object.fromEntries(entries);
  } finally {
    await database.end({ timeout: 5 });
  }
}

async function collectSanitySamples() {
  const database = await createSqlClient();

  try {
    const [conversation] = await database`
      select
        id,
        user_id as "userId",
        app_id as "appId",
        active_group_id as "activeGroupId",
        title
      from conversations
      order by (
        exists(
          select 1
          from workspace_conversation_shares
          where conversation_id = conversations.id
            and status = 'active'
        )
      ) desc, updated_at desc
      limit 1
    `;
    const [latestAudit] = await database`
      select
        id,
        action
      from audit_events
      order by occurred_at desc
      limit 1
    `;
    const [quota] = await database`
      select
        id,
        scope,
        scope_id as "scopeId",
        monthly_limit as "monthlyLimit",
        base_used as "baseUsed"
      from workspace_quota_limits
      order by updated_at desc
      limit 1
    `;
    const [upload] = await database`
      select
        id,
        conversation_id as "conversationId",
        storage_key as "storageKey",
        file_name as "fileName"
      from workspace_uploaded_files
      order by created_at desc
      limit 1
    `;

    let latestRun = null;
    let artifact = null;
    let share = null;
    let runCount = 0;
    let artifactCount = 0;
    let timelineCount = 0;

    if (conversation) {
      const [runCountRow] = await database`
        select count(*)::int as count
        from runs
        where conversation_id = ${conversation.id}
      `;
      const [artifactCountRow] = await database`
        select count(*)::int as count
        from workspace_artifacts
        where conversation_id = ${conversation.id}
      `;
      const [timelineCountRow] = await database`
        select count(*)::int as count
        from run_timeline_events
        where conversation_id = ${conversation.id}
      `;
      const [latestRunRow] = await database`
        select
          id,
          status,
          trace_id as "traceId"
        from runs
        where conversation_id = ${conversation.id}
        order by created_at desc
        limit 1
      `;
      const [artifactRow] = await database`
        select
          id,
          conversation_id as "conversationId",
          run_id as "runId",
          title,
          kind
        from workspace_artifacts
        where conversation_id = ${conversation.id}
        order by created_at desc, sequence desc
        limit 1
      `;
      const [shareRow] = await database`
        select
          id,
          conversation_id as "conversationId",
          status,
          shared_group_id as "sharedGroupId"
        from workspace_conversation_shares
        where conversation_id = ${conversation.id}
          and status = 'active'
        order by created_at desc
        limit 1
      `;

      runCount = runCountRow?.count ?? 0;
      artifactCount = artifactCountRow?.count ?? 0;
      timelineCount = timelineCountRow?.count ?? 0;
      latestRun = latestRunRow ?? null;
      artifact = artifactRow ?? null;
      share = shareRow ?? null;
    }

    return {
      conversation: conversation
        ? {
            ...conversation,
            runCount,
            artifactCount,
            timelineCount,
          }
        : null,
      latestRun,
      artifact,
      share,
      latestAudit: latestAudit ?? null,
      quota: quota ?? null,
      upload: upload ?? null,
    };
  } finally {
    await database.end({ timeout: 5 });
  }
}

async function verifyRestoreSanity(manifest, uploadsDir) {
  const database = await createSqlClient();

  try {
    const checks = [];
    const sanity = manifest.sanity ?? {};

    if (sanity.conversation) {
      const [conversation] = await database`
        select
          id,
          user_id as "userId",
          app_id as "appId"
        from conversations
        where id = ${sanity.conversation.id}
      `;
      const [runCountRow] = await database`
        select count(*)::int as count
        from runs
        where conversation_id = ${sanity.conversation.id}
      `;
      const [artifactCountRow] = await database`
        select count(*)::int as count
        from workspace_artifacts
        where conversation_id = ${sanity.conversation.id}
      `;
      const [timelineCountRow] = await database`
        select count(*)::int as count
        from run_timeline_events
        where conversation_id = ${sanity.conversation.id}
      `;
      const ok =
        Boolean(conversation) &&
        conversation.userId === sanity.conversation.userId &&
        conversation.appId === sanity.conversation.appId &&
        (runCountRow?.count ?? 0) >= sanity.conversation.runCount &&
        (artifactCountRow?.count ?? 0) >= sanity.conversation.artifactCount &&
        (timelineCountRow?.count ?? 0) >= sanity.conversation.timelineCount;

      checks.push({
        name: 'conversation_replay',
        ok,
        sample: sanity.conversation,
        observed: {
          runCount: runCountRow?.count ?? 0,
          artifactCount: artifactCountRow?.count ?? 0,
          timelineCount: timelineCountRow?.count ?? 0,
        },
      });
    }

    if (sanity.latestRun) {
      const [run] = await database`
        select
          id,
          conversation_id as "conversationId",
          status,
          trace_id as "traceId"
        from runs
        where id = ${sanity.latestRun.id}
      `;
      const ok =
        Boolean(run) &&
        run.conversationId === sanity.conversation?.id &&
        run.status === sanity.latestRun.status &&
        run.traceId === sanity.latestRun.traceId;

      checks.push({
        name: 'latest_run',
        ok,
        sample: sanity.latestRun,
      });
    }

    if (sanity.artifact) {
      const [artifact] = await database`
        select
          id,
          conversation_id as "conversationId",
          run_id as "runId",
          title,
          kind
        from workspace_artifacts
        where id = ${sanity.artifact.id}
      `;
      const ok =
        Boolean(artifact) &&
        artifact.conversationId === sanity.artifact.conversationId &&
        artifact.runId === sanity.artifact.runId &&
        artifact.title === sanity.artifact.title &&
        artifact.kind === sanity.artifact.kind;

      checks.push({
        name: 'artifact_linkage',
        ok,
        sample: sanity.artifact,
      });
    }

    if (sanity.share) {
      const [share] = await database`
        select
          id,
          conversation_id as "conversationId",
          status,
          shared_group_id as "sharedGroupId"
        from workspace_conversation_shares
        where id = ${sanity.share.id}
      `;
      const ok =
        Boolean(share) &&
        share.conversationId === sanity.share.conversationId &&
        share.status === sanity.share.status &&
        share.sharedGroupId === sanity.share.sharedGroupId;

      checks.push({
        name: 'share_link',
        ok,
        sample: sanity.share,
      });
    }

    if (sanity.latestAudit) {
      const [audit] = await database`
        select
          id,
          action
        from audit_events
        where id = ${sanity.latestAudit.id}
      `;
      const ok = Boolean(audit) && audit.action === sanity.latestAudit.action;

      checks.push({
        name: 'audit_row',
        ok,
        sample: sanity.latestAudit,
      });
    }

    if (sanity.quota) {
      const [quota] = await database`
        select
          id,
          scope,
          scope_id as "scopeId",
          monthly_limit as "monthlyLimit",
          base_used as "baseUsed"
        from workspace_quota_limits
        where id = ${sanity.quota.id}
      `;
      const ok =
        Boolean(quota) &&
        quota.scope === sanity.quota.scope &&
        quota.scopeId === sanity.quota.scopeId &&
        quota.monthlyLimit === sanity.quota.monthlyLimit &&
        quota.baseUsed === sanity.quota.baseUsed;

      checks.push({
        name: 'quota_snapshot',
        ok,
        sample: sanity.quota,
      });
    }

    if (sanity.upload) {
      const [upload] = await database`
        select
          id,
          conversation_id as "conversationId",
          storage_key as "storageKey",
          file_name as "fileName"
        from workspace_uploaded_files
        where id = ${sanity.upload.id}
      `;
      let storageFilePresent = null;

      if (uploadsDir) {
        try {
          await stat(path.join(uploadsDir, sanity.upload.storageKey));
          storageFilePresent = true;
        } catch {
          storageFilePresent = false;
        }
      }

      const ok =
        Boolean(upload) &&
        upload.conversationId === sanity.upload.conversationId &&
        upload.storageKey === sanity.upload.storageKey &&
        upload.fileName === sanity.upload.fileName &&
        (storageFilePresent === null || storageFilePresent === true);

      checks.push({
        name: 'uploaded_file',
        ok,
        sample: sanity.upload,
        observed: {
          storageFilePresent,
        },
      });
    }

    return {
      checks,
      failures: checks.filter(check => !check.ok).map(check => check.name),
    };
  } finally {
    await database.end({ timeout: 5 });
  }
}

async function computeSha256(filePath) {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

async function copyUploadsSnapshot(sourceDir, backupDir) {
  try {
    const sourceStats = await stat(sourceDir);

    if (!sourceStats.isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }

  const targetDir = path.join(backupDir, 'uploads');
  await mkdir(path.dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });

  return targetDir;
}

async function countFilesRecursive(targetPath) {
  const targetStats = await stat(targetPath);

  if (targetStats.isFile()) {
    return 1;
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    const childPath = path.join(targetPath, entry.name);
    count += entry.isDirectory() ? await countFilesRecursive(childPath) : 1;
  }

  return count;
}

async function exportBackupSnapshot() {
  const databaseUrl = requireDatabaseUrl();
  const outputDir = getBackupOutputDir();
  const uploadsDir = getUploadsDir();
  const sqlPath = path.join(outputDir, 'backup.sql');

  await mkdir(outputDir, { recursive: true });
  await runCommand(process.env.PG_DUMP_BIN?.trim() || 'pg_dump', [
    databaseUrl,
    '--data-only',
    '--no-owner',
    '--no-privileges',
    '--column-inserts',
    '--file',
    sqlPath,
    ...BACKUP_TABLES.flatMap(tableName => ['--table', tableName]),
  ]);

  const rowCounts = await readTableCounts();
  const sanity = await collectSanitySamples();
  const sqlSha256 = await computeSha256(sqlPath);
  const uploadsSnapshotDir = uploadsDir ? await copyUploadsSnapshot(uploadsDir, outputDir) : null;
  const manifest = {
    exportedAt: new Date().toISOString(),
    tables: BACKUP_TABLES,
    rowCounts,
    sanity,
    sql: {
      fileName: path.basename(sqlPath),
      sha256: sqlSha256,
    },
    uploads:
      uploadsSnapshotDir
        ? {
            sourceDir: uploadsDir,
            backupDirName: path.basename(uploadsSnapshotDir),
            fileCount: await countFilesRecursive(uploadsSnapshotDir),
          }
        : null,
  };
  const manifestPath = await writeJsonArtifact(path.join(outputDir, 'manifest.json'), manifest);

  return {
    manifest,
    manifestPath,
    outputDir,
    sqlPath,
  };
}

async function restoreBackupSnapshot() {
  const inputDir = getBackupInputDir();
  const databaseUrl = requireDatabaseUrl();
  const uploadsDir = getUploadsDir();
  const manifestPath = path.join(inputDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const sqlPath = path.join(inputDir, manifest.sql.fileName);

  await runCommand('npm', ['run', 'db:reset'], {
    cwd: path.resolve('.'),
  });
  await runCommand(process.env.PSQL_BIN?.trim() || 'psql', [
    databaseUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    sqlPath,
  ]);

  if (manifest.uploads && uploadsDir) {
    await rm(uploadsDir, { recursive: true, force: true });
    await mkdir(path.dirname(uploadsDir), { recursive: true });
    await cp(path.join(inputDir, manifest.uploads.backupDirName), uploadsDir, { recursive: true });
  }

  const restoredCounts = await readTableCounts();
  const restoreSanity = await verifyRestoreSanity(manifest, uploadsDir);
  const mismatchedTables = BACKUP_TABLES.filter(
    tableName => restoredCounts[tableName] !== manifest.rowCounts[tableName],
  );
  const restoreReport = {
    restoredAt: new Date().toISOString(),
    manifestPath,
    sqlPath,
    restoredCounts,
    mismatchedTables,
    sanityChecks: restoreSanity.checks,
    sanityFailures: restoreSanity.failures,
  };
  const reportPath = await writeJsonArtifact(path.join(inputDir, 'restore-report.json'), restoreReport);

  return {
    inputDir,
    manifest,
    reportPath,
    restoreReport,
  };
}

export {
  BACKUP_TABLES,
  exportBackupSnapshot,
  getBackupInputDir,
  getBackupOutputDir,
  getUploadsDir,
  restoreBackupSnapshot,
};
