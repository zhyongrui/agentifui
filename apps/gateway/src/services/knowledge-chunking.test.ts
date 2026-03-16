import { describe, expect, it } from 'vitest';

import { buildKnowledgeChunkPlan } from './knowledge-chunking.js';

describe('knowledge chunking', () => {
  it('chunks markdown sources by heading-aware sections', () => {
    const plan = buildKnowledgeChunkPlan({
      sourceKind: 'markdown',
      content: [
        '# Dormitory policy',
        '',
        'Lights-out starts at 23:00 on weekdays.',
        '',
        '## Exceptions',
        '',
        'Students in approved labs may apply for late access.',
        '',
        '## Enforcement',
        '',
        'Repeated violations trigger RA follow-up and audit logging.',
      ].join('\n'),
    });

    expect(plan.strategy).toBe('markdown_sections');
    expect(plan.chunks.length).toBeGreaterThanOrEqual(2);
    expect(plan.chunks[0]?.headingPath[0]).toBe('Dormitory policy');
    expect(plan.chunks.some(chunk => chunk.headingPath.includes('Exceptions'))).toBe(true);
  });

  it('chunks plain text sources into paragraph windows', () => {
    const plan = buildKnowledgeChunkPlan({
      sourceKind: 'url',
      content: Array.from({ length: 12 }, (_, index) => `Paragraph ${index + 1}: policy delta detail.`).join(
        '\n\n',
      ),
    });

    expect(plan.strategy).toBe('paragraph_windows');
    expect(plan.chunks.length).toBeGreaterThan(0);
    expect(plan.chunks.every(chunk => chunk.headingPath.length === 0)).toBe(true);
    expect(plan.chunks[0]?.tokenEstimate).toBeGreaterThan(0);
  });
});
