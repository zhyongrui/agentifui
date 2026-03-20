import { spawn } from 'node:child_process';

const laneMap = {
  smoke: {
    description: 'minimal browser smoke for auth, launch, and core governance paths',
    specs: [
      'tests/e2e/phase1-flows.spec.ts',
      'tests/e2e/policy-governance-flows.spec.ts',
    ],
  },
  regression: {
    description: 'broad browser regression over the primary workspace and admin surfaces',
    specs: [
      'tests/e2e/phase1-flows.spec.ts',
      'tests/e2e/billing-flows.spec.ts',
      'tests/e2e/policy-governance-flows.spec.ts',
      'tests/e2e/provider-routing-flows.spec.ts',
      'tests/e2e/accessibility-device-flows.spec.ts',
    ],
  },
  long_run: {
    description: 'heavier browser flows that are slower or more integration-heavy',
    specs: [
      'tests/e2e/connectors-workflows.spec.ts',
      'tests/e2e/knowledge-flows.spec.ts',
      'tests/e2e/provider-routing-flows.spec.ts',
    ],
  },
  certification: {
    description: 'full production-like certification lane',
    specs: [
      'tests/e2e/accessibility-device-flows.spec.ts',
      'tests/e2e/billing-flows.spec.ts',
      'tests/e2e/connectors-workflows.spec.ts',
      'tests/e2e/knowledge-flows.spec.ts',
      'tests/e2e/phase1-flows.spec.ts',
      'tests/e2e/policy-governance-flows.spec.ts',
      'tests/e2e/provider-routing-flows.spec.ts',
    ],
  },
};

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/run-e2e-lane.mjs <lane> [--print] [playwright args...]',
      '',
      'Available lanes:',
      ...Object.entries(laneMap).map(
        ([lane, config]) => `- ${lane}: ${config.description}`
      ),
      '',
    ].join('\n')
  );
}

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

async function main() {
  const [lane, ...restArgs] = process.argv.slice(2);

  if (!lane || !(lane in laneMap)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const laneConfig = laneMap[lane];
  const printOnly = restArgs.includes('--print');
  const passthroughArgs = restArgs.filter(arg => arg !== '--print');

  if (printOnly) {
    process.stdout.write(
      JSON.stringify(
        {
          lane,
          description: laneConfig.description,
          specs: laneConfig.specs,
        },
        null,
        2
      ) + '\n'
    );
    return;
  }

  await run(process.execPath, ['scripts/run-e2e.mjs', ...laneConfig.specs, ...passthroughArgs]);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
