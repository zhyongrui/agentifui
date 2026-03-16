import { describe, expect, it } from 'vitest';

import { createKnowledgeService } from './knowledge-service.js';

const user = {
  id: 'user_admin',
  tenantId: 'tenant-dev',
  email: 'admin@iflabx.com',
  displayName: 'Admin User',
  status: 'active' as const,
  createdAt: '2026-03-16T00:00:00.000Z',
  lastLoginAt: '2026-03-16T00:05:00.000Z',
};

describe('knowledge service access control', () => {
  it('keeps retrieval scoped to tenant sources plus the active member group', async () => {
    const service = createKnowledgeService();

    const tenantSource = await service.createSourceForUser(user, {
      title: 'Tenant dorm policy',
      sourceKind: 'markdown',
      sourceUri: null,
      content: '# Dorm policy\n\nDormitory quiet hours begin at 23:00.',
      scope: 'tenant',
      groupId: null,
      labels: ['policy'],
      updatedSourceAt: null,
    });
    const securitySource = await service.createSourceForUser(user, {
      title: 'Security escalation playbook',
      sourceKind: 'markdown',
      sourceUri: null,
      content: '# Security\n\nSecurity office escalation paths for incidents.',
      scope: 'group',
      groupId: 'grp_security',
      labels: ['security'],
      updatedSourceAt: null,
    });

    if (!tenantSource.ok || !securitySource.ok) {
      throw new Error('expected test sources to be created');
    }

    await service.updateSourceStatusForUser(user, tenantSource.data.id, {
      status: 'succeeded',
      chunkCount: null,
      lastError: null,
    });
    await service.updateSourceStatusForUser(user, securitySource.data.id, {
      status: 'succeeded',
      chunkCount: null,
      lastError: null,
    });

    const retrieval = await service.buildRetrievalForUser(user, {
      appId: 'app_policy_watch',
      conversationId: 'conv_123',
      groupId: 'grp_research',
      latestPrompt: 'summarize dorm policy updates',
    });

    expect(retrieval.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Policy Watch handbook',
          scope: 'group',
          groupId: 'grp_research',
        }),
        expect.objectContaining({
          title: 'Tenant dorm policy',
          scope: 'tenant',
          groupId: null,
        }),
      ]),
    );
    expect(retrieval.matches).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Security escalation playbook',
        }),
      ]),
    );
  });
});
