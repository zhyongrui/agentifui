import { randomUUID } from 'node:crypto';

function requireBaseUrl() {
  const value = process.env.SMOKE_BASE_URL?.trim();

  if (!value) {
    throw new Error('SMOKE_BASE_URL is required. Example: https://agentifui.example.com');
  }

  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function buildUrl(baseUrl, path) {
  return new URL(path, `${baseUrl}/`).toString();
}

async function readJson(response) {
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return JSON.parse(text);
  }

  return text;
}

async function expectOkJson(label, response) {
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(`${label} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function main() {
  const baseUrl = requireBaseUrl();
  const email =
    process.env.SMOKE_EMAIL?.trim() || `smoke-${Date.now()}-${randomUUID()}@example.net`;
  const password = process.env.SMOKE_PASSWORD?.trim() || 'Secure123';
  const displayName = process.env.SMOKE_DISPLAY_NAME?.trim() || 'Deploy Smoke';
  const smokeAppId = process.env.SMOKE_APP_ID?.trim() || null;
  const smokeGroupId = process.env.SMOKE_ACTIVE_GROUP_ID?.trim() || null;
  const skipRegister = process.env.SMOKE_SKIP_REGISTER === 'true';
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL?.trim() || null;
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD?.trim() || password;

  const loginPage = await fetch(buildUrl(baseUrl, '/login'), {
    redirect: 'follow',
  });

  if (!loginPage.ok) {
    throw new Error(`GET /login failed with ${loginPage.status}.`);
  }

  const gatewayHealth = await fetch(buildUrl(baseUrl, '/api/gateway/health'));
  const healthPayload = await expectOkJson('gateway health', gatewayHealth);

  console.log(`Gateway health: ${healthPayload.status} (${healthPayload.environment})`);

  if (!skipRegister) {
    const registerResponse = await fetch(buildUrl(baseUrl, '/api/gateway/auth/register'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        displayName,
      }),
    });
    const registerPayload = await readJson(registerResponse);

    if (
      !registerResponse.ok &&
      !(
        typeof registerPayload === 'object' &&
        registerPayload !== null &&
        registerPayload.ok === false &&
        registerPayload.error?.code === 'AUTH_EMAIL_ALREADY_EXISTS'
      )
    ) {
      throw new Error(
        `register failed with ${registerResponse.status}: ${JSON.stringify(registerPayload)}`
      );
    }
  }

  const loginResponse = await fetch(buildUrl(baseUrl, '/api/gateway/auth/login'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });
  const loginPayload = await expectOkJson('login', loginResponse);

  if (!loginPayload.ok) {
    throw new Error(`login returned an auth error: ${JSON.stringify(loginPayload.error)}`);
  }

  const sessionToken = loginPayload.data.sessionToken;

  if (!sessionToken) {
    throw new Error('login did not return a session token.');
  }

  const workspaceCatalogResponse = await fetch(buildUrl(baseUrl, '/api/gateway/workspace/apps'), {
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
  });
  const workspaceCatalog = await expectOkJson('workspace catalog', workspaceCatalogResponse);

  if (!workspaceCatalog.ok) {
    throw new Error(`workspace catalog returned an error: ${JSON.stringify(workspaceCatalog.error)}`);
  }

  const selectedApp =
    workspaceCatalog.data.apps.find(app => app.id === smokeAppId) ?? workspaceCatalog.data.apps[0];
  const activeGroupId =
    smokeGroupId ??
    workspaceCatalog.data.defaultActiveGroupId ??
    workspaceCatalog.data.groups[0]?.id ??
    null;

  if (!selectedApp || !activeGroupId) {
    throw new Error('No launchable app or active group could be resolved from the catalog.');
  }

  const launchResponse = await fetch(buildUrl(baseUrl, '/api/gateway/workspace/apps/launch'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      appId: selectedApp.id,
      activeGroupId,
    }),
  });
  const launchPayload = await expectOkJson('workspace launch', launchResponse);

  if (!launchPayload.ok) {
    throw new Error(`workspace launch returned an error: ${JSON.stringify(launchPayload.error)}`);
  }

  const completionResponse = await fetch(buildUrl(baseUrl, '/api/gateway/v1/chat/completions'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      app_id: selectedApp.id,
      conversation_id: launchPayload.data.conversationId,
      messages: [
        {
          role: 'user',
          content: 'Return one short sentence proving the deploy smoke path is live.',
        },
      ],
    }),
  });
  const completionPayload = await expectOkJson('chat completion', completionResponse);

  const conversationResponse = await fetch(
    buildUrl(
      baseUrl,
      `/api/gateway/workspace/conversations/${launchPayload.data.conversationId}`
    ),
    {
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    }
  );
  const conversationPayload = await expectOkJson('workspace conversation', conversationResponse);

  let adminCheck = 'skipped_not_admin';

  const verifyAdminSurface = async token => {
    const adminContextResponse = await fetch(buildUrl(baseUrl, '/api/gateway/admin/context'), {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const adminContextPayload = await readJson(adminContextResponse);

    if (!adminContextResponse.ok || !adminContextPayload.ok) {
      throw new Error(
        `admin context failed with ${adminContextResponse.status}: ${JSON.stringify(adminContextPayload)}`
      );
    }

    const adminIdentityResponse = await fetch(buildUrl(baseUrl, '/api/gateway/admin/identity'), {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const adminIdentityPayload = await readJson(adminIdentityResponse);

    if (!adminIdentityResponse.ok || !adminIdentityPayload.ok) {
      throw new Error(
        `admin identity failed with ${adminIdentityResponse.status}: ${JSON.stringify(adminIdentityPayload)}`
      );
    }

    return adminContextPayload.data.capabilities.canReadAdmin ? 'verified' : 'skipped_not_admin';
  };

  try {
    adminCheck = await verifyAdminSurface(sessionToken);
  } catch (error) {
    if (!adminEmail) {
      throw error;
    }

    const adminLoginResponse = await fetch(buildUrl(baseUrl, '/api/gateway/auth/login'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
      }),
    });
    const adminLoginPayload = await expectOkJson('admin login', adminLoginResponse);
    adminCheck = await verifyAdminSurface(adminLoginPayload.data.sessionToken);
  }

  console.log(
    JSON.stringify(
      {
        baseUrl,
        email,
        appId: selectedApp.id,
        activeGroupId,
        conversationId: launchPayload.data.conversationId,
        runId: completionPayload.metadata?.run_id ?? launchPayload.data.runId,
        traceId: completionPayload.trace_id ?? launchPayload.data.traceId,
        messageCount: conversationPayload.data.messages.length,
        adminCheck,
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
