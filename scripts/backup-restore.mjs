import { restoreBackupSnapshot } from './lib/backup-helpers.mjs';

async function main() {
  const result = await restoreBackupSnapshot();

  if (result.restoreReport.mismatchedTables.length > 0) {
    throw new Error(
      `Restore verification failed for tables: ${result.restoreReport.mismatchedTables.join(', ')}`
    );
  }

  if (result.restoreReport.sanityFailures.length > 0) {
    throw new Error(
      `Restore sanity verification failed for checks: ${result.restoreReport.sanityFailures.join(', ')}`
    );
  }

  console.log(
    JSON.stringify(
      {
        inputDir: result.inputDir,
        reportPath: result.reportPath,
        restoredAt: result.restoreReport.restoredAt,
        restoredTableCount: Object.keys(result.restoreReport.restoredCounts).length,
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
