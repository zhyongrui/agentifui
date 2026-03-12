import { spawn } from 'node:child_process';
import { access, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PLAYWRIGHT_DEB_DIR = path.resolve('.cache/playwright-debs');
const PLAYWRIGHT_RUNTIME_DIR = path.resolve('.cache/playwright-runtime-libs');
const PLAYWRIGHT_LIB_DIR = path.join(
  PLAYWRIGHT_RUNTIME_DIR,
  'usr/lib/x86_64-linux-gnu'
);

const REQUIRED_PACKAGES = [
  'libatk1.0-0',
  'libatk-bridge2.0-0',
  'libatspi2.0-0',
  'libasound2',
  'libcairo2',
  'libcups2',
  'libgbm1',
  'libpango-1.0-0',
  'libwayland-server0',
  'libxdamage1',
  'libxkbcommon0',
];

const REQUIRED_LIBRARIES = [
  'libasound.so.2',
  'libatk-1.0.so.0',
  'libatk-bridge-2.0.so.0',
  'libatspi.so.0',
  'libcairo.so.2',
  'libcups.so.2',
  'libgbm.so.1',
  'libpango-1.0.so.0',
  'libwayland-server.so.0',
  'libXdamage.so.1',
  'libxkbcommon.so.0',
];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
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

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findDebForPackage(packageName) {
  const entries = await readdir(PLAYWRIGHT_DEB_DIR);
  return entries.find(entry => entry.startsWith(`${packageName}_`) && entry.endsWith('.deb')) ?? null;
}

async function hasRequiredLibraries() {
  for (const libraryName of REQUIRED_LIBRARIES) {
    if (!(await exists(path.join(PLAYWRIGHT_LIB_DIR, libraryName)))) {
      return false;
    }
  }

  return true;
}

async function ensureToolAvailable(command) {
  try {
    await run('bash', ['-lc', `command -v ${command}`], {
      stdio: 'ignore',
    });
  } catch {
    throw new Error(`Required tool "${command}" is not available in PATH.`);
  }
}

export async function ensurePlaywrightRuntime() {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    return null;
  }

  if (await hasRequiredLibraries()) {
    return PLAYWRIGHT_LIB_DIR;
  }

  await ensureToolAvailable('apt');
  await ensureToolAvailable('dpkg-deb');
  await mkdir(PLAYWRIGHT_DEB_DIR, {
    recursive: true,
  });
  await mkdir(PLAYWRIGHT_RUNTIME_DIR, {
    recursive: true,
  });

  for (const packageName of REQUIRED_PACKAGES) {
    const existingDeb = await findDebForPackage(packageName);

    if (!existingDeb) {
      await run('apt', ['download', packageName], {
        cwd: PLAYWRIGHT_DEB_DIR,
      });
    }
  }

  for (const packageName of REQUIRED_PACKAGES) {
    const debName = await findDebForPackage(packageName);

    if (!debName) {
      throw new Error(`Could not locate downloaded package for ${packageName}.`);
    }

    await run('dpkg-deb', ['-x', path.join(PLAYWRIGHT_DEB_DIR, debName), PLAYWRIGHT_RUNTIME_DIR]);
  }

  if (!(await hasRequiredLibraries())) {
    throw new Error('Playwright runtime libraries are still incomplete after extraction.');
  }

  return PLAYWRIGHT_LIB_DIR;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const runtimePath = await ensurePlaywrightRuntime();

  if (runtimePath) {
    console.log(runtimePath);
  }
}
