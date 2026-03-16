import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');
const candidateTypeDirs = [
  resolve(appDir, '.next/types'),
  resolve(appDir, '.next/dev/types'),
];

for (const typesDir of candidateTypeDirs) {
  const source = resolve(typesDir, 'routes.d.ts');
  const target = resolve(typesDir, 'routes.ts');

  if (!existsSync(source)) {
    continue;
  }

  mkdirSync(dirname(target), {
    recursive: true,
  });
  copyFileSync(source, target);
}
