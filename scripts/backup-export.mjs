import { exportBackupSnapshot } from './lib/backup-helpers.mjs';

async function main() {
  const result = await exportBackupSnapshot();

  console.log(
    JSON.stringify(
      {
        outputDir: result.outputDir,
        manifestPath: result.manifestPath,
        sqlPath: result.sqlPath,
        exportedAt: result.manifest.exportedAt,
        tableCount: result.manifest.tables.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
