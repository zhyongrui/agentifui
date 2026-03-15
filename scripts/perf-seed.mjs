import { defaultArtifactPath, writeJsonArtifact } from './lib/perf-helpers.mjs';
import { readPerfConfig, seedPerfDataset } from './lib/perf-workspace.mjs';

async function main() {
  const config = readPerfConfig();
  const outputPath = process.env.PERF_SEED_OUTPUT?.trim() || defaultArtifactPath('perf-seed');
  const seed = await seedPerfDataset(config);
  const savedPath = await writeJsonArtifact(outputPath, seed);

  console.log(
    JSON.stringify(
      {
        outputPath: savedPath,
        seedId: seed.seedId,
        appId: seed.appId,
        activeGroupId: seed.activeGroupId,
        historyConversationId: seed.historyConversation.conversationId,
        latestRunId: seed.historyConversation.latestRunId,
        shareId: seed.historyConversation.shareId,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
