import { expect, test, type Locator, type Page } from "@playwright/test";

const DEFAULT_PASSWORD = "Secure123";

function uniqueEmail(prefix: string, domain = "example.com") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@${domain}`;
}

function appCard(page: Page, appName: string): Locator {
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
  await page.getByLabel("Display Name").fill(input.displayName);
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Password").fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayRequest(page, "POST", "/auth/register"),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayRequest(page, "POST", "/auth/login"),
    page.getByRole("button", { name: "Continue" }).click(),
  ]);
}

async function expectAppsWorkspace(page: Page) {
  await expect(page).toHaveURL(/\/apps$/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: "Apps workspace" }),
  ).toBeVisible({
    timeout: 60_000,
  });
}

async function expectConversationSurface(page: Page, appName: string) {
  await expect(page).toHaveURL(/\/chat\/conv_/, {
    timeout: 60_000,
  });
  await expect(page.getByRole("heading", { name: appName })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Gateway context")).toBeVisible();
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

  await page.getByRole("link", { name: "Admin preview" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);

  await page.getByRole("link", { name: "Sources" }).click();
  await expect(page).toHaveURL(/\/admin\/sources$/);
  await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible({
    timeout: 60_000,
  });

  await page.getByLabel("Title").fill(sourceTitle);
  await page.getByLabel("Source kind").selectOption("markdown");
  await page.getByLabel("Source content").fill(`# Dorm policy

Quiet hours begin at 23:00 on weekdays.

## Updates

Residents may request approved late access for labs.`);
  await page.getByLabel("Scope").selectOption("group");
  await page.getByLabel("Group ID").fill("grp_research");
  await page.getByLabel("Labels").fill("policy, dormitory");

  await Promise.all([
    waitForGatewayRequest(page, "POST", "/admin/sources"),
    page.getByRole("button", { name: "Queue source" }).click(),
  ]);

  await expect(
    page.getByText(`Queued ${sourceTitle} for ingestion.`),
  ).toBeVisible();

  const sourceCard = page.locator("article.admin-app-card").filter({
    has: page.getByRole("heading", { name: sourceTitle }),
  });
  await expect(sourceCard).toBeVisible();
  await expect(
    sourceCard.getByText("strategy markdown_sections"),
  ).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().includes("/api/gateway/admin/sources/") &&
        response.url().includes("/status"),
      { timeout: 120_000 },
    ),
    sourceCard.getByRole("button", { name: "Mark succeeded" }).click(),
  ]);

  await expect(sourceCard.getByText("Status succeeded")).toBeVisible();

  await page.goto("/apps");
  await expectAppsWorkspace(page);

  const switchPolicyWatchButton = appCard(page, "Policy Watch").getByRole(
    "button",
    {
      name: /切换到 Research Lab/,
    },
  );
  await expect(switchPolicyWatchButton).toBeVisible();
  await Promise.all([
    waitForGatewayRequest(page, "PUT", "/workspace/preferences"),
    switchPolicyWatchButton.click(),
  ]);
  await expect(page.getByText("工作群组已切换到 Research Lab")).toBeVisible({
    timeout: 15_000,
  });

  await Promise.all([
    waitForGatewayRequest(page, "POST", "/workspace/apps/launch"),
    appCard(page, "Policy Watch")
      .getByRole("button", { name: "打开应用" })
      .click(),
  ]);
  await expectConversationSurface(page, "Policy Watch");

  await page.getByLabel("Message").fill("summarize dorm policy updates");
  await page.getByRole("button", { name: "Send message" }).click();

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
