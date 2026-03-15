import {
  defaultArtifactPath,
  readJsonArtifact,
  runConcurrentSamples,
  summarizeSamples,
  writeJsonArtifact,
} from './lib/perf-helpers.mjs';
import {
  createCompletion,
  fetchAdminRoute,
  fetchRunList,
  fetchSharedConversation,
  fetchWorkspaceCatalog,
  launchConversation,
  login,
  readPerfConfig,
  seedPerfDataset,
} from './lib/perf-workspace.mjs';

const DEFAULT_BUDGETS = {
  'auth.login': { p95TargetMs: 4_000, errorRateTarget: 0 },
  'workspace.catalog': { p95TargetMs: 2_500, errorRateTarget: 0 },
  'workspace.launch': { p95TargetMs: 3_500, errorRateTarget: 0 },
  'chat.completion.fresh': { p95TargetMs: 6_000, errorRateTarget: 0 },
  'chat.completion.persisted_artifacts': { p95TargetMs: 7_000, errorRateTarget: 0 },
  'workspace.history.long': { p95TargetMs: 2_500, errorRateTarget: 0 },
  'workspace.run.replay': { p95TargetMs: 2_500, errorRateTarget: 0 },
  'workspace.share.read': { p95TargetMs: 2_500, errorRateTarget: 0 },
  'admin.audit.export.json': { p95TargetMs: 8_000, errorRateTarget: 0 },
};

function readSmokeConfig() {
  return {
    ...readPerfConfig(),
    iterations: Number.parseInt(process.env.PERF_ITERATIONS ?? '4', 10),
    concurrency: Number.parseInt(process.env.PERF_CONCURRENCY ?? '2', 10),
    enforceBudgets: process.env.PERF_ENFORCE_BUDGETS === '1',
    seedPath: process.env.PERF_SEED_INPUT?.trim() || '',
    seedOutputPath: process.env.PERF_SEED_OUTPUT?.trim() || defaultArtifactPath('perf-seed'),
    outputPath: process.env.PERF_OUTPUT?.trim() || defaultArtifactPath('perf-smoke'),
  };
}

async function loadOrCreateSeed(config) {
  if (config.seedPath) {
    return readJsonArtifact(config.seedPath);
  }

  const seed = await seedPerfDataset(config);
  await writeJsonArtifact(config.seedOutputPath, seed);
  return seed;
}

function extractScenarioTable(results) {
  return results.map((result) => ({
    name: result.name,
    p50Ms: result.p50Ms,
    p95Ms: result.p95Ms,
    errorCount: result.errorCount,
    budgetPassed: result.budget?.passed ?? true,
  }));
}

async function main() {
  const config = readSmokeConfig();
  const seed = await loadOrCreateSeed(config);
  const admin = await login(config.baseUrl, {
    email: config.adminEmail,
    password: config.password,
  });
  const member = await login(config.baseUrl, {
    email: config.memberEmail,
    password: config.password,
  });
  const viewer = await login(config.baseUrl, {
    email: config.viewerEmail,
    password: config.password,
  });
  const workspace = await fetchWorkspaceCatalog(config.baseUrl, member.sessionToken);
  const appId = seed.appId;
  const seededApp = workspace.apps.find((app) => app.id === appId) ?? null;
  const activeGroupId =
    seed.activeGroupId ||
    (seededApp?.grantedGroupIds.includes(workspace.defaultActiveGroupId)
      ? workspace.defaultActiveGroupId
      : seededApp?.grantedGroupIds[0]) ||
    workspace.groups[0]?.id;

  if (!appId || !activeGroupId) {
    throw new Error('Perf smoke could not resolve the seeded app/group context.');
  }

  const scenarios = [
    {
      name: 'auth.login',
      run: async () => {
        const payload = await login(config.baseUrl, {
          email: config.memberEmail,
          password: config.password,
        });

        return {
          userId: payload.user.id,
        };
      },
    },
    {
      name: 'workspace.catalog',
      run: async () => {
        const payload = await fetchWorkspaceCatalog(config.baseUrl, member.sessionToken);

        return {
          appCount: payload.apps.length,
          defaultActiveGroupId: payload.defaultActiveGroupId,
        };
      },
    },
    {
      name: 'workspace.launch',
      run: async () => {
        const payload = await launchConversation(config.baseUrl, member.sessionToken, {
          appId,
          activeGroupId,
        });

        return {
          conversationId: payload.conversationId,
          runId: payload.runId,
        };
      },
    },
    {
      name: 'chat.completion.fresh',
      run: async (sampleIndex) => {
        const launch = await launchConversation(config.baseUrl, member.sessionToken, {
          appId,
          activeGroupId,
        });
        const startedAt = Date.now();
        const payload = await createCompletion(config.baseUrl, member.sessionToken, {
          appId,
          conversationId: launch.conversationId,
          content: `[perf fresh ${sampleIndex + 1}] return one short sentence`,
        });

        return {
          durationMs: Date.now() - startedAt,
          conversationId: payload.conversation_id,
          runId: payload.metadata?.run_id ?? null,
          totalTokens: payload.usage?.total_tokens ?? null,
        };
      },
    },
    {
      name: 'chat.completion.persisted_artifacts',
      run: async (sampleIndex) => {
        const payload = await createCompletion(config.baseUrl, member.sessionToken, {
          appId,
          conversationId: seed.historyConversation.conversationId,
          content: `[perf replay ${sampleIndex + 1}] continue the seeded long-running policy conversation`,
        });

        return {
          conversationId: payload.conversation_id,
          runId: payload.metadata?.run_id ?? null,
          totalTokens: payload.usage?.total_tokens ?? null,
        };
      },
    },
    {
      name: 'workspace.history.long',
      run: () =>
        fetch(
          new URL(
            `/api/gateway/workspace/conversations?appId=${encodeURIComponent(appId)}&groupId=${encodeURIComponent(activeGroupId)}&limit=20`,
            `${config.baseUrl}/`,
          ).toString(),
          {
            headers: {
              authorization: `Bearer ${member.sessionToken}`,
            },
          },
        ).then((response) => fetchWorkspaceResponse('workspace history', response))
          .then((payload) => ({
            conversationCount: payload.data?.conversations?.length ?? 0,
          })),
    },
    {
      name: 'workspace.run.replay',
      run: () =>
        fetch(
          new URL(
            `/api/gateway/workspace/runs/${seed.historyConversation.latestRunId}`,
            `${config.baseUrl}/`,
          ).toString(),
          {
            headers: {
              authorization: `Bearer ${member.sessionToken}`,
            },
          },
        ).then((response) => fetchWorkspaceResponse('workspace run replay', response))
          .then((payload) => ({
            runId: payload.data?.run?.id ?? payload.data?.id ?? seed.historyConversation.latestRunId,
            status: payload.data?.run?.status ?? payload.data?.status ?? null,
          })),
    },
    {
      name: 'workspace.share.read',
      run: async () => {
        const payload = await fetchSharedConversation(
          config.baseUrl,
          viewer.sessionToken,
          seed.historyConversation.shareId,
        );

        return {
          conversationId: payload.conversation?.id ?? null,
          shareId: payload.share?.id ?? seed.historyConversation.shareId,
        };
      },
    },
    {
      name: 'admin.audit.export.json',
      run: async () => {
        const payload = await fetchAdminRoute(
          config.baseUrl,
          admin.sessionToken,
          '/api/gateway/admin/audit/export?format=json',
        );

        return {
          eventCount: payload.data?.eventCount ?? payload.data?.events?.length ?? null,
        };
      },
    },
  ];

  const results = [];

  for (const scenario of scenarios) {
    const samples = await runConcurrentSamples({
      iterations: config.iterations,
      concurrency: config.concurrency,
      execute: scenario.run,
    });
    results.push(summarizeSamples(scenario.name, samples, DEFAULT_BUDGETS[scenario.name]));
  }

  const sortedByP95 = [...results].sort((left, right) => right.p95Ms - left.p95Ms);
  const slowestScenario = sortedByP95[0] ?? null;
  const failedBudgets = results.filter((result) => result.budget && !result.budget.passed);
  const runListAfterSmoke = await fetchRunList(
    config.baseUrl,
    member.sessionToken,
    seed.historyConversation.conversationId,
  );

  const artifact = {
    generatedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    config: {
      iterations: config.iterations,
      concurrency: config.concurrency,
      enforceBudgets: config.enforceBudgets,
    },
    seed,
    scenarioTable: extractScenarioTable(results),
    slowestScenario,
    failedBudgets: failedBudgets.map((result) => ({
      name: result.name,
      budget: result.budget,
      p95Ms: result.p95Ms,
      errorRate: result.errorRate,
    })),
    postSmoke: {
      historyConversationRunCount: runListAfterSmoke.length,
    },
    results,
  };

  const savedPath = await writeJsonArtifact(config.outputPath, artifact);

  console.log(
    JSON.stringify(
      {
        outputPath: savedPath,
        slowestScenario: slowestScenario
          ? {
              name: slowestScenario.name,
              p95Ms: slowestScenario.p95Ms,
            }
          : null,
        failedBudgets: artifact.failedBudgets,
      },
      null,
      2,
    ),
  );

  if (config.enforceBudgets && failedBudgets.length > 0) {
    process.exitCode = 1;
  }
}

async function fetchWorkspaceResponse(label, response) {
  const payload = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    throw new Error(`${label} failed with ${response.status}: ${payload}`);
  }

  if (contentType.includes('application/json')) {
    return JSON.parse(payload);
  }

  return payload;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
