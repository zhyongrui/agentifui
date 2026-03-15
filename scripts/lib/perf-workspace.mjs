import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { buildUrl, expectOkJson, normalizeBaseUrl, readJson, requireEnv } from './perf-helpers.mjs';

const execFileAsync = promisify(execFile);

async function registerIfNeeded(baseUrl, { email, password, displayName }) {
  const response = await fetch(buildUrl(baseUrl, '/api/gateway/auth/register'), {
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

  const payload = await readJson(response);

  if (
    !response.ok &&
    !(
      typeof payload === 'object' &&
      payload !== null &&
      payload.ok === false &&
      payload.error?.code === 'AUTH_EMAIL_ALREADY_EXISTS'
    )
  ) {
    throw new Error(`register ${email} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }
}

async function login(baseUrl, { email, password }) {
  const response = await fetch(buildUrl(baseUrl, '/api/gateway/auth/login'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });
  const payload = await expectOkJson(`login ${email}`, response);

  if (!payload.ok || !payload.data?.sessionToken) {
    throw new Error(`login ${email} did not return a session token.`);
  }

  return payload.data;
}

async function fetchWorkspaceCatalog(baseUrl, sessionToken) {
  const response = await fetch(buildUrl(baseUrl, '/api/gateway/workspace/apps'), {
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
  });
  const payload = await expectOkJson('workspace catalog', response);

  if (!payload.ok) {
    throw new Error(`workspace catalog returned an error: ${JSON.stringify(payload.error)}`);
  }

  return payload.data;
}

async function launchConversation(baseUrl, sessionToken, { appId, activeGroupId }) {
  const response = await fetch(buildUrl(baseUrl, '/api/gateway/workspace/apps/launch'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      appId,
      activeGroupId,
    }),
  });
  const payload = await expectOkJson('workspace launch', response);

  if (!payload.ok) {
    throw new Error(`workspace launch returned an error: ${JSON.stringify(payload.error)}`);
  }

  return payload.data;
}

async function createCompletion(baseUrl, sessionToken, { appId, conversationId, content, model }) {
  const response = await fetch(buildUrl(baseUrl, '/api/gateway/v1/chat/completions'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      app_id: appId,
      conversation_id: conversationId,
      model: model ?? appId,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    }),
  });

  return expectOkJson('chat completion', response);
}

async function createConversationShare(baseUrl, sessionToken, conversationId, groupId) {
  const response = await fetch(
    buildUrl(baseUrl, `/api/gateway/workspace/conversations/${conversationId}/shares`),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        groupId,
      }),
    },
  );
  const payload = await expectOkJson('workspace share create', response);

  if (!payload.ok) {
    throw new Error(`workspace share creation failed: ${JSON.stringify(payload.error)}`);
  }

  return payload.data;
}

async function fetchRunList(baseUrl, sessionToken, conversationId) {
  const response = await fetch(
    buildUrl(baseUrl, `/api/gateway/workspace/conversations/${conversationId}/runs`),
    {
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    },
  );
  const payload = await expectOkJson('workspace run list', response);

  if (!payload.ok) {
    throw new Error(`workspace run list failed: ${JSON.stringify(payload.error)}`);
  }

  return payload.data.runs;
}

async function fetchSharedConversation(baseUrl, sessionToken, shareId) {
  const response = await fetch(buildUrl(baseUrl, `/api/gateway/workspace/shares/${shareId}`), {
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
  });
  const payload = await expectOkJson('workspace shared conversation', response);

  if (!payload.ok) {
    throw new Error(`workspace shared conversation failed: ${JSON.stringify(payload.error)}`);
  }

  return payload.data;
}

async function fetchAdminRoute(baseUrl, sessionToken, route) {
  const response = await fetch(buildUrl(baseUrl, route), {
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
  });

  return expectOkJson(route, response);
}

function readPerfConfig(env = process.env) {
  return {
    baseUrl: normalizeBaseUrl(requireEnv('PERF_BASE_URL')),
    password: env.PERF_PASSWORD?.trim() || 'Secure123',
    adminEmail: env.PERF_ADMIN_EMAIL?.trim() || 'admin-perf@iflabx.com',
    memberEmail: env.PERF_MEMBER_EMAIL?.trim() || 'perf-member@example.net',
    viewerEmail: env.PERF_VIEWER_EMAIL?.trim() || 'perf-viewer@example.net',
    policyAppId: env.PERF_POLICY_APP_ID?.trim() || 'app_policy_watch',
    historyTurns: Number.parseInt(env.PERF_HISTORY_TURNS ?? '6', 10),
    extraLaunches: Number.parseInt(env.PERF_EXTRA_LAUNCHES ?? '3', 10),
    adminReadBursts: Number.parseInt(env.PERF_ADMIN_READ_BURSTS ?? '4', 10),
    tenantId: env.PERF_TENANT_ID?.trim() || 'dev-tenant',
    databaseUrl: env.PERF_DATABASE_URL?.trim() || env.DATABASE_URL?.trim() || '',
  };
}

async function maybeRelaxQuotaForPerf(config) {
  if (!config.databaseUrl) {
    return false;
  }

  await execFileAsync(
    'psql',
    [
      config.databaseUrl,
      '-c',
      [
        'update workspace_quota_limits',
        'set monthly_limit = greatest(monthly_limit, 10000),',
        '    base_used = 0,',
        "    updated_at = now()",
        `where tenant_id = '${config.tenantId.replaceAll("'", "''")}';`,
      ].join(' '),
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: undefined,
      },
    },
  );

  return true;
}

async function seedPerfDataset(config = readPerfConfig()) {
  const seedId = `perf-${Date.now()}-${randomUUID().slice(0, 8)}`;

  await fetch(buildUrl(config.baseUrl, '/login'), {
    redirect: 'follow',
  });
  await expectOkJson(
    'gateway health',
    await fetch(buildUrl(config.baseUrl, '/api/gateway/health')),
  );

  await registerIfNeeded(config.baseUrl, {
    email: config.adminEmail,
    password: config.password,
    displayName: 'Perf Admin',
  });
  await registerIfNeeded(config.baseUrl, {
    email: config.memberEmail,
    password: config.password,
    displayName: 'Perf Member',
  });
  await registerIfNeeded(config.baseUrl, {
    email: config.viewerEmail,
    password: config.password,
    displayName: 'Perf Viewer',
  });

  const admin = await login(config.baseUrl, {
    email: config.adminEmail,
    password: config.password,
  });
  const member = await login(config.baseUrl, {
    email: config.memberEmail,
    password: config.password,
  });
  const viewer = await login(config.baseUrl, {
    email: config.viewerEmail,
    password: config.password,
  });

  const workspace = await fetchWorkspaceCatalog(config.baseUrl, member.sessionToken);
  const quotaWasRelaxed = await maybeRelaxQuotaForPerf(config);
  const workspaceAfterQuota = quotaWasRelaxed
    ? await fetchWorkspaceCatalog(config.baseUrl, member.sessionToken)
    : workspace;
  const selectedApp =
    workspaceAfterQuota.apps.find((app) => app.id === config.policyAppId) ??
    workspaceAfterQuota.apps[0] ??
    null;
  const activeGroupId = selectedApp
    ? selectedApp.grantedGroupIds.includes(workspaceAfterQuota.defaultActiveGroupId)
      ? workspaceAfterQuota.defaultActiveGroupId
      : selectedApp.grantedGroupIds[0] ?? workspaceAfterQuota.groups[0]?.id ?? null
    : workspaceAfterQuota.defaultActiveGroupId ?? workspaceAfterQuota.groups[0]?.id ?? null;

  if (!selectedApp || !activeGroupId) {
    throw new Error('Unable to resolve a launchable app and active group for perf seeding.');
  }

  const freshLaunch = await launchConversation(config.baseUrl, member.sessionToken, {
    appId: selectedApp.id,
    activeGroupId,
  });
  const freshCompletion = await createCompletion(config.baseUrl, member.sessionToken, {
    appId: selectedApp.id,
    conversationId: freshLaunch.conversationId,
    content: `[${seedId}] fresh completion smoke`,
  });

  const historyLaunch = await launchConversation(config.baseUrl, member.sessionToken, {
    appId: selectedApp.id,
    activeGroupId,
  });

  for (let index = 0; index < config.historyTurns; index += 1) {
    await createCompletion(config.baseUrl, member.sessionToken, {
      appId: selectedApp.id,
      conversationId: historyLaunch.conversationId,
      content: `[${seedId}] history turn ${index + 1} about policy deltas and evidence`,
    });
  }

  for (let index = 0; index < config.extraLaunches; index += 1) {
    const extraLaunch = await launchConversation(config.baseUrl, member.sessionToken, {
      appId: selectedApp.id,
      activeGroupId,
    });
    await createCompletion(config.baseUrl, member.sessionToken, {
      appId: selectedApp.id,
      conversationId: extraLaunch.conversationId,
      content: `[${seedId}] extra launch ${index + 1} to widen audit volume`,
    });
  }

  const historyRuns = await fetchRunList(
    config.baseUrl,
    member.sessionToken,
    historyLaunch.conversationId,
  );
  const latestHistoryRun = historyRuns[0] ?? null;

  if (!latestHistoryRun) {
    throw new Error('Perf seed expected the history conversation to have at least one run.');
  }

  const share = await createConversationShare(
    config.baseUrl,
    member.sessionToken,
    historyLaunch.conversationId,
    activeGroupId,
  );

  await fetchSharedConversation(config.baseUrl, viewer.sessionToken, share.id);

  for (let index = 0; index < config.adminReadBursts; index += 1) {
    await fetchAdminRoute(config.baseUrl, admin.sessionToken, '/api/gateway/admin/users');
    await fetchAdminRoute(config.baseUrl, admin.sessionToken, '/api/gateway/admin/apps');
    await fetchAdminRoute(
      config.baseUrl,
      admin.sessionToken,
      '/api/gateway/admin/audit?action=workspace.app.launched&limit=20',
    );
  }

  return {
    seedId,
    baseUrl: config.baseUrl,
    appId: selectedApp.id,
    activeGroupId,
    accounts: {
      adminEmail: config.adminEmail,
      memberEmail: config.memberEmail,
      viewerEmail: config.viewerEmail,
    },
    freshConversation: {
      conversationId: freshLaunch.conversationId,
      runId: freshCompletion.metadata?.run_id ?? freshLaunch.runId,
    },
    historyConversation: {
      conversationId: historyLaunch.conversationId,
      latestRunId: latestHistoryRun.id,
      runCount: historyRuns.length,
      shareId: share.id,
      shareUrl: share.shareUrl,
      messageCount: config.historyTurns * 2 + 2,
    },
    seedConfig: {
      historyTurns: config.historyTurns,
      extraLaunches: config.extraLaunches,
      adminReadBursts: config.adminReadBursts,
      quotaWasRelaxed,
    },
    generatedAt: new Date().toISOString(),
  };
}

export {
  createCompletion,
  fetchAdminRoute,
  fetchRunList,
  fetchSharedConversation,
  fetchWorkspaceCatalog,
  launchConversation,
  login,
  readPerfConfig,
  registerIfNeeded,
  seedPerfDataset,
};
