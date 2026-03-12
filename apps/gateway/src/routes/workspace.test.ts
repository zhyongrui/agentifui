import type {
  WorkspaceAppLaunchResponse,
  WorkspaceCatalogResponse,
  WorkspaceConversationResponse,
  WorkspacePreferencesResponse,
} from '@agentifui/shared/apps';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAuthService } from '../services/auth-service.js';

const testEnv: {
  nodeEnv: 'test';
  host: string;
  port: number;
  corsOrigin: boolean;
  ssoDomainMap: Record<string, string>;
  defaultTenantId: string;
  defaultSsoUserStatus: 'pending' | 'active';
  authLockoutThreshold: number;
  authLockoutDurationMs: number;
} = {
  nodeEnv: 'test' as const,
  host: '127.0.0.1',
  port: 4000,
  corsOrigin: true,
  ssoDomainMap: {
    'iflabx.com': 'iflabx-sso',
  },
  defaultTenantId: 'tenant-dev',
  defaultSsoUserStatus: 'pending',
  authLockoutThreshold: 5,
  authLockoutDurationMs: 1800000,
};

function createTestAuthService(overrides: Partial<Parameters<typeof createAuthService>[0]> = {}) {
  return createAuthService({
    defaultTenantId: testEnv.defaultTenantId,
    defaultSsoUserStatus: testEnv.defaultSsoUserStatus,
    lockoutThreshold: testEnv.authLockoutThreshold,
    lockoutDurationMs: testEnv.authLockoutDurationMs,
    ...overrides,
  });
}

async function createTestApp(
  authService = createTestAuthService(),
  envOverrides: Partial<typeof testEnv> = {}
) {
  const app = await buildApp(
    {
      ...testEnv,
      ...envOverrides,
    },
    {
      logger: false,
      authService,
    }
  );

  return {
    app,
    authService,
  };
}

describe('workspace routes', () => {
  it('rejects requests without a bearer token', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/workspace/apps',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'WORKSPACE_UNAUTHORIZED',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects pending users even when they hold a session token', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);
    const login = authService.loginWithSso({
      email: 'pending@iflabx.com',
      providerId: 'iflabx-sso',
      displayName: 'Pending User',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected pending sso login to succeed');
    }

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/workspace/apps',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'WORKSPACE_FORBIDDEN',
          details: {
            status: 'pending',
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it('returns only the authorized app union for a normal active member', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });

    const login = authService.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected active login to succeed');
    }

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/workspace/apps',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json() as WorkspaceCatalogResponse;

      expect(body.ok).toBe(true);
      expect(body.data.memberGroupIds).toEqual(['grp_product', 'grp_research']);
      expect(body.data.defaultActiveGroupId).toBe('grp_product');
      expect(body.data.favoriteAppIds).toEqual([]);
      expect(body.data.recentAppIds).toEqual([]);
      expect(body.data.groups.map(group => group.id)).toEqual(['grp_product', 'grp_research']);
      expect(body.data.apps.map(workspaceApp => workspaceApp.id)).toEqual([
        'app_market_brief',
        'app_service_copilot',
        'app_release_radar',
        'app_policy_watch',
        'app_runbook_mentor',
      ]);
    } finally {
      await app.close();
    }
  });

  it('returns the security-only catalog for audit users', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: 'security@iflabx.com',
      password: 'Secure123',
      displayName: 'Security User',
    });

    const login = authService.login({
      email: 'security@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected security login to succeed');
    }

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/workspace/apps',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json() as WorkspaceCatalogResponse;

      expect(body.data.memberGroupIds).toEqual(['grp_security']);
      expect(body.data.groups.map(group => group.id)).toEqual(['grp_security']);
      expect(body.data.apps.map(workspaceApp => workspaceApp.id)).toEqual(['app_audit_lens']);
    } finally {
      await app.close();
    }
  });

  it('persists workspace preferences for the active user', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });

    const login = authService.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected active login to succeed');
    }

    try {
      const updateResponse = await app.inject({
        method: 'PUT',
        url: '/workspace/preferences',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          favoriteAppIds: ['app_policy_watch', 'app_unknown', 'app_policy_watch'],
          recentAppIds: ['app_market_brief', 'app_unknown'],
          defaultActiveGroupId: 'grp_research',
        },
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toEqual({
        ok: true,
        data: {
          favoriteAppIds: ['app_policy_watch'],
          recentAppIds: ['app_market_brief'],
          defaultActiveGroupId: 'grp_research',
          updatedAt: expect.any(String),
        },
      });

      const preferencesResponse = await app.inject({
        method: 'GET',
        url: '/workspace/preferences',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(preferencesResponse.statusCode).toBe(200);
      expect(preferencesResponse.json()).toEqual({
        ok: true,
        data: {
          favoriteAppIds: ['app_policy_watch'],
          recentAppIds: ['app_market_brief'],
          defaultActiveGroupId: 'grp_research',
          updatedAt: expect.any(String),
        },
      } satisfies WorkspacePreferencesResponse);

      const catalogResponse = await app.inject({
        method: 'GET',
        url: '/workspace/apps',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(catalogResponse.statusCode).toBe(200);

      const catalogBody = catalogResponse.json() as WorkspaceCatalogResponse;

      expect(catalogBody.data.defaultActiveGroupId).toBe('grp_research');
      expect(catalogBody.data.favoriteAppIds).toEqual(['app_policy_watch']);
      expect(catalogBody.data.recentAppIds).toEqual(['app_market_brief']);
    } finally {
      await app.close();
    }
  });

  it('creates a conversation-backed launch for an authorized app and records it as recent', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });

    const login = authService.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected active login to succeed');
    }

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/workspace/apps/launch',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: 'app_policy_watch',
          activeGroupId: 'grp_research',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json() as WorkspaceAppLaunchResponse;

      expect(body).toMatchObject({
        ok: true,
        data: {
          status: 'conversation_ready',
          conversationId: expect.any(String),
          runId: expect.any(String),
          traceId: expect.any(String),
          app: {
            id: 'app_policy_watch',
          },
          attributedGroup: {
            id: 'grp_research',
          },
        },
      });
      expect(body.data.launchUrl).toContain('/chat/');

      const conversationId = body.data.conversationId;
      const runId = body.data.runId;
      const traceId = body.data.traceId;

      expect(conversationId).toBeTruthy();
      expect(runId).toBeTruthy();
      expect(traceId).toBeTruthy();

      if (!conversationId || !runId || !traceId) {
        throw new Error('expected launch payload to include conversation, run and trace ids');
      }

      const catalogResponse = await app.inject({
        method: 'GET',
        url: '/workspace/apps',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(catalogResponse.statusCode).toBe(200);
      expect((catalogResponse.json() as WorkspaceCatalogResponse).data.recentAppIds).toEqual([
        'app_policy_watch',
      ]);

      const conversationResponse = await app.inject({
        method: 'GET',
        url: `/workspace/conversations/${conversationId}`,
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
      });

      expect(conversationResponse.statusCode).toBe(200);
      expect(conversationResponse.json()).toEqual({
        ok: true,
        data: {
          id: conversationId,
          title: 'Policy Watch',
          status: 'active',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          launchId: body.data.id,
          app: {
            id: 'app_policy_watch',
            slug: 'policy-watch',
            name: 'Policy Watch',
            summary: '跟踪政策变化、合规要求和影响说明。',
            kind: 'governance',
            status: 'ready',
            shortCode: 'PW',
          },
          activeGroup: {
            id: 'grp_research',
            name: 'Research Lab',
            description: '负责分析洞察、策略研究和知识整理。',
          },
          run: {
            id: runId,
            type: 'agent',
            status: 'pending',
            traceId,
            createdAt: expect.any(String),
          },
        },
      } satisfies WorkspaceConversationResponse);
    } finally {
      await app.close();
    }
  });

  it('rejects invalid workspace preference payloads and blocked launches', async () => {
    const authService = createTestAuthService();
    const { app } = await createTestApp(authService);

    authService.register({
      email: 'developer@iflabx.com',
      password: 'Secure123',
      displayName: 'Developer',
    });

    const login = authService.login({
      email: 'developer@iflabx.com',
      password: 'Secure123',
    });

    expect(login.ok).toBe(true);

    if (!login.ok) {
      throw new Error('expected active login to succeed');
    }

    try {
      const invalidPreferences = await app.inject({
        method: 'PUT',
        url: '/workspace/preferences',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          favoriteAppIds: 'broken',
          recentAppIds: [],
          defaultActiveGroupId: 'grp_product',
        },
      });

      expect(invalidPreferences.statusCode).toBe(400);
      expect(invalidPreferences.json()).toMatchObject({
        ok: false,
        error: {
          code: 'WORKSPACE_INVALID_PAYLOAD',
        },
      });

      const blockedLaunch = await app.inject({
        method: 'POST',
        url: '/workspace/apps/launch',
        headers: {
          authorization: `Bearer ${login.data.sessionToken}`,
        },
        payload: {
          appId: 'app_policy_watch',
          activeGroupId: 'grp_product',
        },
      });

      expect(blockedLaunch.statusCode).toBe(409);
      expect(blockedLaunch.json()).toMatchObject({
        ok: false,
        error: {
          code: 'WORKSPACE_LAUNCH_BLOCKED',
          details: {
            reason: 'group_switch_required',
          },
        },
      });
    } finally {
      await app.close();
    }
  });
});
