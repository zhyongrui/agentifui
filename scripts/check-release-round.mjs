import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const repoRoot = new URL('..', import.meta.url);
const zeroRevisionPattern = /^0+$/;

const codePatterns = [
  /^apps\//,
  /^packages\//,
  /^scripts\//,
  /^\.github\/workflows\//,
  /^package\.json$/,
  /^turbo\.json$/,
  /^tsconfig(\..+)?\.json$/,
];
const planPatterns = [/^docs\/plans\//, /^docs\/RELEASE_STATE\.md$/];
const guidePatterns = [/^docs\/guides\//];
const devLogPattern = /^docs\/dev-log\/(?!README\.md$|TEMPLATE\.md$).+\.md$/;

function parseArgs(argv) {
  const args = {
    base: null,
    head: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--base') {
      args.base = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (token === '--head') {
      args.head = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return args;
}

async function isResolvableRevision(revision) {
  if (!revision || zeroRevisionPattern.test(revision)) {
    return false;
  }

  try {
    await execFile('git', ['rev-parse', '--verify', revision], {
      cwd: repoRoot.pathname,
    });
    return true;
  } catch {
    return false;
  }
}

async function readChangedFiles(input) {
  if (input.base && input.head) {
    const baseAvailable = await isResolvableRevision(input.base);
    const headAvailable = await isResolvableRevision(input.head);

    if (!baseAvailable || !headAvailable) {
      process.stdout.write('release round check skipped: diff base is unavailable\n');
      return [];
    }

    const { stdout } = await execFile('git', ['diff', '--name-only', `${input.base}..${input.head}`], {
      cwd: repoRoot.pathname,
    });

    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const { stdout } = await execFile('git', ['diff', '--name-only', 'HEAD'], {
    cwd: repoRoot.pathname,
  });
  const { stdout: untrackedStdout } = await execFile(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    {
      cwd: repoRoot.pathname,
    }
  );

  return [
    ...stdout.split('\n'),
    ...untrackedStdout.split('\n'),
  ]
    .map((line) => line.trim())
    .filter(Boolean);
}

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const changedFiles = await readChangedFiles(args);

  if (changedFiles.length === 0) {
    process.stdout.write('release round check skipped: no changed files detected\n');
    return;
  }

  const implementationFiles = changedFiles.filter((path) => matchesAny(path, codePatterns));

  if (implementationFiles.length === 0) {
    process.stdout.write('release round check skipped: no implementation changes detected\n');
    return;
  }

  const hasPlanUpdate = changedFiles.some((path) => matchesAny(path, planPatterns));
  const hasGuideUpdate = changedFiles.some((path) => matchesAny(path, guidePatterns));
  const hasDevLogUpdate = changedFiles.some((path) => devLogPattern.test(path));
  const missing = [];

  if (!hasPlanUpdate) {
    missing.push('plan/release-state update');
  }

  if (!hasGuideUpdate) {
    missing.push('guide update');
  }

  if (!hasDevLogUpdate) {
    missing.push('dev-log entry');
  }

  if (missing.length > 0) {
    throw new Error(
      [
        'Release round check failed.',
        `Implementation files changed: ${implementationFiles.join(', ')}`,
        `Missing required updates: ${missing.join(', ')}`,
      ].join('\n')
    );
  }

  process.stdout.write('release round check ok\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
