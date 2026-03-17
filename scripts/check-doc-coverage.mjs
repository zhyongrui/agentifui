import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

const repoRoot = new URL('..', import.meta.url);

const requiredFiles = [
  'docs/plans/PHASE2_EXECUTION_PLAN.md',
  'docs/dev-log/2026-03-17.md',
  'docs/dev-log/TEMPLATE.md',
  'docs/status/ENVIRONMENT_STATUS.md',
  'docs/RELEASE_STATE.md',
  'docs/guides/NEW_AI_SESSION_BOOTSTRAP.md',
  'docs/guides/P4-I_SESSION_CONTINUITY.md',
];

async function assertFileExists(relativePath) {
  const absolutePath = join(repoRoot.pathname, relativePath);
  await access(absolutePath, constants.R_OK);
}

async function assertPlanHasContinuitySection() {
  const plan = await readFile(
    join(repoRoot.pathname, 'docs/plans/PHASE2_EXECUTION_PLAN.md'),
    'utf8'
  );

  if (!plan.includes('Detailed Long-Range Checkbox Board')) {
    throw new Error('Execution plan is missing the long-range checkbox board.');
  }

  if (!plan.includes('P4-I-11')) {
    throw new Error('Execution plan is missing the documentation continuity queue.');
  }
}

async function assertReleaseStateMentionsMainPlan() {
  const releaseState = await readFile(
    join(repoRoot.pathname, 'docs/RELEASE_STATE.md'),
    'utf8'
  );

  if (!releaseState.includes('PHASE2_EXECUTION_PLAN.md')) {
    throw new Error('Release state document must reference the phase execution plan.');
  }
}

async function main() {
  for (const relativePath of requiredFiles) {
    await assertFileExists(relativePath);
  }

  await assertPlanHasContinuitySection();
  await assertReleaseStateMentionsMainPlan();

  process.stdout.write('docs coverage ok\n');
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
