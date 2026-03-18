import { expect, test, type Page } from "@playwright/test";

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
const APPS_WORKSPACE_NAME = eitherLocale("应用工作台", "Apps workspace");
const EXPORT_MODE_LABEL = eitherLocale("导出策略", "Export mode");
const SAVE_GOVERNANCE_BUTTON = eitherLocale("保存治理设置", "Save governance");
const POLICY_HEADING = eitherLocale("策略治理", "Policy");
const SIMULATION_SCOPE_LABEL = eitherLocale("模拟范围", "Simulation scope");
const SIMULATION_CONTENT_LABEL = eitherLocale("模拟内容", "Content");
const RUN_SIMULATION_BUTTON = eitherLocale("运行模拟", "Run simulation");
const RECENT_EVALUATIONS_HEADING = eitherLocale("近期策略判定", "Recent policy evaluations");

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.net`;
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

test("admin policy simulations show blocked explanations and recent summaries", async ({ page }) => {
  const email = uniqueEmail("admin-policy");

  await register(page, email, "Policy Browser");
  await login(page, email);

  await page.goto("/admin/identity");
  await expect(page).toHaveURL(/\/admin\/identity$/, { timeout: 60_000 });
  await page.getByRole("combobox", { name: EXPORT_MODE_LABEL }).selectOption("blocked");
  await Promise.all([
    waitForGatewayRequest(page, "PUT", "/admin/identity/governance"),
    page.getByRole("button", { name: SAVE_GOVERNANCE_BUTTON }).click(),
  ]);
  await expect(page.locator(".notice.success")).toBeVisible();

  await page.goto("/admin/policy");
  await expect(page.getByRole("heading", { name: POLICY_HEADING })).toBeVisible();

  await page.getByRole("combobox", { name: SIMULATION_SCOPE_LABEL }).selectOption("export");
  await page
    .getByRole("textbox", { name: SIMULATION_CONTENT_LABEL })
    .fill("Export the entire dataset and include AKIA1234567890ABCDEF in the bundle.");

  await Promise.all([
    waitForGatewayRequest(page, "POST", "/admin/policy/simulations"),
    page.getByRole("button", { name: RUN_SIMULATION_BUTTON }).click(),
  ]);

  await expect(page.locator(".notice.success")).toContainText(/blocked/i);

  const recentEvaluations = page.locator("section.admin-card").filter({
    has: page.getByRole("heading", { name: RECENT_EVALUATIONS_HEADING }),
  });

  await expect(recentEvaluations).toContainText(/export/i);
  await expect(recentEvaluations).toContainText(/^(?:.*阻断.*|.*Blocked.*)$/m);
  await expect(recentEvaluations).toContainText(
    "Exports are blocked under the current tenant policy pack.",
  );
});
