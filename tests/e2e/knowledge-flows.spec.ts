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
const ADMIN_SOURCES_LINK = eitherLocale("知识源", "Sources");
const ADMIN_NAV_NAME = eitherLocale("管理导航", "Admin navigation");
const ADMIN_SOURCES_HEADING = eitherLocale("知识源", "Sources");
const POLICY_WATCH_APP = eitherLocale("政策观察", "Policy Watch");
const MESSAGE_LABEL = eitherLocale("消息", "Message");
const GATEWAY_CONTEXT_HEADING = eitherLocale("网关上下文", "Gateway context");
const SOURCE_TITLE_LABEL = eitherLocale("标题", "Title");
const SOURCE_KIND_LABEL = eitherLocale("来源类型", "Source kind");
const SOURCE_CONTENT_LABEL = eitherLocale("来源内容", "Source content");
const SOURCE_SCOPE_LABEL = eitherLocale("范围", "Scope");
const SOURCE_GROUP_ID_LABEL = eitherLocale("群组 ID", "Group ID");
const SOURCE_LABELS_LABEL = eitherLocale("标签", "Labels");
const QUEUE_SOURCE_BUTTON = eitherLocale("加入来源", "Queue source");
const MARK_SUCCEEDED_BUTTON = eitherLocale("标记为 succeeded", "Mark succeeded");
const SEND_MESSAGE_BUTTON = eitherLocale("发送消息", "Send message");

function uniqueEmail(prefix: string, domain = "example.com") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@${domain}`;
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
  await page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      response.url().includes(`/api/gateway${pathFragment}`),
    {
      timeout: 120_000,
    },
  );
}

async function register(
  page: Page,
  input: { displayName: string; email: string },
) {
  await page.goto("/register");
  await page.getByLabel(DISPLAY_NAME_LABEL).fill(input.displayName);
  await page.getByLabel(EMAIL_LABEL).fill(input.email);
  await page.getByLabel(PASSWORD_LABEL).fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayRequest(page, "POST", "/auth/register"),
    page.getByRole("button", { name: CREATE_ACCOUNT_BUTTON }).click(),
  ]);
  await page.waitForURL(/\/login\?registered=1$/, { timeout: 5_000 }).catch(async () => {
    await page.waitForLoadState("networkidle").catch(() => {});
  });
}

async function login(page: Page, email: string) {
  await page
    .waitForURL(/\/login(?:\?|$)/, { timeout: 5_000 })
    .catch(async () => {
      if (!/\/login(?:\?|$)/.test(page.url())) {
        await page.goto("/login");
      }
    });
  await page.getByLabel(EMAIL_LABEL).fill(email);
  await page.getByLabel(PASSWORD_LABEL).fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayRequest(page, "POST", "/auth/login"),
    page.getByRole("button", { name: CONTINUE_BUTTON }).click(),
  ]);
  await page.waitForURL(/\/apps(?:\?|$)/, { timeout: 5_000 }).catch(async () => {
    await page.waitForLoadState("networkidle").catch(() => {});
  });
}

async function expectAppsWorkspace(page: Page) {
  await expect(page).toHaveURL(/\/apps$/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: APPS_WORKSPACE_NAME }),
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByLabel(WORKING_GROUP_LABEL)).toBeVisible({
    timeout: 60_000,
  });
}

async function expectConversationSurface(page: Page, appName: string | RegExp) {
  await expect(page).toHaveURL(/\/chat\/conv_/, {
    timeout: 60_000,
  });
  await expect(page.getByRole("heading", { name: appName })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(GATEWAY_CONTEXT_HEADING)).toBeVisible();
}

test("admin source management feeds retrieval-backed chat citations", async ({
  page,
}) => {
  const adminEmail = uniqueEmail("admin");
  const sourceTitle = `Dorm retrieval digest ${Date.now()}`;

  await register(page, {
    email: adminEmail,
    displayName: "Admin Retrieval User",
  });
  await expect(page).toHaveURL(/\/login\?registered=1$/);

  await login(page, adminEmail);
  await expectAppsWorkspace(page);

  await page.getByRole("link", { name: ADMIN_PREVIEW_LINK }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);

  await page
    .getByRole("navigation", { name: ADMIN_NAV_NAME })
    .getByRole("link", { name: ADMIN_SOURCES_LINK })
    .click();
  await expect(page).toHaveURL(/\/admin\/sources$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: ADMIN_SOURCES_HEADING })).toBeVisible({
    timeout: 60_000,
  });

  await page.getByLabel(SOURCE_TITLE_LABEL).fill(sourceTitle);
  await page.getByRole("combobox", { name: SOURCE_KIND_LABEL }).selectOption("markdown");
  await page.getByLabel(SOURCE_CONTENT_LABEL).fill(`# Dorm policy

Quiet hours begin at 23:00 on weekdays.

## Updates

Residents may request approved late access for labs.`);
  await page.getByRole("combobox", { name: SOURCE_SCOPE_LABEL }).selectOption("group");
  await page.getByLabel(SOURCE_GROUP_ID_LABEL).fill("grp_research");
  await page.getByLabel(SOURCE_LABELS_LABEL).fill("policy, dormitory");

  await Promise.all([
    waitForGatewayRequest(page, "POST", "/admin/sources"),
    page.getByRole("button", { name: QUEUE_SOURCE_BUTTON }).click(),
  ]);

  await expect(
    page.getByText(new RegExp(`(?:已将 ${escapeRegex(sourceTitle)} 加入摄取队列。|Queued ${escapeRegex(sourceTitle)} for ingestion\\.)`)),
  ).toBeVisible();

  const sourceCard = page.locator("article.admin-app-card").filter({
    has: page.getByRole("heading", { name: sourceTitle }),
  });
  await expect(sourceCard).toBeVisible();
  await expect(sourceCard.getByText(/markdown_sections/)).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().includes("/api/gateway/admin/sources/") &&
        response.url().includes("/status"),
      { timeout: 120_000 },
    ),
    sourceCard.getByRole("button", { name: MARK_SUCCEEDED_BUTTON }).click(),
  ]);

  await expect(sourceCard.locator("strong").filter({ hasText: /^succeeded$/i })).toBeVisible();

  await page.goto("/apps");
  await expectAppsWorkspace(page);

  const switchPolicyWatchButton = appCard(page, POLICY_WATCH_APP).getByRole(
    "button",
    {
      name: /^(Switch to|切换到) Research Lab$/,
    },
  );
  await expect(switchPolicyWatchButton).toBeVisible();
  await Promise.all([
    waitForGatewayRequest(page, "PUT", "/workspace/preferences"),
    switchPolicyWatchButton.click(),
  ]);
  await expect(
    page.getByText(/^(Working group switched to|工作群组已切换到) Research Lab/),
  ).toBeVisible({
    timeout: 15_000,
  });

  await Promise.all([
    waitForGatewayRequest(page, "POST", "/workspace/apps/launch"),
    appCard(page, POLICY_WATCH_APP)
      .getByRole("button", { name: /^(Open app|打开应用)$/ })
      .click(),
  ]);
  await expectConversationSurface(page, POLICY_WATCH_APP);

  await page.getByLabel(MESSAGE_LABEL).fill("summarize dorm policy updates");
  await page.getByRole("button", { name: SEND_MESSAGE_BUTTON }).click();

  const conversationPanel = page.locator("section.chat-panel").filter({
    has: page.getByRole("heading", { name: "Conversation" }),
  });
  await expect(
    conversationPanel
      .locator("article.chat-bubble.assistant")
      .last()
      .getByText(
        "Policy Watch is now reachable through the AgentifUI gateway.",
      ),
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(
      async () =>
        (await conversationPanel.textContent())?.includes(sourceTitle) ?? false,
      {
        timeout: 60_000,
      },
    )
    .toBe(true);

  const runHistoryPanel = page.locator("section.chat-panel").filter({
    has: page.getByRole("heading", { name: "Run history" }),
  });
  await expect(runHistoryPanel.getByText("Replay source blocks")).toBeVisible();
  await expect(
    runHistoryPanel
      .locator(".artifact-link-card")
      .filter({ hasText: sourceTitle })
      .first(),
  ).toBeVisible();
});
