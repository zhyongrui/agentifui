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
const WORKING_GROUP_LABEL = eitherLocale("工作群组", "Working group");
const APPS_WORKSPACE_NAME = eitherLocale("应用工作台", "Apps workspace");
const MESSAGE_LABEL = eitherLocale("消息", "Message");
const SEND_MESSAGE_BUTTON = eitherLocale("发送消息", "Send message");
const POLICY_WATCH_APP = eitherLocale("政策观察", "Policy Watch");
const CONVERSATION_HEADING = eitherLocale("对话", "Conversation");

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.net`;
}

function appCard(page: Page, appName: string | RegExp): Locator {
  return page.locator("article.app-card").filter({
    has: page.getByRole("heading", { name: appName }),
  });
}

async function waitForGatewayResponse(page: Page, pathFragment: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/api/gateway${pathFragment}`),
    {
      timeout: 120_000,
    },
  );
}

function parseProviderIdFromEventStream(body: string) {
  const match = body.match(/\"provider_id\":\"([^\"]+)\"/);

  return match?.[1] ?? null;
}

async function register(page: Page, input: { displayName: string; email: string }) {
  await page.goto("/register");
  await page.getByLabel(DISPLAY_NAME_LABEL).fill(input.displayName);
  await page.getByLabel(EMAIL_LABEL).fill(input.email);
  await page.getByLabel(PASSWORD_LABEL).fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayResponse(page, "/auth/register"),
    page.getByRole("button", { name: CREATE_ACCOUNT_BUTTON }).click(),
  ]);
  await page.waitForURL(/\/login\?registered=1$/, { timeout: 10_000 });
}

async function login(page: Page, email: string) {
  await page.getByLabel(EMAIL_LABEL).fill(email);
  await page.getByLabel(PASSWORD_LABEL).fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayResponse(page, "/auth/login"),
    page.getByRole("button", { name: CONTINUE_BUTTON }).click(),
  ]);
  await page.waitForURL(/\/apps(?:\?|$)/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: APPS_WORKSPACE_NAME })).toBeVisible({
    timeout: 20_000,
  });
}

test("policy watch can switch providers within the same transcript", async ({ page }) => {
  const email = uniqueEmail("provider");

  await register(page, {
    email,
    displayName: "Provider Routing Tester",
  });
  await login(page, email);

  await page.getByRole("combobox", { name: WORKING_GROUP_LABEL }).selectOption("grp_research");
  await expect(page.getByRole("combobox", { name: WORKING_GROUP_LABEL })).toHaveValue(
    "grp_research",
  );

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/gateway/workspace/apps/launch"),
      { timeout: 120_000 },
    ),
    appCard(page, POLICY_WATCH_APP)
      .getByRole("button", { name: /^(Open app|打开应用)$/ })
      .click(),
  ]);

  await expect(page).toHaveURL(/\/chat\/conv_/, { timeout: 20_000 });

  await page.getByLabel(MESSAGE_LABEL).fill("summarize dorm policy updates");
  const firstCompletionResponsePromise = waitForGatewayResponse(
    page,
    "/v1/chat/completions",
  );
  await page.getByRole("button", { name: SEND_MESSAGE_BUTTON }).click();
  const firstCompletionResponse = await firstCompletionResponsePromise;
  expect(parseProviderIdFromEventStream(await firstCompletionResponse.text())).toBe(
    "local_fast",
  );

  await page.getByLabel(MESSAGE_LABEL).fill("@structured turn this into a checklist");
  const secondCompletionResponsePromise = waitForGatewayResponse(
    page,
    "/v1/chat/completions",
  );
  await page.getByRole("button", { name: SEND_MESSAGE_BUTTON }).click();
  const secondCompletionResponse = await secondCompletionResponsePromise;
  expect(parseProviderIdFromEventStream(await secondCompletionResponse.text())).toBe(
    "local_structured",
  );

  const conversationPanel = page.locator("section.chat-panel").filter({
    has: page.getByRole("heading", { name: CONVERSATION_HEADING }),
  });

  await expect(page.getByLabel(MESSAGE_LABEL)).toHaveValue("");
  await expect(conversationPanel).toContainText("summarize dorm policy updates");
  await expect(conversationPanel).toContainText("checklist");
});
