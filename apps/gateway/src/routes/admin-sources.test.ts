import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createAdminService } from '../services/admin-service.js';
import { createAuditService } from '../services/audit-service.js';
import { createAuthService } from '../services/auth-service.js';
import { createKnowledgeService } from '../services/knowledge-service.js';

const testEnv = {
  nodeEnv: 'test' as const,
  host: '127.0.0.1',
  port: 4000,
  corsOrigin: true,
  ssoDomainMap: {},
  defaultTenantId: 'tenant-dev',
  defaultSsoUserStatus: 'pending' as const,
  authLockoutThreshold: 5,
  authLockoutDurationMs: 1800000,
  degradedRuntimeIds: [],
};

function createTestAuthService() {
  return createAuthService({
    defaultTenantId: testEnv.defaultTenantId,
    defaultSsoUserStatus: testEnv.defaultSsoUserStatus,
    lockoutThreshold: testEnv.authLockoutThreshold,
    lockoutDurationMs: testEnv.authLockoutDurationMs,
  });
}

describe('admin knowledge sources routes', () => {
  it('lists, creates and updates knowledge sources for admin users', async () => {
    const authService = createTestAuthService();
    const auditService = createAuditService();
    const app = await buildApp(testEnv, {
      logger: false,
      authService,
      auditService,
      adminService: createAdminService(),
      knowledgeService: createKnowledgeService(),
    });

    await authService.register({
      email: 'admin@iflabx.com',
      password: 'Secure123',
      displayName: 'Admin User',
    });
    const loginResult = await authService.login({
      email: 'admin@iflabx.com',
      password: 'Secure123',
    });

    if (!loginResult.ok) {
      throw new Error('Expected admin login to succeed in test.');
    }

    const headers = {
      authorization: `Bearer ${loginResult.data.sessionToken}`,
    };
    const listResponse = await app.inject({
      method: 'GET',
      url: '/admin/sources',
      headers,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      ok: true,
      data: {
        sources: [
          {
            id: 'src_policy_watch_handbook',
            status: 'succeeded',
            hasContent: true,
            chunking: {
              strategy: 'markdown_sections',
            },
          },
        ],
      },
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/admin/sources',
      headers,
      payload: {
        title: 'Dorm policy digest',
        sourceKind: 'markdown',
        sourceUri: null,
        content: '# Dorm policy digest\n\nWeekday quiet hours start at 23:00.\n\n## Exceptions\n\nLate lab access requires approval.',
        scope: 'group',
        groupId: 'grp_research',
        labels: ['Policy', 'Dormitory'],
        updatedSourceAt: '2026-03-15T00:00:00.000Z',
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      ok: true,
      data: {
        title: 'Dorm policy digest',
        scope: 'group',
        groupId: 'grp_research',
        labels: ['policy', 'dormitory'],
        status: 'queued',
        hasContent: true,
        chunkCount: 2,
        chunking: {
          strategy: 'markdown_sections',
          targetChunkChars: 1200,
          overlapChars: 160,
        },
      },
    });

    const createdSourceId = createResponse.json().data.id as string;
    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/admin/sources/${createdSourceId}/status`,
      headers,
      payload: {
        status: 'succeeded',
        content: [
          '# Dorm policy digest',
          '',
          'Weekday quiet hours start at 23:00 and weekend quiet hours start at 00:00.',
          '',
          '## Exceptions',
          '',
          'Late lab access requires approval and badge logging.',
          '',
          '## Enforcement',
          '',
          'Repeated violations trigger RA follow-up.',
        ].join('\n'),
        chunkCount: 18,
        lastError: null,
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      ok: true,
      data: {
        id: createdSourceId,
        status: 'succeeded',
        hasContent: true,
        chunkCount: 3,
        chunking: {
          strategy: 'markdown_sections',
          targetChunkChars: 1200,
          overlapChars: 160,
        },
      },
    });

    const auditEvents = await auditService.listEvents({ tenantId: 'tenant-dev', limit: 10 });
    expect(auditEvents.map(event => event.action)).toEqual(
      expect.arrayContaining([
        'admin.workspace.read',
        'knowledge.source.created',
        'knowledge.source.status_updated',
      ]),
    );

    await app.close();
  });

  it('rejects non-admin access to knowledge sources', async () => {
    const authService = createTestAuthService();
    const app = await buildApp(testEnv, {
      logger: false,
      authService,
      adminService: createAdminService(),
      knowledgeService: createKnowledgeService(),
    });

    await authService.register({
      email: 'member@example.net',
      password: 'Secure123',
      displayName: 'Member User',
    });
    const loginResult = await authService.login({
      email: 'member@example.net',
      password: 'Secure123',
    });

    if (!loginResult.ok) {
      throw new Error('Expected member login to succeed in test.');
    }

    const response = await app.inject({
      method: 'GET',
      url: '/admin/sources',
      headers: {
        authorization: `Bearer ${loginResult.data.sessionToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'ADMIN_FORBIDDEN',
      },
    });

    await app.close();
  });
});
