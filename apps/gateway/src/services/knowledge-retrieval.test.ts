import { describe, expect, it } from 'vitest';

import {
  buildKnowledgeRetrievalQuery,
  rankKnowledgeMatches,
} from './knowledge-retrieval.js';

describe('knowledge retrieval', () => {
  it('normalizes query metadata for runtime consumption', () => {
    const query = buildKnowledgeRetrievalQuery({
      appId: 'app_policy_watch',
      conversationId: 'conv_123',
      groupId: 'grp_research',
      latestPrompt: '  summarize dormitory quiet-hours updates  ',
      limit: 9,
    });

    expect(query).toEqual({
      appId: 'app_policy_watch',
      conversationId: 'conv_123',
      groupId: 'grp_research',
      queryText: 'summarize dormitory quiet-hours updates',
      limit: 8,
    });
  });

  it('ranks chunk matches and drops irrelevant chunks', () => {
    const query = buildKnowledgeRetrievalQuery({
      appId: 'app_policy_watch',
      conversationId: 'conv_123',
      groupId: 'grp_research',
      latestPrompt: 'dormitory quiet hours updates',
      limit: 3,
    });

    const matches = rankKnowledgeMatches(query, [
      {
        sourceId: 'src_1',
        chunkId: 'chunk_1',
        title: 'Dormitory handbook',
        sourceKind: 'markdown',
        sourceUri: null,
        scope: 'group',
        groupId: 'grp_research',
        labels: ['policy', 'dormitory'],
        headingPath: ['Dormitory handbook', 'Quiet hours'],
        preview: 'Quiet hours begin at 23:00 on weekdays.',
        content: 'Quiet hours begin at 23:00 on weekdays and 00:00 on weekends.',
        score: 0,
      },
      {
        sourceId: 'src_2',
        chunkId: 'chunk_2',
        title: 'Lab access',
        sourceKind: 'markdown',
        sourceUri: null,
        scope: 'group',
        groupId: 'grp_research',
        labels: ['lab'],
        headingPath: ['Late access'],
        preview: 'Badge logs are retained for 30 days.',
        content: 'Badge logs are retained for 30 days.',
        score: 0,
      },
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      sourceId: 'src_1',
      headingPath: expect.arrayContaining(['Quiet hours']),
    });
    expect(matches[0]?.score).toBeGreaterThan(0);
  });
});
