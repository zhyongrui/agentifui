import type {
  AdminAuditPayloadInspection,
  AdminAuditPayloadMode,
  AdminAuditPiiDetector,
  AdminAuditPiiMatch,
} from '@agentifui/shared/admin';

type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };

type SensitiveStringMatch = {
  detector: AdminAuditPiiDetector;
  maskedValue: string;
  risk: AdminAuditPiiMatch['risk'];
  valuePreview: string;
};

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const EMAIL_TEST_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const PHONE_TEST_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/;
const SECRET_KEY_PATTERN = /(manual.*key|otp.*uri|password|secret|setup.*token)/i;
const TOKEN_KEY_PATTERN = /(api.*key|bearer|invite.*token|session.*token|token)/i;
const VALUE_TOKEN_PATTERN = /\b(?:ghp|pat|sk|tok)_[A-Za-z0-9_-]{8,}\b/;

function joinPath(parentPath: string, segment: string | number) {
  if (typeof segment === 'number') {
    return `${parentPath}[${segment}]`;
  }

  if (!parentPath) {
    return segment;
  }

  return `${parentPath}.${segment}`;
}

function maskEmailAddress(value: string) {
  const [localPart, domain] = value.split('@');

  if (!localPart || !domain) {
    return '[REDACTED email]';
  }

  const visiblePrefix = localPart[0] ?? '*';

  return `${visiblePrefix}${'*'.repeat(Math.max(localPart.length - 1, 2))}@${domain}`;
}

function maskPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  const suffix = digits.slice(-4);

  return suffix ? `[REDACTED phone ••${suffix}]` : '[REDACTED phone]';
}

function buildLengthPreview(value: string) {
  return `length ${value.length}`;
}

function maskHighRiskValue(detector: 'secret' | 'token', value: string) {
  return `[REDACTED ${detector.toUpperCase()} len=${value.length}]`;
}

function detectSensitiveString(keyName: string | null, value: string): SensitiveStringMatch | null {
  const normalizedKey = keyName ?? '';

  if (SECRET_KEY_PATTERN.test(normalizedKey) || value.startsWith('otpauth://')) {
    return {
      detector: 'secret',
      risk: 'high',
      maskedValue: maskHighRiskValue('secret', value),
      valuePreview: buildLengthPreview(value),
    };
  }

  if (TOKEN_KEY_PATTERN.test(normalizedKey) || VALUE_TOKEN_PATTERN.test(value)) {
    return {
      detector: 'token',
      risk: 'high',
      maskedValue: maskHighRiskValue('token', value),
      valuePreview: buildLengthPreview(value),
    };
  }

  if (EMAIL_TEST_PATTERN.test(value)) {
    return {
      detector: 'email',
      risk: 'moderate',
      maskedValue: value.replace(EMAIL_PATTERN, match => maskEmailAddress(match)),
      valuePreview: value.replace(EMAIL_PATTERN, match => maskEmailAddress(match)),
    };
  }

  const phoneDigits = value.replace(/\D/g, '');

  if (phoneDigits.length >= 10 && phoneDigits.length <= 15 && PHONE_TEST_PATTERN.test(value)) {
    return {
      detector: 'phone',
      risk: 'moderate',
      maskedValue: value.replace(PHONE_PATTERN, match => maskPhoneNumber(match)),
      valuePreview: maskPhoneNumber(value),
    };
  }

  return null;
}

function inspectValue(
  value: JsonValue,
  path: string,
  matches: AdminAuditPiiMatch[],
  mode: AdminAuditPayloadMode,
  keyName: string | null
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry, index) => inspectValue(entry, joinPath(path, index), matches, mode, keyName));
  }

  if (typeof value === 'string') {
    const detection = detectSensitiveString(keyName, value);

    if (!detection) {
      return value;
    }

    matches.push({
      path: path || '$',
      detector: detection.detector,
      risk: detection.risk,
      valuePreview: detection.valuePreview,
      maskedValue: detection.maskedValue,
    });

    return mode === 'masked' ? detection.maskedValue : value;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      inspectValue(entryValue as JsonValue, joinPath(path, entryKey), matches, mode, entryKey),
    ])
  );
}

export function inspectAdminAuditPayload(
  payload: Record<string, unknown>,
  mode: AdminAuditPayloadMode
): {
  inspection: AdminAuditPayloadInspection;
  payload: Record<string, unknown>;
} {
  const matches: AdminAuditPiiMatch[] = [];
  const normalizedPayload = inspectValue(payload as JsonValue, '', matches, mode, null);

  return {
    payload:
      normalizedPayload && typeof normalizedPayload === 'object' && !Array.isArray(normalizedPayload)
        ? (normalizedPayload as Record<string, unknown>)
        : {},
    inspection: {
      mode,
      containsSensitiveData: matches.length > 0,
      moderateMatchCount: matches.filter(match => match.risk === 'moderate').length,
      highRiskMatchCount: matches.filter(match => match.risk === 'high').length,
      matches,
    },
  };
}
