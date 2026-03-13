import { chromium } from '@playwright/test';

import { ensurePlaywrightRuntime } from './prepare-playwright-runtime.mjs';

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function normalizeBaseUrl(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function buildUrl(baseUrl, path) {
  return new URL(path, `${baseUrl}/`).toString();
}

async function waitForAnyLocator(page, locators, timeout = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    for (const locator of locators) {
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }

    await page.waitForTimeout(250);
  }

  throw new Error('Timed out waiting for any expected browser smoke locator.');
}

async function main() {
  const baseUrl = normalizeBaseUrl(requireEnv('PUBLIC_BASE_URL'));
  const email = requireEnv('PUBLIC_SMOKE_EMAIL');
  const password = requireEnv('PUBLIC_SMOKE_PASSWORD');
  const appsPath = process.env.PUBLIC_SMOKE_APPS_PATH?.trim() || '/apps';
  const chatPath = process.env.PUBLIC_SMOKE_CHAT_PATH?.trim() || '/chat';
  const headless = process.env.PUBLIC_SMOKE_HEADLESS !== 'false';
  const runtimeLibDir = await ensurePlaywrightRuntime();

  if (runtimeLibDir) {
    process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
      ? `${runtimeLibDir}:${process.env.LD_LIBRARY_PATH}`
      : runtimeLibDir;
  }

  const browser = await chromium.launch({
    headless,
    args: ['--no-proxy-server'],
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(buildUrl(baseUrl, '/login'), {
      waitUntil: 'networkidle',
    });

    await page.getByRole('heading', { name: 'Login' }).waitFor({ timeout: 30_000 });
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);

    await Promise.all([
      page.waitForURL(url => !url.pathname.endsWith('/login'), {
        timeout: 30_000,
      }),
      page.getByRole('button', { name: /^Continue$/ }).click(),
    ]);

    const currentUrl = new URL(page.url());

    if (currentUrl.pathname === '/auth/mfa') {
      throw new Error(
        'The browser smoke account requires MFA. Use a non-MFA smoke account or complete MFA manually.'
      );
    }

    if (currentUrl.pathname === '/auth/pending') {
      throw new Error(
        'The browser smoke account is pending approval. Use an active account for public browser smoke.'
      );
    }

    await page.goto(buildUrl(baseUrl, appsPath), {
      waitUntil: 'networkidle',
    });
    await page.getByRole('heading', { name: 'Apps workspace' }).waitFor({ timeout: 30_000 });

    await page.goto(buildUrl(baseUrl, chatPath), {
      waitUntil: 'networkidle',
    });

    await waitForAnyLocator(page, [
      page.getByRole('heading', { name: 'Conversation history' }),
      page.getByRole('heading', { name: 'Run history' }),
    ]);

    console.log(
      JSON.stringify(
        {
          baseUrl,
          appsPath,
          chatPath,
          loginPath: currentUrl.pathname,
          finalPath: new URL(page.url()).pathname,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
