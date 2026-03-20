import { spawn } from 'node:child_process';

const certificationSteps = [
  {
    id: 'release_eval',
    command: 'npm',
    args: ['run', 'eval:release'],
    description: 'release evaluation gate for auth, workspace, admin, and safety surfaces',
  },
  {
    id: 'browser_certification',
    command: 'npm',
    args: ['run', 'test:e2e:certification'],
    description: 'production-like browser certification lane',
  },
  {
    id: 'backup_export',
    command: 'npm',
    args: ['run', 'backup:export'],
    description: 'backup export drill',
    optional: true,
    enabled: () => Boolean(process.env.DATABASE_URL?.trim()),
    skipReason: 'DATABASE_URL is not configured for backup export',
  },
  {
    id: 'backup_restore',
    command: 'npm',
    args: ['run', 'backup:restore'],
    description: 'backup restore drill',
    optional: true,
    enabled: () =>
      Boolean(process.env.DATABASE_URL?.trim()) &&
      Boolean(process.env.BACKUP_INPUT_DIR?.trim()),
    skipReason: 'DATABASE_URL or BACKUP_INPUT_DIR is not configured for backup restore',
  },
  {
    id: 'restore_route_verify',
    command: 'npm',
    args: ['run', 'ops:restore-routes'],
    description: 'post-restore route verification drill',
    optional: true,
    enabled: () =>
      Boolean(process.env.DATABASE_URL?.trim()) &&
      Boolean(process.env.BACKUP_INPUT_DIR?.trim()),
    skipReason: 'DATABASE_URL or BACKUP_INPUT_DIR is not configured for restore-route verification',
  },
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'null'}.`));
    });

    child.on('error', reject);
  });
}

function resolveSteps() {
  return certificationSteps.map(step => {
    const enabled = typeof step.enabled === 'function' ? step.enabled() : true;

    if (enabled) {
      return {
        ...step,
        willRun: true,
        skipReason: null,
      };
    }

    return {
      ...step,
      willRun: false,
    };
  });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const printOnly = args.has('--print');
  const requireBackup = args.has('--require-backup');
  const steps = resolveSteps();

  if (requireBackup) {
    const missingBackupStep = steps.find(step => step.optional && !step.willRun);

    if (missingBackupStep) {
      throw new Error(`Backup certification requirement not met: ${missingBackupStep.skipReason}`);
    }
  }

  if (printOnly) {
    process.stdout.write(
      JSON.stringify(
        steps.map(step => ({
          id: step.id,
          description: step.description,
          command: [step.command, ...step.args].join(' '),
          willRun: step.willRun,
          skipReason: step.willRun ? null : step.skipReason,
        })),
        null,
        2
      ) + '\n'
    );
    return;
  }

  for (const step of steps) {
    if (!step.willRun) {
      process.stdout.write(`[skip] ${step.id}: ${step.skipReason}\n`);
      continue;
    }

    process.stdout.write(`[run] ${step.id}: ${step.description}\n`);
    await run(step.command, step.args);
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
