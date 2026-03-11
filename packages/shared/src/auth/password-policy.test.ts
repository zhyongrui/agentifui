import { describe, expect, it } from 'vitest';

import {
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from './password-policy.js';

describe('validatePassword', () => {
  it('accepts a password that satisfies all current rules', () => {
    expect(validatePassword('Secure123')).toEqual({
      isValid: true,
      satisfiedRules: ['min_length', 'uppercase', 'lowercase', 'number'],
      missingRules: [],
    });
  });

  it('reports each missing rule individually', () => {
    expect(validatePassword('short')).toEqual({
      isValid: false,
      satisfiedRules: ['lowercase'],
      missingRules: ['min_length', 'uppercase', 'number'],
    });
  });

  it('enforces the configured minimum length', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});
