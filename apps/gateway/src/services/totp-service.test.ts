import { describe, expect, it } from 'vitest';

import { createOtpAuthUri, generateTotpCode, generateTotpSecret, verifyTotpCode } from './totp-service.js';

describe('totp service', () => {
  it('generates secrets and verifies codes in the current time window', () => {
    const secret = generateTotpSecret();
    const nowMs = Date.parse('2026-03-11T00:00:00.000Z');
    const code = generateTotpCode(secret, nowMs);

    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, nowMs)).toBe(true);
    expect(verifyTotpCode(secret, '000000', nowMs)).toBe(false);
  });

  it('creates a standard otpauth uri', () => {
    expect(
      createOtpAuthUri({
        issuer: 'AgentifUI',
        accountName: 'user@iflabx.com',
        secret: 'JBSWY3DPEHPK3PXP',
      })
    ).toContain('otpauth://totp/AgentifUI:user%40iflabx.com');
  });
});
