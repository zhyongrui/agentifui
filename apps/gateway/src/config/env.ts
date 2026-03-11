export type GatewayEnv = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  corsOrigin: boolean | string;
  ssoDomainMap: Record<string, string>;
};

const DEFAULT_GATEWAY_HOST = '0.0.0.0';
const DEFAULT_GATEWAY_PORT = 4000;

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

export function parseGatewayEnv(source: NodeJS.ProcessEnv): GatewayEnv {
  return {
    nodeEnv: parseNodeEnv(source.NODE_ENV),
    host: source.GATEWAY_HOST ?? DEFAULT_GATEWAY_HOST,
    port: parsePort(source.GATEWAY_PORT),
    corsOrigin:
      source.GATEWAY_CORS_ORIGIN && source.GATEWAY_CORS_ORIGIN !== 'true'
        ? source.GATEWAY_CORS_ORIGIN
        : true,
    ssoDomainMap: parseSsoDomainMap(source.GATEWAY_SSO_DOMAINS),
  };
}
