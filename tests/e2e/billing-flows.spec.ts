import { expect, test, type Locator, type Page } from "@playwright/test";

const DEFAULT_PASSWORD = "Secure123";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function eitherLocale(chinese: string, english: string) {
  return new RegExp(`^(?:${escapeRegex(chinese)}|${escapeRegex(english)})$`);
}

const DISPLAY_NAME_LABEL = eitherLocale("显示名称", "Display Name");
const EMAIL_LABEL = eitherLocale("邮箱", "Email");
const PASSWORD_LABEL = eitherLocale("密码", "Password");
const CREATE_ACCOUNT_BUTTON = eitherLocale("创建账号", "Create account");
const CONTINUE_BUTTON = eitherLocale("继续", "Continue");
const ADMIN_PREVIEW_LINK = eitherLocale("管理预览", "Admin preview");
const BILLING_LINK = eitherLocale("计费", "Billing");
const APPS_WORKSPACE_NAME = eitherLocale("应用工作台", "Apps workspace");
const SAVE_PLAN_BUTTON = eitherLocale("保存计划", "Save plan");
const MONTHLY_LIMIT_LABEL = eitherLocale("月度额度", "Monthly credits");
const SERVICE_COPILOT_APP = eitherLocale("服务副驾", "Service Copilot");
const HARD_STOP_NOTICE = /^(当前租户已触发计费硬停，新启动会被阻止|Billing hard stop is active\. New launches remain blocked\.)/;

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.net`;
}

function appCard(page: Page, appName: string | RegExp): Locator {
  return page.locator("article.app-card").filter({
    has: page.getByRole("heading", { name: appName }),
  });
}

async function waitForGatewayRequest(
  page: Page,
  method: "POST" | "PUT",
  pathFragment: string,
) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      response.url().includes(`/api/gateway${pathFragment}`),
    {
      timeout: 120_000,
    },
  );
}

async function register(page: Page, email: string, displayName: string) {
  await page.goto("/register");
  await page.getByLabel(DISPLAY_NAME_LABEL).fill(displayName);
  await page.getByLabel(EMAIL_LABEL).fill(email);
  await page.getByLabel(PASSWORD_LABEL).fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayRequest(page, "POST", "/auth/register"),
    page.getByRole("button", { name: CREATE_ACCOUNT_BUTTON }).click(),
  ]);
  await page.waitForURL(/\/login\?registered=1$/, { timeout: 10_000 });
}

async function login(page: Page, email: string) {
  await page.getByLabel(EMAIL_LABEL).fill(email);
  await page.getByLabel(PASSWORD_LABEL).fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayRequest(page, "POST", "/auth/login"),
    page.getByRole("button", { name: CONTINUE_BUTTON }).click(),
  ]);
  await page.waitForURL(/\/apps(?:\?|$)/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: APPS_WORKSPACE_NAME })).toBeVisible({
    timeout: 60_000,
  });
}

test("billing overrides surface hard-stop warnings in the workspace", async ({ page }) => {
  const email = uniqueEmail("admin-billing");

  await register(page, email, "Billing Browser");
  await login(page, email);

  await page.getByRole("link", { name: ADMIN_PREVIEW_LINK }).click();
  await page.getByRole("link", { name: BILLING_LINK }).click();
  await expect(page).toHaveURL(/\/admin\/billing$/);

  const billingCard = page.locator("article.admin-card").first();
  await billingCard.getByLabel(MONTHLY_LIMIT_LABEL).fill("1");
  await Promise.all([
    waitForGatewayRequest(page, "PUT", "/admin/billing/tenants/"),
    billingCard.getByRole("button", { name: SAVE_PLAN_BUTTON }).click(),
  ]);
  await expect(page.locator(".notice.success")).toBeVisible();

  await page.goto("/apps");
  await expect(page.getByRole("heading", { name: APPS_WORKSPACE_NAME })).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/gateway/workspace/apps/launch"),
      { timeout: 120_000 },
    ),
    appCard(page, SERVICE_COPILOT_APP)
      .getByRole("button", { name: /^(Open app|打开应用)$/ })
      .click(),
  ]);

  await expect(page).toHaveURL(/\/chat\/conv_/, { timeout: 20_000 });
  await page.goto("/apps");
  await expect(page.getByText(HARD_STOP_NOTICE)).toBeVisible({ timeout: 20_000 });
});
