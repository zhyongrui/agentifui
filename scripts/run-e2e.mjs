import { spawn } from 'node:child_process';

import { ensurePlaywrightRuntime } from './prepare-playwright-runtime.mjs';

const DATABASE_URL = 'postgresql://agentifui:agentifui@localhost:5432/agentifui';
const GATEWAY_PORT = '4111';
const WEB_PORT = '3111';
const BETTER_AUTH_SECRET = 'agentifui-e2e-super-secret-1234567890';
const GATEWAY_SSO_DOMAINS = 'iflabx.com=iflabx-sso';

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

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function waitForOk(url, timeoutMs = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // Ignore transient startup errors.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${url} to return 2xx.`);
}

function startServer(command, args, env) {
  return spawn(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env,
    },
  });
}

function createPlaywrightEnv(runtimeLibDir) {
  const env = {
    ...process.env,
    PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${WEB_PORT}`,
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    ALL_PROXY: '',
    http_proxy: '',
    https_proxy: '',
    all_proxy: '',
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
  };

  if (runtimeLibDir) {
    env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
      ? `${runtimeLibDir}:${env.LD_LIBRARY_PATH}`
      : runtimeLibDir;
  }

  return env;
}

async function stopServer(child) {
  if (!child || child.killed) {
    return;
  }

  child.kill('SIGTERM');

  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
      resolve();
    }, 5_000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main() {
  const gateway = null;
  const web = null;
  let gatewayChild = gateway;
  let webChild = web;
  const runtimeLibDir = await ensurePlaywrightRuntime();

  try {
    await run('npm', ['run', 'build']);
    await run('npm', ['run', 'db:reset'], {
      env: {
        ...process.env,
        DATABASE_URL,
      },
    });

    gatewayChild = startServer(
      'npm',
      ['run', 'start', '--workspace', '@agentifui/gateway'],
      {
        DATABASE_URL,
        GATEWAY_PORT,
        BETTER_AUTH_SECRET,
        GATEWAY_SSO_DOMAINS,
      }
    );

    await waitForOk(`http://127.0.0.1:${GATEWAY_PORT}/health`);

    webChild = startServer('npm', ['run', 'start', '--workspace', '@agentifui/web'], {
      PORT: WEB_PORT,
      GATEWAY_INTERNAL_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
    });

    await waitForOk(`http://127.0.0.1:${WEB_PORT}/login`);

    await run('npx', ['playwright', 'test'], {
      env: createPlaywrightEnv(runtimeLibDir),
    });
  } finally {
    await Promise.all([stopServer(webChild), stopServer(gatewayChild)]);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
