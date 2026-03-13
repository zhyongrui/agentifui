import { createHash, createHmac, randomUUID } from 'node:crypto';

import { expect, test, type Locator, type Page } from '@playwright/test';
import postgres from 'postgres';

const DATABASE_URL = 'postgresql://agentifui:agentifui@localhost:5432/agentifui';
const DEFAULT_PASSWORD = 'Secure123';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_MS = 30_000;

function uniqueEmail(prefix: string, domain = 'example.com') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@${domain}`;
}

function maskAuditEmail(email: string) {
  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) {
    return email;
  }

  return `${localPart[0] ?? '*'}${'*'.repeat(Math.max(localPart.length - 1, 2))}@${domain}`;
}

function buildLongStopPrompt() {
  return `Please repeat this block verbatim and keep every line:
${'A A A A A A A A A A\n'.repeat(80)}`;
}

function base32Decode(input: string): Buffer {
  const normalized = input.replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);

    if (index === -1) {
      throw new Error('Invalid base32 input.');
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function createCounterBuffer(counter: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  return buffer;
}

function generateTotpCode(secret: string, nowMs = Date.now()): string {
  const counter = Math.floor(nowMs / TOTP_STEP_MS);
  const key = base32Decode(secret);
  const digest = createHmac('sha1', key).update(createCounterBuffer(counter)).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

function appCard(page: Page, appName: string): Locator {
  return page.locator('article.app-card').filter({
    has: page.getByRole('heading', { name: appName }),
  });
}

async function waitForGatewayPost(page: Page, path: string) {
  await waitForGatewayRequest(page, 'POST', path);
}

async function waitForGatewayPut(page: Page, path: string) {
  await waitForGatewayRequest(page, 'PUT', path);
}

async function waitForGatewayRequest(page: Page, method: 'POST' | 'PUT', path: string) {
  await page.waitForResponse(
    response =>
      response.request().method() === method &&
      response.url().includes(`/api/gateway${path}`),
    {
      timeout: 60_000,
    }
  );
}

async function register(page: Page, input: {
  email: string;
  password?: string;
  displayName?: string;
}) {
  await page.goto('/register');

  if (input.displayName) {
    await page.getByLabel('Display Name').fill(input.displayName);
  }

  await page.getByLabel('Email').fill(input.email);
  await page.getByLabel('Password').fill(input.password ?? DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayPost(page, '/auth/register'),
    page.getByRole('button', { name: 'Create account' }).click(),
  ]);
}

async function login(page: Page, input: {
  email: string;
  password?: string;
}) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(input.email);
  await page.getByLabel('Password').fill(input.password ?? DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayPost(page, '/auth/login'),
    page.getByRole('button', { name: 'Continue' }).click(),
  ]);
}

async function readSessionToken(page: Page) {
  return page.evaluate(() => {
    const raw = window.sessionStorage.getItem('agentifui.session');

    if (!raw) {
      return null;
    }

    return (JSON.parse(raw) as { sessionToken: string }).sessionToken;
  });
}

async function logout(page: Page) {
  const sessionToken = await readSessionToken(page);

  if (!sessionToken) {
    return;
  }

  await page.request.post('/api/gateway/auth/logout', {
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
    data: {},
  });

  await page.evaluate(() => {
    window.sessionStorage.removeItem('agentifui.session');
    window.sessionStorage.removeItem('agentifui.mfa.ticket');
  });
}

async function expectAppsWorkspace(page: Page) {
  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole('heading', { name: 'Apps workspace' })).toBeVisible({
    timeout: 60_000,
  });
}

async function expectConversationSurface(page: Page, appName: string) {
  await expect(page).toHaveURL(/\/chat\/conv_/, {
    timeout: 60_000,
  });
  await expect(page.getByRole('heading', { name: appName })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('Gateway context')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quota context' })).toBeVisible();
  await expect(page.getByLabel('Message')).toBeEnabled();
}

async function seedInvitation(email: string) {
  const token = randomUUID();
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const database = postgres(DATABASE_URL, {
    max: 1,
    prepare: false,
  });

  try {
    await database`
      insert into invitations (
        id,
        tenant_id,
        email,
        token_hash,
        status,
        expires_at,
        created_at
      )
      values (
        ${randomUUID()},
        'dev-tenant',
        ${email},
        ${tokenHash},
        'pending',
        now() + interval '7 days',
        now()
      )
    `;
  } finally {
    await database.end({ timeout: 5 });
  }

  return token;
}

test.describe.configure({ mode: 'serial' });

test('register/login/workspace controls work for a normal active user', async ({ page }) => {
  const email = uniqueEmail('e2e-user');

  await register(page, {
    email,
    password: 'weak',
    displayName: 'Weak Password User',
  });
  await expect(page.getByText('Password does not satisfy the current password policy.')).toBeVisible();

  await register(page, {
    email,
    displayName: 'Normal User',
  });
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await expect(page.getByText('Registration complete. You can now sign in.')).toBeVisible();

  await register(page, {
    email,
    displayName: 'Duplicate User',
  });
  await expect(page.getByText('An account already exists for this email address.')).toBeVisible();

  await login(page, {
    email,
  });
  await expectAppsWorkspace(page);
  await expect(page.getByText('5 个授权应用')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Security / MFA' })).toBeVisible();

  await page.getByRole('link', { name: 'Security / MFA' }).click();
  await expect(page).toHaveURL(/\/settings\/security$/);
  await expect(page.getByRole('heading', { name: 'Security Settings' })).toBeVisible();

  await page.getByRole('link', { name: 'Apps workspace' }).click();
  await expectAppsWorkspace(page);

  await expect(appCard(page, 'Service Copilot')).toBeVisible();
  await expect(appCard(page, 'Policy Watch')).toBeVisible();
  await expect(appCard(page, 'Audit Lens')).toHaveCount(0);

  await Promise.all([
    waitForGatewayPut(page, '/workspace/preferences'),
    appCard(page, 'Service Copilot').getByRole('button', { name: '收藏' }).click(),
  ]);
  await expect(
    page.locator('section.workspace-section').filter({
      has: page.getByRole('heading', { name: 'Favorites' }),
    })
  ).toContainText('Service Copilot');

  await page.getByLabel('Search apps').fill('policy');
  await expect(appCard(page, 'Policy Watch')).toBeVisible();
  await expect(appCard(page, 'Service Copilot')).toHaveCount(0);
  await page.getByLabel('Search apps').fill('');

  await Promise.all([
    waitForGatewayPut(page, '/workspace/preferences'),
    appCard(page, 'Policy Watch').getByRole('button', { name: /切换到 Research Lab/ }).click(),
  ]);
  await expect(page.getByText('工作群组已切换到 Research Lab')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Working group')).toHaveValue('grp_research');

  await Promise.all([
    waitForGatewayPost(page, '/workspace/apps/launch'),
    appCard(page, 'Policy Watch').getByRole('button', { name: '打开应用' }).click(),
  ]);
  await expectConversationSurface(page, 'Policy Watch');
  await expect(page.getByText('Run status')).toBeVisible();
  await Promise.all([
    page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/gateway/workspace/conversations/') &&
        response.url().includes('/uploads'),
      {
        timeout: 60_000,
      }
    ),
    page.locator('#chat-attachment').setInputFiles({
      name: 'brief.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Policy attachment'),
    }),
  ]);
  await expect(page.getByText('brief.txt (text/plain, 17 B)')).toBeVisible();
  await page.getByLabel('Message').fill('Summarize the current policy changes for my group.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText('Policy Watch is now reachable through the AgentifUI gateway.')
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.chat-attachment-list').getByText('brief.txt')).toBeVisible();
  await expect(
    page.locator('article.chat-meta-card').filter({
      has: page.getByText('Run status'),
    }).getByText('succeeded')
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.run-replay-stack').getByText('Attached files')).toBeVisible();

  await page.getByLabel('Message').fill(buildLongStopPrompt());
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Stop response' })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Stop response' }).click();
  await expect(
    page.locator('article.chat-meta-card').filter({
      has: page.getByText('Run status'),
    }).getByText('stopped')
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('heading', { name: 'Run history' })).toBeVisible();
  await expect(page.locator('.run-history-item')).toHaveCount(2);
  await expect(
    page.locator('.run-history-detail').getByText('Prompt snapshot', { exact: true })
  ).toBeVisible();
  await expect(
    page.locator('.run-history-detail').getByText('Assistant output', { exact: true })
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Apps workspace' }).click();
  await expectAppsWorkspace(page);
  await expect(
    page.locator('section.workspace-section').filter({
      has: page.getByRole('heading', { name: 'Recent' }),
    })
  ).toContainText('Policy Watch');

  await page.reload();
  await expect(
    page.locator('section.workspace-section').filter({
      has: page.getByRole('heading', { name: 'Favorites' }),
    })
  ).toContainText('Service Copilot');
  await expect(
    page.locator('section.workspace-section').filter({
      has: page.getByRole('heading', { name: 'Recent' }),
    })
  ).toContainText('Policy Watch');

  await logout(page);
  await page.goto('/apps');
  await expect(page).toHaveURL(/\/login$/);
});

test('sso pending flow keeps access limited to the profile page', async ({ page }) => {
  const email = uniqueEmail('pending', 'iflabx.com');

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await expect(page.getByText('Enterprise SSO detected for')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with iflabx-sso/ })).toBeVisible();
  await Promise.all([
    waitForGatewayPost(page, '/auth/sso/callback'),
    page.getByRole('button', { name: /Continue with iflabx-sso/ }).click(),
  ]);

  await expect(page).toHaveURL(/\/auth\/pending$/);
  await expect(page.getByRole('heading', { name: 'Pending Approval' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole('link', { name: 'Open profile' }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(
    page.locator('.detail-row').filter({
      has: page.getByText('Status', { exact: true }),
    }).locator('strong')
  ).toHaveText('pending');

  await page.goto('/settings/security');
  await expect(page).toHaveURL(/\/auth\/pending$/);

  await page.getByRole('button', { name: 'Back to login' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('invitation acceptance activates the user and allows password login', async ({ page }) => {
  const email = uniqueEmail('invitee');
  const token = await seedInvitation(email);

  await page.goto(`/invite/accept?token=${token}`);
  await expect(page.getByRole('heading', { name: 'Accept Invitation' })).toBeVisible();
  await expect(page.getByLabel('Invitation Token')).toHaveValue(token);
  await page.getByLabel('Display Name').fill('Invited User');
  await page.getByLabel('Password').fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayPost(page, '/auth/invitations/accept'),
    page.getByRole('button', { name: 'Activate account' }).click(),
  ]);

  await expect(page).toHaveURL(/\/login\?activated=1$/);
  await expect(page.getByText('Invitation accepted. Sign in with your new password.')).toBeVisible();

  await login(page, {
    email,
  });
  await expectAppsWorkspace(page);
});

test('mfa setup, mfa login verification, and disable flow work end-to-end', async ({ page }) => {
  const email = uniqueEmail('mfa-user');

  await register(page, {
    email,
    displayName: 'MFA User',
  });
  await expect(page).toHaveURL(/\/login\?registered=1$/);

  await login(page, {
    email,
  });
  await expectAppsWorkspace(page);

  await page.goto('/settings/security');
  await expect(page.getByRole('heading', { name: 'Security Settings' })).toBeVisible();
  await expect(
    page.locator('.detail-row').filter({
      has: page.getByText('MFA', { exact: true }),
    }).locator('strong')
  ).toHaveText('Disabled');
  await Promise.all([
    waitForGatewayPost(page, '/auth/mfa/setup'),
    page.getByRole('button', { name: 'Start MFA setup' }).click(),
  ]);

  await expect(page.getByText('MFA setup started.')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('Manual entry key')).toBeVisible();

  await page.getByRole('button', { name: 'Copy manual key' }).click();
  await expect(page.getByText('Manual entry key copied.')).toBeVisible();

  const manualKey = (await page.locator('.security-code-block code').first().textContent())?.trim();

  if (!manualKey) {
    throw new Error('Expected MFA manual entry key to be visible.');
  }

  await page.getByLabel('Current TOTP code').fill(generateTotpCode(manualKey));
  await Promise.all([
    waitForGatewayPost(page, '/auth/mfa/enable'),
    page.getByRole('button', { name: 'Confirm enable' }).click(),
  ]);

  await expect(page.getByText('MFA is now enabled for this account.')).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText('Enabled since')).toBeVisible();

  await logout(page);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEFAULT_PASSWORD);
  await Promise.all([
    waitForGatewayPost(page, '/auth/login'),
    page.getByRole('button', { name: 'Continue' }).click(),
  ]);

  await expect(page).toHaveURL(/\/auth\/mfa$/, {
    timeout: 60_000,
  });
  await expect(page.getByRole('heading', { name: 'MFA Verification' })).toBeVisible();

  await page.getByLabel('TOTP Code').fill('000000');
  await Promise.all([
    waitForGatewayPost(page, '/auth/mfa/verify'),
    page.getByRole('button', { name: 'Complete sign in' }).click(),
  ]);
  await expect(page.getByText('The provided MFA code is invalid.')).toBeVisible();

  await page.getByLabel('TOTP Code').fill(generateTotpCode(manualKey));
  await Promise.all([
    waitForGatewayPost(page, '/auth/mfa/verify'),
    page.getByRole('button', { name: 'Complete sign in' }).click(),
  ]);
  await expectAppsWorkspace(page);

  await page.goto('/settings/security');
  await page.getByLabel('Current TOTP code').fill(generateTotpCode(manualKey));
  await Promise.all([
    waitForGatewayPost(page, '/auth/mfa/disable'),
    page.getByRole('button', { name: 'Disable MFA' }).click(),
  ]);
  await expect(page.getByText('MFA has been disabled for this account.')).toBeVisible();
  await expect(
    page.locator('.detail-row').filter({
      has: page.getByText('MFA', { exact: true }),
    }).locator('strong')
  ).toHaveText('Disabled');
});

test('conversation shares allow another group member to open a read-only shared transcript', async ({ page }) => {
  const ownerEmail = uniqueEmail('share-owner');
  const readerEmail = uniqueEmail('share-reader');

  await register(page, {
    email: ownerEmail,
    displayName: 'Share Owner',
  });
  await register(page, {
    email: readerEmail,
    displayName: 'Share Reader',
  });

  await login(page, {
    email: ownerEmail,
  });
  await expectAppsWorkspace(page);

  await appCard(page, 'Policy Watch').getByRole('button', { name: /切换到 Research Lab/ }).click();
  await expect(page.getByLabel('Working group')).toHaveValue('grp_research');
  await Promise.all([
    waitForGatewayPost(page, '/workspace/apps/launch'),
    appCard(page, 'Policy Watch').getByRole('button', { name: '打开应用' }).click(),
  ]);
  await expectConversationSurface(page, 'Policy Watch');
  await page.getByLabel('Message').fill('Share this transcript with my research team.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText('Policy Watch is now reachable through the AgentifUI gateway.')
  ).toBeVisible({
    timeout: 60_000,
  });

  await page.getByLabel('Share group').selectOption('grp_research');
  await Promise.all([
    page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/gateway/workspace/conversations/') &&
        response.url().includes('/shares'),
      {
        timeout: 60_000,
      }
    ),
    page.getByRole('button', { name: 'Create read-only share' }).click(),
  ]);

  const sharedHref = await page.getByRole('link', { name: 'Open shared view' }).first().getAttribute('href');

  expect(sharedHref).toMatch(/\/chat\/shared\/share_/);

  await logout(page);
  await login(page, {
    email: readerEmail,
  });
  await page.goto(sharedHref ?? '/apps');
  await expect(page).toHaveURL(/\/chat\/shared\/share_/);
  await expect(
    page.getByText('This is a read-only shared workspace conversation.')
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.locator('.chat-bubble.user p', {
      hasText: 'Share this transcript with my research team.',
    })
  ).toBeVisible();
  await expect(page.getByLabel('Message')).toHaveCount(0);
});

test('chat history lists recent conversations and links back to timeline-aware replay', async ({
  page,
}) => {
  const email = uniqueEmail('history-user');

  await register(page, {
    email,
    displayName: 'History Browser User',
  });
  await login(page, {
    email,
  });
  await expectAppsWorkspace(page);

  await appCard(page, 'Policy Watch').getByRole('button', { name: /切换到 Research Lab/ }).click();
  await expect(page.getByLabel('Working group')).toHaveValue('grp_research');
  await Promise.all([
    waitForGatewayPost(page, '/workspace/apps/launch'),
    appCard(page, 'Policy Watch').getByRole('button', { name: '打开应用' }).click(),
  ]);
  await expectConversationSurface(page, 'Policy Watch');
  await page.getByLabel('Message').fill('Show this conversation in recent history.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText('Policy Watch is now reachable through the AgentifUI gateway.')
  ).toBeVisible({
    timeout: 60_000,
  });

  await page.goto('/chat');
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole('heading', { name: 'Conversation history' })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByLabel('Search').fill('recent history');
  await page.getByLabel('App').selectOption('app_policy_watch');
  await page.getByLabel('Group').selectOption('grp_research');
  await expect(
    page.locator('.conversation-history-card').filter({
      has: page.getByRole('heading', { name: 'Policy Watch' }),
    })
  ).toBeVisible();

  await page.getByRole('link', { name: 'Open conversation' }).first().click();
  await expectConversationSurface(page, 'Policy Watch');
  await expect(page.getByText('Run timeline')).toBeVisible();
});

test('security and admin users see different workspace catalogs', async ({ page }) => {
  const securityEmail = uniqueEmail('security-audit');
  const adminEmail = uniqueEmail('admin');

  await register(page, {
    email: securityEmail,
    displayName: 'Security User',
  });
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await login(page, {
    email: securityEmail,
  });
  await expectAppsWorkspace(page);
  await expect(appCard(page, 'Audit Lens')).toBeVisible();
  await expect(appCard(page, 'Market Brief')).toHaveCount(0);
  await logout(page);

  await register(page, {
    email: adminEmail,
    displayName: 'Admin User',
  });
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await login(page, {
    email: adminEmail,
  });
  await expectAppsWorkspace(page);
  await expect(appCard(page, 'Tenant Control')).toBeVisible();
  await expect(appCard(page, 'Audit Lens')).toHaveCount(0);
});

test('admin pages render persisted governance data for tenant admins', async ({ page }) => {
  const memberEmail = uniqueEmail('member');
  const adminEmail = uniqueEmail('admin');

  await register(page, {
    email: memberEmail,
    displayName: 'Member Browser User',
  });
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await login(page, {
    email: memberEmail,
  });
  await expectAppsWorkspace(page);
  await expect(appCard(page, 'Tenant Control')).toHaveCount(0);
  await logout(page);

  await register(page, {
    email: adminEmail,
    displayName: 'Admin Browser User',
  });
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await login(page, {
    email: adminEmail,
  });
  await expectAppsWorkspace(page);

  await page.getByRole('link', { name: 'Admin preview' }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.getByText('Total users')).toBeVisible();
  await expect(page.getByText(adminEmail)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tenants' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Groups' }).click();
  await expect(page).toHaveURL(/\/admin\/groups$/);
  await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();
  await expect(page.getByText('Total groups')).toBeVisible();
  await expect(page.getByText('Product Studio')).toBeVisible();

  await page.getByRole('link', { name: 'Apps', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/apps$/);
  await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();
  await expect(page.getByText('Tenant Control')).toBeVisible();
  const tenantControlCard = appCard(page, 'Tenant Control');
  await tenantControlCard.getByLabel('Tenant Control grant email').fill(memberEmail);
  await tenantControlCard.getByLabel('Tenant Control grant reason').fill('Manual browser grant');
  await Promise.all([
    waitForGatewayPost(page, '/admin/apps/app_tenant_control/grants'),
    tenantControlCard.getByRole('button', { name: 'Save direct override' }).click(),
  ]);
  await expect(page.getByText(`${memberEmail} now has a allow override on Tenant Control.`)).toBeVisible();
  await expect(tenantControlCard.getByText(memberEmail)).toBeVisible();

  await page.getByRole('link', { name: 'Audit' }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible();
  await expect(page.getByText('Top actions')).toBeVisible();
  await expect(
    page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Top actions' }),
    }).locator('.tag').filter({
      hasText: 'auth.login.succeeded',
    })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'admin.workspace_grant.created' })).toBeVisible();
  await page.getByLabel('Audit action filter').fill('admin.workspace_grant.created');
  await Promise.all([
    page.waitForResponse(
      response =>
        response.request().method() === 'GET' &&
        response
          .url()
          .includes('/api/gateway/admin/audit?scope=tenant&action=admin.workspace_grant.created'),
      {
        timeout: 60_000,
      }
    ),
    page.getByRole('button', { name: 'Apply filters' }).click(),
  ]);
  await expect(page.getByText('Action: admin.workspace_grant.created')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'admin.workspace_grant.created' })).toBeVisible();
  await expect(page.getByText('PII detected')).toBeVisible();
  const auditPayloadBlock = page.locator('.admin-code-block pre').first();
  await expect(auditPayloadBlock).toContainText(maskAuditEmail(memberEmail));
  await expect(auditPayloadBlock).not.toContainText(memberEmail);
  await Promise.all([
    page.waitForResponse(
      response =>
        response.request().method() === 'GET' &&
        response
          .url()
          .includes(
            '/api/gateway/admin/audit?scope=tenant&action=admin.workspace_grant.created&payloadMode=raw'
          ),
      {
        timeout: 60_000,
      }
    ),
    page.getByRole('button', { name: 'Show raw payloads' }).click(),
  ]);
  await expect(auditPayloadBlock).toContainText(memberEmail);
  await Promise.all([
    page.waitForResponse(
      response =>
        response.request().method() === 'GET' &&
        response
          .url()
          .includes(
            '/api/gateway/admin/audit/export?scope=tenant&action=admin.workspace_grant.created&payloadMode=raw&format=csv'
          ),
      {
        timeout: 60_000,
      }
    ),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ]);
  await expect(page.getByText(/CSV export (ready|downloaded): .*\.csv/)).toBeVisible();

  await logout(page);
  await login(page, {
    email: memberEmail,
  });
  await expectAppsWorkspace(page);
  await expect(appCard(page, 'Tenant Control')).toBeVisible();
});

test('root admins can open the platform tenant inventory page', async ({ page }) => {
  const rootAdminEmail = uniqueEmail('root-admin');
  const tenantAdminEmail = uniqueEmail('tenant-owner');
  const tenantName = 'Acme Platform Tenant';

  await register(page, {
    email: rootAdminEmail,
    displayName: 'Root Admin Browser User',
  });
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await login(page, {
    email: rootAdminEmail,
  });
  await expectAppsWorkspace(page);

  await page.getByRole('link', { name: 'Admin preview' }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('link', { name: 'Tenants' })).toBeVisible();

  await page.getByRole('link', { name: 'Tenants' }).click();
  await expect(page).toHaveURL(/\/admin\/tenants$/);
  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
  await expect(page.getByText('Total tenants')).toBeVisible();

  await page.getByLabel('Tenant name').fill(tenantName);
  await page.getByLabel('Tenant slug').fill('acme-platform');
  await page.getByLabel('Bootstrap admin email').fill(tenantAdminEmail);
  await page.getByLabel('Bootstrap admin display name').fill('Acme Owner');
  await Promise.all([
    waitForGatewayPost(page, '/admin/tenants'),
    page.getByRole('button', { name: 'Create tenant' }).click(),
  ]);

  await expect(
    page.getByText(`Bootstrap invite ready for ${tenantAdminEmail}.`)
  ).toBeVisible();
  await expect(page.getByText('/invite/accept?token=')).toBeVisible();

  const tenantCard = page.locator('article.admin-card').filter({
    has: page.getByRole('heading', { name: tenantName }),
  });
  await expect(tenantCard).toBeVisible();
  await expect(tenantCard.getByText('active')).toBeVisible();

  await Promise.all([
    waitForGatewayPut(page, '/admin/tenants/tenant-acme-platform/status'),
    tenantCard.getByRole('button', { name: 'Suspend tenant' }).click(),
  ]);
  await expect(page.getByText(`${tenantName} is now suspended.`)).toBeVisible();
  await expect(tenantCard.getByText('suspended')).toBeVisible();

  await Promise.all([
    waitForGatewayPut(page, '/admin/tenants/tenant-acme-platform/status'),
    tenantCard.getByRole('button', { name: 'Reactivate tenant' }).click(),
  ]);
  await expect(page.getByText(`${tenantName} is now active.`)).toBeVisible();
  await expect(tenantCard.getByText('active')).toBeVisible();

  await page.getByRole('link', { name: 'Audit' }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(page.locator('.workspace-badge').filter({ hasText: 'Scope: platform' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tenant spread' })).toBeVisible();
  await expect(
    page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Tenant spread' }),
    }).locator('.tag').filter({ hasText: 'Acme Platform Tenant' })
  ).toBeVisible();
  await page.getByLabel('Audit tenant filter').selectOption('tenant-acme-platform');
  await page.getByLabel('Audit action filter').fill('admin.tenant.suspended');
  await Promise.all([
    page.waitForResponse(
      response =>
        response.request().method() === 'GET' &&
        response
          .url()
          .includes(
            '/api/gateway/admin/audit?scope=platform&tenantId=tenant-acme-platform&action=admin.tenant.suspended'
          ),
      {
        timeout: 60_000,
      }
    ),
    page.getByRole('button', { name: 'Apply filters' }).click(),
  ]);
  await expect(page.getByText('Tenant: Acme Platform Tenant')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'admin.tenant.suspended' })).toBeVisible();
});
