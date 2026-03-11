export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRule =
  | 'min_length'
  | 'uppercase'
  | 'lowercase'
  | 'number';

export type PasswordValidationResult = {
  isValid: boolean;
  satisfiedRules: PasswordRule[];
  missingRules: PasswordRule[];
};

const PASSWORD_RULES: Record<PasswordRule, RegExp | number> = {
  min_length: PASSWORD_MIN_LENGTH,
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  number: /[0-9]/,
};

export function validatePassword(password: string): PasswordValidationResult {
  const satisfiedRules = (Object.entries(PASSWORD_RULES) as [
    PasswordRule,
    RegExp | number,
  ][])
    .filter(([rule, requirement]) => {
      if (rule === 'min_length' && typeof requirement === 'number') {
        return password.length >= requirement;
      }

      return requirement instanceof RegExp ? requirement.test(password) : false;
    })
    .map(([rule]) => rule);

  const missingRules = (Object.keys(PASSWORD_RULES) as PasswordRule[]).filter(
    rule => !satisfiedRules.includes(rule)
  );

  return {
    isValid: missingRules.length === 0,
    satisfiedRules,
    missingRules,
  };
}
