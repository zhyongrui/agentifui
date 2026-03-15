export type GatewayRuntimeHealthState = "available" | "degraded";

export type GatewayRuntimeHealthSnapshot = {
  overallStatus: GatewayRuntimeHealthState;
  runtimes: Array<{
    id: string;
    label: string;
    status: GatewayRuntimeHealthState;
    capabilities: {
      streaming: boolean;
      citations: boolean;
      artifacts: boolean;
      safety: boolean;
      pendingActions: boolean;
      files: boolean;
    };
  }>;
};

export type GatewayHealthResponse = {
  status: "ok";
  service: "gateway";
  slice: string;
  environment: string;
  startedAt: string;
  uptimeSeconds: number;
  inflightRequests: number;
  runtime: GatewayRuntimeHealthSnapshot;
  time: string;
};

const GATEWAY_PROXY_BASE_PATH = "/api/gateway";

export async function fetchGatewayHealth(): Promise<GatewayHealthResponse | null> {
  try {
    const response = await fetch(`${GATEWAY_PROXY_BASE_PATH}/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as GatewayHealthResponse;
  } catch {
    return null;
  }
}
