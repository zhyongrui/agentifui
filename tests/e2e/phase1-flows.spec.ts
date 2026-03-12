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
  await page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
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
  await expect(page).toHaveURL(/\/chat\/conv_/);
  await expect(page.getByRole('heading', { name: appName })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('Gateway context')).toBeVisible();
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

  await appCard(page, 'Service Copilot').getByRole('button', { name: '收藏' }).click();
  await expect(
    page.locator('section.workspace-section').filter({
      has: page.getByRole('heading', { name: 'Favorites' }),
    })
  ).toContainText('Service Copilot');

  await page.getByLabel('Search apps').fill('policy');
  await expect(appCard(page, 'Policy Watch')).toBeVisible();
  await expect(appCard(page, 'Service Copilot')).toHaveCount(0);
  await page.getByLabel('Search apps').fill('');

  await appCard(page, 'Policy Watch').getByRole('button', { name: /切换到 Research Lab/ }).click();
  await expect(page.getByText('工作群组已切换到 Research Lab')).toBeVisible();
  await expect(page.getByLabel('Working group')).toHaveValue('grp_research');

  await appCard(page, 'Policy Watch').getByRole('button', { name: '打开应用' }).click();
  await expectConversationSurface(page, 'Policy Watch');
  await expect(page.getByText('Run status')).toBeVisible();
  await page.getByLabel('Message').fill('Summarize the current policy changes for my group.');
  await Promise.all([
    waitForGatewayPost(page, '/v1/chat/completions'),
    page.getByRole('button', { name: 'Send message' }).click(),
  ]);
  await expect(
    page.getByText('Policy Watch is now reachable through the AgentifUI gateway.')
  ).toBeVisible();
  await expect(page.getByText('succeeded')).toBeVisible();
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
  await page.getByRole('button', { name: /Continue with iflabx-sso/ }).click();

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
  await page.getByRole('button', { name: 'Activate account' }).click();

  await expect(page).toHaveURL(/\/login\?activated=1$/);
  await expect(page.getByText('Invitation accepted. Sign in with your new password.')).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEFAULT_PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();

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
  await page.getByRole('button', { name: 'Start MFA setup' }).click();

  await expect(page.getByText('MFA setup started.')).toBeVisible();
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
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/auth\/mfa$/);
  await expect(page.getByRole('heading', { name: 'MFA Verification' })).toBeVisible();

  await page.getByLabel('TOTP Code').fill('000000');
  await page.getByRole('button', { name: 'Complete sign in' }).click();
  await expect(page.getByText('The provided MFA code is invalid.')).toBeVisible();

  await page.getByLabel('TOTP Code').fill(generateTotpCode(manualKey));
  await page.getByRole('button', { name: 'Complete sign in' }).click();
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

test('admin placeholder pages are reachable', async ({ page }) => {
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

  await page.goto('/admin/groups');
  await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();

  await page.goto('/admin/apps');
  await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();

  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible();
});
