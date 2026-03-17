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
const APPS_WORKSPACE_NAME = eitherLocale("应用工作台", "Apps workspace");
const ADMIN_PREVIEW_LINK = eitherLocale("管理预览", "Admin preview");
const WORKING_GROUP_LABEL = eitherLocale("工作群组", "Working group");
const RUNBOOK_MENTOR_APP = eitherLocale("流程手册导师", "Runbook Mentor");
const MESSAGE_LABEL = eitherLocale("消息", "Message");
const SEND_MESSAGE_BUTTON = eitherLocale("发送消息", "Send message");

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

test("admin connectors and workflows surfaces support setup, warnings, dry-run, and publish", async ({
  page,
}) => {
  const adminEmail = uniqueEmail("admin-workflow");
  const connectorTitle = `Research Drive ${Date.now()}`;
  const workflowSlug = `incident-flow-${Date.now()}`;
  const workflowTitle = `Incident Flow ${Date.now()}`;

  await register(page, adminEmail, "Admin Workflow Browser");
  await login(page, adminEmail);

  await page.getByRole("link", { name: ADMIN_PREVIEW_LINK }).click();
  await page.getByRole("link", { name: /^(连接器|Connectors)$/ }).click();
  await expect(page).toHaveURL(/\/admin\/connectors$/);

  await page.getByLabel("标题").fill(connectorTitle);
  await page.getByLabel("作用域").selectOption("group");
  await page.getByLabel("群组 ID").fill("grp_research");
  await page.getByLabel("认证方式").selectOption("token");
  await page.getByLabel("密钥").fill("browser-secret");
  await page.getByRole("button", { name: "创建连接器" }).click();
  await expect(page.locator(".notice.success")).toContainText(connectorTitle);

  const connectorCard = page.locator("article.card").filter({
    has: page.getByRole("heading", { name: connectorTitle }),
  });
  await Promise.all([
    waitForGatewayRequest(page, "POST", "/admin/connectors/"),
    connectorCard.getByRole("button", { name: "立即同步" }).click(),
  ]);
  await Promise.all([
    waitForGatewayRequest(page, "PUT", "/admin/connectors/"),
    connectorCard.getByRole("button", { name: "暂停" }).click(),
  ]);

  await page.goto("/apps");
  await page.getByRole("combobox", { name: WORKING_GROUP_LABEL }).selectOption("grp_research");
  await expect(
    page.getByRole("heading", { name: `${connectorTitle} source` }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(`${connectorTitle} is paused.`)).toBeVisible();

  await page.goto("/admin/workflows");
  await expect(page).toHaveURL(/\/admin\/workflows$/);
  await page.getByLabel("Slug").fill(workflowSlug);
  await page.getByLabel("标题").fill(workflowTitle);
  await page.getByRole("button", { name: "创建工作流" }).click();
  await expect(page.locator(".notice.success")).toContainText(workflowTitle);

  const workflowCard = page.locator("article.card").filter({
    has: page.getByRole("heading", { name: workflowTitle }),
  });
  await workflowCard.getByRole("button", { name: "Dry run" }).click();
  await expect(page.locator(".notice.success")).toContainText("dry-run");
  await expect(workflowCard.getByText(/valid=true/)).toBeVisible();
  await workflowCard.getByRole("button", { name: "发布最新版本" }).click();
  await expect(page.locator(".notice.success")).toContainText("已发布");
});

test("runbook mentor surfaces plan controls and branch creation in the replay panel", async ({
  page,
}) => {
  const email = uniqueEmail("workflow-run");

  await register(page, email, "Workflow Run Browser");
  await login(page, email);

  await page.getByRole("combobox", { name: WORKING_GROUP_LABEL }).selectOption("grp_research");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/gateway/workspace/apps/launch"),
      { timeout: 120_000 },
    ),
    appCard(page, RUNBOOK_MENTOR_APP)
      .getByRole("button", { name: /^(Open app|打开应用)$/ })
      .click(),
  ]);

  await expect(page).toHaveURL(/\/chat\/conv_/, { timeout: 20_000 });

  await page.getByLabel(MESSAGE_LABEL).fill("Turn this SOP into a structured workflow plan.");
  await Promise.all([
    waitForGatewayRequest(page, "POST", "/v1/chat/completions"),
    page.getByRole("button", { name: SEND_MESSAGE_BUTTON }).click(),
  ]);

  await expect(page.getByText("Plan state")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Workflow memory")).toBeVisible();
  await Promise.all([
    waitForGatewayRequest(page, "PUT", "/workspace/runs/"),
    page.getByRole("button", { name: "Pause" }).first().click(),
  ]);
  await expect(page.getByText("Workflow paused")).toBeVisible();
  await Promise.all([
    waitForGatewayRequest(page, "POST", "/workspace/runs/"),
    page.getByRole("button", { name: "Create branch" }).click(),
  ]);
  await expect(page).toHaveURL(/\/chat\/conv_/, { timeout: 20_000 });
  await expect(page.getByText("Branch lineage")).toBeVisible();
});
