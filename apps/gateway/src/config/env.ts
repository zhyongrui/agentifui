import type { AuthUserStatus } from '@agentifui/shared/auth';

type SsoJitUserStatus = Extract<AuthUserStatus, 'pending' | 'active'>;

export type GatewayEnv = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  corsOrigin: boolean | string;
  databaseUrl?: string;
  ssoDomainMap: Record<string, string>;
  defaultTenantId: string;
  defaultSsoUserStatus: SsoJitUserStatus;
  authLockoutThreshold: number;
  authLockoutDurationMs: number;
};

const DEFAULT_GATEWAY_HOST = '0.0.0.0';
const DEFAULT_GATEWAY_PORT = 4000;
const DEFAULT_TENANT_ID = 'dev-tenant';
const DEFAULT_SSO_JIT_USER_STATUS: SsoJitUserStatus = 'pending';
const DEFAULT_AUTH_LOCKOUT_THRESHOLD = 5;
const DEFAULT_AUTH_LOCKOUT_DURATION_MS = 30 * 60 * 1000;

function parsePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_GATEWAY_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid GATEWAY_PORT value: ${value}`);
  }

  return port;
}

function parsePositiveInteger(
  value: string | undefined,
  defaultValue: number,
  label: string
): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label} value: ${value}`);
  }

  return parsed;
}

function parseNodeEnv(value: string | undefined): GatewayEnv['nodeEnv'] {
  if (value === 'production' || value === 'test') {
    return value;
  }

  return 'development';
}

function parseSsoDomainMap(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, entry) => {
      const [rawDomain, rawProvider] = entry.split('=');
      const domain = rawDomain?.trim().toLowerCase();
      const providerId = rawProvider?.trim();

      if (domain && providerId) {
        accumulator[domain] = providerId;
      }

      return accumulator;
    }, {});
}

function parseSsoJitUserStatus(value: string | undefined): SsoJitUserStatus {
  if (!value) {
    return DEFAULT_SSO_JIT_USER_STATUS;
  }

  if (value === 'pending' || value === 'active') {
    return value;
  }

  throw new Error(`Invalid GATEWAY_SSO_JIT_DEFAULT_STATUS value: ${value}`);
}

export function parseGatewayEnv(source: NodeJS.ProcessEnv): GatewayEnv {
  return {
    nodeEnv: parseNodeEnv(source.NODE_ENV),
    host: source.GATEWAY_HOST ?? DEFAULT_GATEWAY_HOST,
    port: parsePort(source.GATEWAY_PORT),
    corsOrigin:
      source.GATEWAY_CORS_ORIGIN && source.GATEWAY_CORS_ORIGIN !== 'true'
        ? source.GATEWAY_CORS_ORIGIN
        : true,
    databaseUrl: source.DATABASE_URL?.trim() || undefined,
    ssoDomainMap: parseSsoDomainMap(source.GATEWAY_SSO_DOMAINS),
    defaultTenantId: source.GATEWAY_DEFAULT_TENANT_ID ?? DEFAULT_TENANT_ID,
    defaultSsoUserStatus: parseSsoJitUserStatus(
      source.GATEWAY_SSO_JIT_DEFAULT_STATUS
    ),
    authLockoutThreshold: parsePositiveInteger(
      source.GATEWAY_AUTH_LOCKOUT_THRESHOLD,
      DEFAULT_AUTH_LOCKOUT_THRESHOLD,
      'GATEWAY_AUTH_LOCKOUT_THRESHOLD'
    ),
    authLockoutDurationMs: parsePositiveInteger(
      source.GATEWAY_AUTH_LOCKOUT_DURATION_MS,
      DEFAULT_AUTH_LOCKOUT_DURATION_MS,
      'GATEWAY_AUTH_LOCKOUT_DURATION_MS'
    ),
  };
}
