import { expect, test, type Locator, type Page } from '@playwright/test';

const DEFAULT_PASSWORD = 'Secure123';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function eitherLocale(chinese: string, english: string) {
  return new RegExp(`^(?:${escapeRegex(chinese)}|${escapeRegex(english)})$`);
}

const DISPLAY_NAME_LABEL = eitherLocale('显示名称', 'Display Name');
const EMAIL_LABEL = eitherLocale('邮箱', 'Email');
const PASSWORD_LABEL = eitherLocale('密码', 'Password');
const CREATE_ACCOUNT_BUTTON = eitherLocale('创建账号', 'Create account');
const CONTINUE_BUTTON = eitherLocale('继续', 'Continue');
const APPS_WORKSPACE_NAME = eitherLocale('应用工作台', 'Apps workspace');
const WORKING_GROUP_LABEL = eitherLocale('工作群组', 'Working group');
const MESSAGE_LABEL = eitherLocale('消息', 'Message');
const SEND_MESSAGE_BUTTON = eitherLocale('发送消息', 'Send message');
const POLICY_WATCH_APP = eitherLocale('政策观察', 'Policy Watch');
const OPEN_APP_BUTTON = eitherLocale('打开应用', 'Open app');
const RUN_HISTORY_HEADING = eitherLocale('运行历史', 'Run history');
const POLICY_WATCH_PLACEHOLDER = eitherLocale(
  '让政策观察处理一些具体事项...',
  'Ask Policy Watch to work on something concrete...',
);

function uniqueEmail(prefix: string, domain = 'example.net') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@${domain}`;
}

function appCard(page: Page, appName: string | RegExp): Locator {
  return page.locator('article.app-card').filter({
    has: page.getByRole('heading', { name: appName }),
  });
}

async function waitForGatewayRequest(
  page: Page,
  method: 'POST',
  path: string,
) {
  await page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      response.url().includes(`/api/gateway${path}`),
    {
      timeout: 120_000,
    },
  );
}

async function register(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel(DISPLAY_NAME_LABEL).fill('Viewport Tester');
  await page.getByLabel(EMAIL_LABEL).fill(email);
  await page.getByLabel(PASSWORD_LABEL).fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayRequest(page, 'POST', '/auth/register'),
    page.getByRole('button', { name: CREATE_ACCOUNT_BUTTON }).click(),
  ]);
  await page.waitForURL(/\/login\?registered=1$/, { timeout: 5_000 }).catch(async () => {
    await page.waitForLoadState('networkidle').catch(() => {});
  });
}

async function login(page: Page, email: string) {
  await page
    .waitForURL(/\/login(?:\?|$)/, { timeout: 5_000 })
    .catch(async () => {
      if (!/\/login(?:\?|$)/.test(page.url())) {
        await page.goto('/login');
      }
    });
  await page.getByLabel(EMAIL_LABEL).fill(email);
  await page.getByLabel(PASSWORD_LABEL).fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayRequest(page, 'POST', '/auth/login'),
    page.getByRole('button', { name: CONTINUE_BUTTON }).click(),
  ]);
  await page
    .waitForURL(/\/(?:apps|auth\/mfa|auth\/pending)(?:\?|$)/, {
      timeout: 60_000,
    })
    .catch(async () => {
      await page.waitForLoadState('networkidle').catch(() => {});
    });
}

test('chat surface remains usable on narrow and tablet layouts', async ({ page }) => {
  test.slow();

  const email = uniqueEmail('viewport-tester');

  await register(page, email);
  await login(page, email);
  await expect(page.getByRole('heading', { name: APPS_WORKSPACE_NAME })).toBeVisible();
  await expect(page.getByLabel(WORKING_GROUP_LABEL)).toBeVisible({ timeout: 60_000 });

  await page.getByLabel(WORKING_GROUP_LABEL).selectOption('grp_research');
  await Promise.all([
    waitForGatewayRequest(page, 'POST', '/workspace/apps/launch'),
    appCard(page, POLICY_WATCH_APP).getByRole('button', { name: OPEN_APP_BUTTON }).click(),
  ]);
  await expect(page).toHaveURL(/\/chat\/conv_/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: POLICY_WATCH_APP })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel(MESSAGE_LABEL)).toBeVisible();
  await expect(page.getByRole('button', { name: SEND_MESSAGE_BUTTON })).toBeVisible();
  await expect(page.getByPlaceholder(POLICY_WATCH_PLACEHOLDER)).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole('heading', { name: RUN_HISTORY_HEADING })).toBeVisible();
});
