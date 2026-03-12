import { describe, expect, it } from 'vitest';

import { inspectAdminAuditPayload } from './admin-audit-pii.js';

describe('admin audit pii inspection', () => {
  it('masks email and token-like fields in masked mode', () => {
    const result = inspectAdminAuditPayload(
      {
        subjectUserEmail: 'member@example.com',
        inviteToken: 'tok_1234567890ABCDEFGHI',
        nested: {
          contactPhone: '+1 (555) 444-1234',
        },
      },
      'masked'
    );

    expect(result.payload).toEqual({
      subjectUserEmail: 'm*****@example.com',
      inviteToken: '[REDACTED TOKEN len=23]',
      nested: {
        contactPhone: '[REDACTED phone ••1234]',
      },
    });
    expect(result.inspection).toMatchObject({
      mode: 'masked',
      containsSensitiveData: true,
      moderateMatchCount: 2,
      highRiskMatchCount: 1,
    });
    expect(result.inspection.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'subjectUserEmail',
          detector: 'email',
          risk: 'moderate',
        }),
        expect.objectContaining({
          path: 'inviteToken',
          detector: 'token',
          risk: 'high',
        }),
        expect.objectContaining({
          path: 'nested.contactPhone',
          detector: 'phone',
          risk: 'moderate',
        }),
      ])
    );
  });

  it('keeps original payload values when raw mode is requested', () => {
    const result = inspectAdminAuditPayload(
      {
        subjectUserEmail: 'member@example.com',
        setupToken: 'super-secret-setup-token',
      },
      'raw'
    );

    expect(result.payload).toEqual({
      subjectUserEmail: 'member@example.com',
      setupToken: 'super-secret-setup-token',
    });
    expect(result.inspection).toMatchObject({
      mode: 'raw',
      containsSensitiveData: true,
      moderateMatchCount: 1,
      highRiskMatchCount: 1,
    });
  });
});
