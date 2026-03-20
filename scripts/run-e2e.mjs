import { spawn } from "node:child_process";
import net from "node:net";
import postgres from "postgres";

import { getPlaywrightHostCapability } from "./prepare-playwright-runtime.mjs";

const DATABASE_URL =
  "postgresql://agentifui:agentifui@localhost:5432/agentifui";
const E2E_TENANT_ID = process.env.GATEWAY_DEFAULT_TENANT_ID ?? "dev-tenant";
const DEFAULT_GATEWAY_PORT = 4111;
const DEFAULT_WEB_PORT = 3111;
const BETTER_AUTH_SECRET = "agentifui-e2e-super-secret-1234567890";
const GATEWAY_SSO_DOMAINS = "iflabx.com=iflabx-sso";
const E2E_QUOTA_LIMIT = 100_000;

async function seedE2eQuotaLimits() {
  const database = postgres(DATABASE_URL, {
    max: 1,
    prepare: false,
  });

  const seeds = [
    {
      id: `quota_${E2E_TENANT_ID}_tenant_${E2E_TENANT_ID}_e2e`,
      scope: "tenant",
      scopeId: E2E_TENANT_ID,
      scopeLabel: "Tenant monthly quota",
    },
    {
      id: `quota_${E2E_TENANT_ID}_group_grp_research_e2e`,
      scope: "group",
      scopeId: "grp_research",
      scopeLabel: "Research Lab quota",
    },
    {
      id: `quota_${E2E_TENANT_ID}_group_grp_security_e2e`,
      scope: "group",
      scopeId: "grp_security",
      scopeLabel: "Security Office quota",
    },
    {
      id: `quota_${E2E_TENANT_ID}_group_grp_product_e2e`,
      scope: "group",
      scopeId: "grp_product",
      scopeLabel: "Product Studio quota",
    },
  ];

  try {
    for (const seed of seeds) {
      await database`
        insert into workspace_quota_limits (
          id,
          tenant_id,
          scope,
          scope_id,
          scope_label,
          monthly_limit,
          base_used
        )
        values (
          ${seed.id},
          ${E2E_TENANT_ID},
          ${seed.scope},
          ${seed.scopeId},
          ${seed.scopeLabel},
          ${E2E_QUOTA_LIMIT},
          0
        )
        on conflict (tenant_id, scope, scope_id) do update
        set monthly_limit = excluded.monthly_limit,
            base_used = excluded.base_used,
            scope_label = excluded.scope_label
      `;
    }
  } finally {
    await database.end({ timeout: 5 });
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${code ?? "null"}.`,
        ),
      );
    });

    child.on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, "127.0.0.1");
  });
}

function reserveEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("Could not resolve an ephemeral port."));
        });
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function resolvePort(preferredPort) {
  if (await canBindPort(preferredPort)) {
    return preferredPort;
  }

  return reserveEphemeralPort();
}

async function waitForOk(url, timeoutMs = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // Ignore transient startup errors.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${url} to return 2xx.`);
}

function startServer(command, args, env) {
  return spawn(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function resolvePlaywrightRuntimeOrSkip(scriptName) {
  const capability = await getPlaywrightHostCapability();

  if (capability.ok) {
    return capability.runtimeLibDir;
  }

  if (process.env.PLAYWRIGHT_STRICT_HOST_CHECK === "1") {
    throw new Error(capability.reason ?? `${scriptName} requires browser host capabilities.`);
  }

  process.stdout.write(`[skip] ${scriptName}: ${capability.reason ?? "browser host capability unavailable"}\n`);
  return null;
}

function createPlaywrightEnv(runtimeLibDir, webPort) {
  const env = {
    ...process.env,
    PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${webPort}`,
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    all_proxy: "",
    NO_PROXY: "127.0.0.1,localhost",
    no_proxy: "127.0.0.1,localhost",
  };

  if (runtimeLibDir) {
    env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
      ? `${runtimeLibDir}:${env.LD_LIBRARY_PATH}`
      : runtimeLibDir;
  }

  return env;
}

async function stopServer(child) {
  if (!child || child.killed) {
    return;
  }

  child.kill("SIGTERM");

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 5_000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main() {
  const playwrightArgs = process.argv.slice(2);
  const runtimeLibDir = await resolvePlaywrightRuntimeOrSkip("run-e2e");

  if (runtimeLibDir === null) {
    return;
  }
  const gatewayPort = await resolvePort(
    Number(process.env.PLAYWRIGHT_GATEWAY_PORT ?? DEFAULT_GATEWAY_PORT),
  );
  const webPort = await resolvePort(
    Number(process.env.PLAYWRIGHT_WEB_PORT ?? DEFAULT_WEB_PORT),
  );
  const gateway = null;
  const web = null;
  let gatewayChild = gateway;
  let webChild = web;

  try {
    await run("npm", ["run", "build"]);
    await run("npm", ["run", "db:reset"], {
      env: {
        ...process.env,
        DATABASE_URL,
      },
    });

    gatewayChild = startServer(
      "npm",
      ["run", "start", "--workspace", "@agentifui/gateway"],
      {
        DATABASE_URL,
        GATEWAY_PORT: String(gatewayPort),
        BETTER_AUTH_SECRET,
        GATEWAY_SSO_DOMAINS,
      },
    );

    await waitForOk(`http://127.0.0.1:${gatewayPort}/health`);
    await seedE2eQuotaLimits();

    webChild = startServer(
      "npm",
      ["run", "start", "--workspace", "@agentifui/web"],
      {
        PORT: String(webPort),
        GATEWAY_INTERNAL_URL: `http://127.0.0.1:${gatewayPort}`,
      },
    );

    await waitForOk(`http://127.0.0.1:${webPort}/login`);

    await run("npx", ["playwright", "test", ...playwrightArgs], {
      env: createPlaywrightEnv(runtimeLibDir, webPort),
    });
  } finally {
    await Promise.all([stopServer(webChild), stopServer(gatewayChild)]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
