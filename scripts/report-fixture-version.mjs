import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const filePath = path.resolve('config', 'test-fixture-version.json');
  const payload = JSON.parse(await readFile(filePath, 'utf8'));

  console.log(
    JSON.stringify(
      {
        ...payload,
        filePath,
        generatedAt: new Date().toISOString(),
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
