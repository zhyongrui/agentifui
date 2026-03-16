import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');
const typesDir = resolve(appDir, '.next/types');
const source = resolve(typesDir, 'routes.d.ts');
const target = resolve(typesDir, 'routes.ts');

if (existsSync(source)) {
  copyFileSync(source, target);
}
