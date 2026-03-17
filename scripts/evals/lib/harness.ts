import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  WorkspaceArtifact,
  WorkspaceConversation,
  WorkspaceConversationResponse,
  WorkspacePendingActionRespondRequest,
  WorkspacePendingActionRespondResponse,
  WorkspacePendingActionsResponse,
  WorkspaceRun,
  WorkspaceRunResponse,
} from "@agentifui/shared/apps";
import type {
  ChatCompletionMessage,
  ChatCompletionResponse,
} from "@agentifui/shared/chat";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../../../apps/gateway/src/app.js";
import { EVAL_FIXTURES } from "../fixtures.js";
import type {
  EvalActorId,
  EvalDiffEntry,
  EvalFixture,
  EvalFixtureResult,
  EvalNormalizedMessage,
  EvalNormalizedRun,
  EvalPack,
  EvalRunCollection,
  EvalSnapshot,
  ReleaseGateReport,
  ReleaseSmokeCheck,
} from "./types.js";

type EvalActorSession = {
  displayName: string;
  email: string;
  sessionToken: string;
};

type EvalFilters = {
  appIds?: string[];
  fixtureIds?: string[];
  pack: EvalPack;
  workstreams?: string[];
};

type EvalRunOptions = EvalFilters & {
  failOnDiff?: boolean;
  outputDir?: string | null;
  updateSnapshots?: boolean;
};

const DEFAULT_PASSWORD = "Secure123";
const REPO_ROOT = process.cwd();
const GOLDEN_DIR = join(REPO_ROOT, "tests", "evals", "golden");
const INCIDENT_DIR = join(REPO_ROOT, "tests", "evals", "incidents");
const FIXTURE_VERSION_TAG = "eval-harness.v1";

const EVAL_ENV = {
  nodeEnv: "test" as const,
  host: "127.0.0.1",
  port: 4300,
  corsOrigin: true,
  ssoDomainMap: {
    "iflabx.com": "iflabx-sso",
  },
  defaultTenantId: "eval-tenant",
  defaultSsoUserStatus: "pending" as const,
  authLockoutThreshold: 5,
  authLockoutDurationMs: 1_800_000,
};

function sanitizeToken(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function ensureDirectory(path: string) {
  mkdirSync(path, { recursive: true });
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJsonFile(path: string, value: unknown) {
  ensureDirectory(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveGoldenPath(fixtureId: string) {
  return join(GOLDEN_DIR, `${fixtureId}.json`);
}

function resolveIncidentPath(fixtureId: string) {
  return join(INCIDENT_DIR, `${fixtureId}.json`);
}

function getGitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function parseResponseBody(response: { body: string }) {
  const text = response.body;

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function injectJson<T>(
  app: FastifyInstance,
  input: {
    headers?: Record<string, string>;
    method: "GET" | "POST" | "PUT";
    payload?: unknown;
    url: string;
  },
): Promise<T> {
  const response = await app.inject({
    method: input.method,
    url: input.url,
    headers: input.headers,
    payload: input.payload as never,
  });
  const body = parseResponseBody(response);

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `${input.method} ${input.url} failed with ${response.statusCode}: ${JSON.stringify(body)}`,
    );
  }

  return body as T;
}

function resolveActorIdentity(
  fixture: EvalFixture,
  actorId: EvalActorId,
): { displayName: string; email: string } {
  const actor = fixture.actors?.[actorId];
  const displayName =
    actor?.displayName ??
    (actorId === "admin" ? "Eval Tenant Admin" : "Eval Workspace User");
  const emailLocalPart =
    actor?.emailLocalPart ?? (actorId === "admin" ? "admin.eval" : "user.eval");

  return {
    displayName,
    email: `${sanitizeToken(emailLocalPart)}-${sanitizeToken(fixture.id)}@example.net`,
  };
}

async function registerAndLoginActor(
  app: FastifyInstance,
  fixture: EvalFixture,
  actorId: EvalActorId,
): Promise<EvalActorSession> {
  const identity = resolveActorIdentity(fixture, actorId);

  await injectJson(app, {
    method: "POST",
    url: "/auth/register",
    payload: {
      email: identity.email,
      password: DEFAULT_PASSWORD,
      displayName: identity.displayName,
    },
  });

  const login = await injectJson<{
    ok: true;
    data: {
      sessionToken: string;
    };
  }>(app, {
    method: "POST",
    url: "/auth/login",
    payload: {
      email: identity.email,
      password: DEFAULT_PASSWORD,
    },
  });

  return {
    displayName: identity.displayName,
    email: identity.email,
    sessionToken: login.data.sessionToken,
  };
}

async function launchConversation(
  app: FastifyInstance,
  sessionToken: string,
  fixture: EvalFixture,
) {
  return injectJson<{
    ok: true;
    data: {
      conversationId: string;
      runId: string | null;
      traceId: string | null;
    };
  }>(app, {
    method: "POST",
    url: "/workspace/apps/launch",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json",
    },
    payload: {
      appId: fixture.appId,
      activeGroupId: fixture.activeGroupId,
    },
  });
}

async function fetchConversation(
  app: FastifyInstance,
  sessionToken: string,
  conversationId: string,
) {
  return injectJson<WorkspaceConversationResponse>(app, {
    method: "GET",
    url: `/workspace/conversations/${conversationId}`,
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
  });
}

async function fetchRun(
  app: FastifyInstance,
  sessionToken: string,
  runId: string,
) {
  return injectJson<WorkspaceRunResponse>(app, {
    method: "GET",
    url: `/workspace/runs/${runId}`,
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
  });
}

function buildEvalRequestMessages(
  conversation: WorkspaceConversation,
  nextPrompt: string,
): ChatCompletionMessage[] {
  const history = conversation.messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls ? { tool_calls: message.toolCalls } : {}),
  })) satisfies ChatCompletionMessage[];

  return [
    ...history,
    {
      role: "user",
      content: nextPrompt,
    },
  ];
}

function buildEvalInputs(
  fixture: EvalFixture,
  stepIndex: number,
  runtimeInput: Record<string, unknown> | undefined,
) {
  return {
    eval: {
      fixtureId: fixture.id,
      fixtureVersion: fixture.fixtureVersion,
      harnessVersion: FIXTURE_VERSION_TAG,
      promptVersion: fixture.promptVersion,
      runtimeVersion: fixture.runtimeVersion,
      stepIndex,
      workstream: fixture.workstream,
    },
    ...(runtimeInput ?? {}),
  };
}

async function applyKnowledgeSourceSetup(
  app: FastifyInstance,
  adminSessionToken: string,
  fixture: EvalFixture,
) {
  for (const source of fixture.setup?.knowledgeSources ?? []) {
    const created = await injectJson<{
      ok: true;
      data: {
        id: string;
      };
    }>(app, {
      method: "POST",
      url: "/admin/sources",
      headers: {
        authorization: `Bearer ${adminSessionToken}`,
        "content-type": "application/json",
      },
      payload: {
        title: source.title,
        sourceKind: source.sourceKind,
        scope: source.scope,
        groupId: source.groupId ?? null,
        labels: source.labels ?? [],
        sourceUri: source.sourceUri ?? null,
        content: source.content ?? null,
      },
    });

    if (source.status && source.status !== "queued") {
      await injectJson(app, {
        method: "PUT",
        url: `/admin/sources/${created.data.id}/status`,
        headers: {
          authorization: `Bearer ${adminSessionToken}`,
          "content-type": "application/json",
        },
        payload: {
          status: source.status,
          chunkCount: source.chunkCount ?? null,
          content: source.content ?? undefined,
        },
      });
    }
  }
}

async function applyToolRegistrySetup(
  app: FastifyInstance,
  adminSessionToken: string,
  fixture: EvalFixture,
) {
  for (const registry of fixture.setup?.toolRegistry ?? []) {
    await injectJson(app, {
      method: "PUT",
      url: `/admin/apps/${registry.appId}/tools`,
      headers: {
        authorization: `Bearer ${adminSessionToken}`,
        "content-type": "application/json",
      },
      payload: {
        tools: registry.tools,
      },
    });
  }
}

function toPendingActionRequest(
  step: Extract<EvalFixture["steps"][number], { kind: "pending_action" }>,
): WorkspacePendingActionRespondRequest {
  if (step.action === "submit") {
    return {
      action: "submit",
      note: step.note ?? null,
      values: step.values ?? {},
    };
  }

  return {
    action: step.action,
    note: step.note ?? null,
  };
}

function extractLatestAssistantText(run: WorkspaceRun) {
  const outputsAssistant = run.outputs.assistant;

  if (typeof outputsAssistant !== "object" || outputsAssistant === null) {
    return null;
  }

  const content = Reflect.get(outputsAssistant, "content");
  return typeof content === "string" ? content : null;
}

function normalizeJsonString(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeArtifactContent(artifact: WorkspaceArtifact) {
  switch (artifact.kind) {
    case "json":
      return artifact.content;
    case "link":
      return {
        href: artifact.href,
        label: artifact.label,
      };
    case "table":
      return {
        columns: artifact.columns,
        rows: artifact.rows,
      };
    default:
      return artifact.content;
  }
}

function sanitizeSnapshotString(value: string) {
  return value
    .replace(/\b[0-9a-f]{32}\b/gi, "<trace_id>")
    .replace(/call_[a-z0-9_]+_[0-9a-f]{8}\b/gi, "call_<tool>_<id>")
    .replace(/tool_idem_[0-9a-f]{16}\b/gi, "tool_idem_<hash>");
}

function sanitizeSnapshotValue<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeSnapshotString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSnapshotValue(entry)) as T;
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeSnapshotValue(entry),
      ]),
    ) as T;
  }

  return value;
}

function normalizeMessages(messages: WorkspaceConversation["messages"]): EvalNormalizedMessage[] {
  return messages.map((message) => ({
    role: message.role,
    status: message.status,
    content: message.content,
    toolCallId: message.toolCallId ?? null,
    toolName: message.toolName ?? null,
    toolCalls: (message.toolCalls ?? []).map((toolCall) => ({
      name: toolCall.function.name,
      arguments: normalizeJsonString(toolCall.function.arguments),
    })),
    suggestedPrompts: message.suggestedPrompts ?? [],
    artifacts: (message.artifacts ?? []).map((artifact) => ({
      title: artifact.title,
      kind: artifact.kind,
      summary: artifact.summary,
    })),
    citations: (message.citations ?? []).map((citation) => ({
      label: citation.label,
      title: citation.title,
      snippet: citation.snippet,
    })),
    safetySignals: (message.safetySignals ?? []).map((signal) => ({
      category: signal.category,
      severity: signal.severity,
      summary: signal.summary,
    })),
  }));
}

function normalizeRun(
  fixture: EvalFixture,
  prompt: string,
  run: WorkspaceRun,
): EvalNormalizedRun {
  const evalInput =
    typeof run.inputs.variables === "object" &&
    run.inputs.variables !== null &&
    typeof Reflect.get(run.inputs.variables, "eval") === "object" &&
    Reflect.get(run.inputs.variables, "eval") !== null
      ? (Reflect.get(run.inputs.variables, "eval") as Record<string, unknown>)
      : null;

  return {
    appId: run.app.id,
    status: run.status,
    triggeredFrom: run.triggeredFrom,
    outputsAssistantText: extractLatestAssistantText(run),
    failure: run.failure
      ? {
          code: run.failure.code,
          stage: run.failure.stage,
          message: run.failure.message,
          retryable: run.failure.retryable,
          detail: run.failure.detail,
        }
      : null,
    runtime: run.runtime
      ? {
          id: run.runtime.id,
          label: run.runtime.label,
          status: run.runtime.status,
          capabilities: run.runtime.capabilities,
        }
      : null,
    versions: {
      fixtureVersion:
        typeof evalInput?.fixtureVersion === "string"
          ? evalInput.fixtureVersion
          : fixture.fixtureVersion,
      promptVersion:
        typeof evalInput?.promptVersion === "string"
          ? evalInput.promptVersion
          : fixture.promptVersion,
      runtimeVersion:
        typeof evalInput?.runtimeVersion === "string"
          ? evalInput.runtimeVersion
          : fixture.runtimeVersion,
    },
    usage: run.usage,
    pendingActions: Array.isArray(run.outputs.pendingActions)
      ? run.outputs.pendingActions.flatMap((entry) => {
          if (typeof entry !== "object" || entry === null) {
            return [];
          }

          const kind = Reflect.get(entry, "kind");
          const title = Reflect.get(entry, "title");
          const status = Reflect.get(entry, "status");

          if (
            typeof kind !== "string" ||
            typeof title !== "string" ||
            typeof status !== "string"
          ) {
            return [];
          }

          const labels: string[] = [];
          const approveLabel = Reflect.get(entry, "approveLabel");
          const rejectLabel = Reflect.get(entry, "rejectLabel");
          const submitLabel = Reflect.get(entry, "submitLabel");

          if (typeof approveLabel === "string") {
            labels.push(approveLabel);
          }
          if (typeof rejectLabel === "string") {
            labels.push(rejectLabel);
          }
          if (typeof submitLabel === "string") {
            labels.push(submitLabel);
          }

          return [
            {
              kind,
              title,
              status,
              actionLabels: labels,
            },
          ];
        })
      : [],
    artifacts: run.artifacts.map((artifact) => ({
      title: artifact.title,
      kind: artifact.kind,
      summary: artifact.summary,
      content: normalizeArtifactContent(artifact),
    })),
    citations: run.citations.map((citation) => ({
      label: citation.label,
      title: citation.title,
      snippet: citation.snippet,
    })),
    safetySignals: run.safetySignals.map((signal) => ({
      category: signal.category,
      severity: signal.severity,
      summary: signal.summary,
    })),
    sourceBlocks: run.sourceBlocks.map((sourceBlock) => ({
      kind: sourceBlock.kind,
      title: sourceBlock.title,
      snippet: sourceBlock.snippet,
    })),
    toolExecutions: run.toolExecutions.map((execution) => ({
      toolName: execution.request.function.name,
      attempt: execution.attempt,
      status: execution.status,
      latencyMs: execution.latencyMs,
      failureCode: execution.failure?.code ?? null,
      idempotencyKey: execution.metadata?.idempotencyKey ?? null,
      timeoutMs: execution.metadata?.timeoutMs ?? null,
      maxAttempts: execution.metadata?.maxAttempts ?? null,
      resultPreview: execution.result?.content ?? null,
    })),
  };
}

function normalizeSnapshot(
  fixture: EvalFixture,
  prompt: string,
  conversation: WorkspaceConversation,
  run: WorkspaceRun,
): EvalSnapshot {
  return sanitizeSnapshotValue({
    fixtureId: fixture.id,
    appId: fixture.appId,
    workstream: fixture.workstream,
    prompt,
    stepCount: fixture.steps.length,
    conversation: {
      title: conversation.title,
      status: conversation.status,
      appName: conversation.app.name,
      messageCount: conversation.messages.length,
      messages: normalizeMessages(conversation.messages),
    },
    run: normalizeRun(fixture, prompt, run),
  });
}

function diffValues(
  actual: unknown,
  expected: unknown,
  path = "$",
): EvalDiffEntry[] {
  if (Object.is(actual, expected)) {
    return [];
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    const diffs: EvalDiffEntry[] = [];
    const length = Math.max(actual.length, expected.length);

    for (let index = 0; index < length; index += 1) {
      diffs.push(...diffValues(actual[index], expected[index], `${path}[${index}]`));
    }

    return diffs;
  }

  if (
    typeof actual === "object" &&
    actual !== null &&
    typeof expected === "object" &&
    expected !== null &&
    !Array.isArray(actual) &&
    !Array.isArray(expected)
  ) {
    const actualRecord = actual as Record<string, unknown>;
    const expectedRecord = expected as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(actualRecord), ...Object.keys(expectedRecord)])].sort();

    return keys.flatMap((key) =>
      diffValues(actualRecord[key], expectedRecord[key], `${path}.${key}`),
    );
  }

  return [
    {
      path,
      actual,
      expected,
    },
  ];
}

function selectFixtures(filters: EvalFilters) {
  return EVAL_FIXTURES.filter((fixture) => {
    if (!fixture.packs.includes(filters.pack) && filters.pack !== "full") {
      return false;
    }

    if (
      filters.fixtureIds &&
      filters.fixtureIds.length > 0 &&
      !filters.fixtureIds.includes(fixture.id)
    ) {
      return false;
    }

    if (
      filters.appIds &&
      filters.appIds.length > 0 &&
      !filters.appIds.includes(fixture.appId)
    ) {
      return false;
    }

    if (
      filters.workstreams &&
      filters.workstreams.length > 0 &&
      !filters.workstreams.includes(fixture.workstream)
    ) {
      return false;
    }

    return true;
  });
}

async function runEvalFixture(fixture: EvalFixture): Promise<EvalFixtureResult> {
  const app = await buildApp(EVAL_ENV, { logger: false });

  try {
    const admin = await registerAndLoginActor(app, fixture, "admin");
    const user = await registerAndLoginActor(app, fixture, "user");
    const actorSessions: Record<EvalActorId, EvalActorSession> = {
      admin,
      user,
    };

    await applyKnowledgeSourceSetup(app, admin.sessionToken, fixture);
    await applyToolRegistrySetup(app, admin.sessionToken, fixture);

    const launchActor = fixture.appId === "app_tenant_control" ? "admin" : "user";
    const launch = await launchConversation(
      app,
      actorSessions[launchActor].sessionToken,
      fixture,
    );
    const conversationId = launch.data.conversationId;
    let runId = launch.data.runId ?? "";
    let traceId = launch.data.traceId ?? "";
    let prompt = "";

    let currentConversation = (
      await fetchConversation(app, actorSessions[launchActor].sessionToken, conversationId)
    ).data;

    for (let stepIndex = 0; stepIndex < fixture.steps.length; stepIndex += 1) {
      const step = fixture.steps[stepIndex]!;
      const actor = actorSessions[step.actor];

      if (step.kind === "completion") {
        prompt = step.message;
        const completion = await injectJson<ChatCompletionResponse>(app, {
          method: "POST",
          url: "/v1/chat/completions",
          headers: {
            authorization: `Bearer ${actor.sessionToken}`,
            "content-type": "application/json",
            "x-active-group-id": fixture.activeGroupId,
          },
          payload: {
            app_id: fixture.appId,
            conversation_id: conversationId,
            messages: buildEvalRequestMessages(currentConversation, step.message),
            inputs: buildEvalInputs(fixture, stepIndex, step.runtimeInput),
            tool_choice: step.toolChoice,
            tools: step.tools,
            ...step.requestOverrides,
          },
        });

        runId = completion.metadata?.run_id ?? runId;
        traceId = completion.trace_id ?? traceId;
      } else {
        const pendingActions = await injectJson<WorkspacePendingActionsResponse>(app, {
          method: "GET",
          url: `/workspace/conversations/${conversationId}/pending-actions`,
          headers: {
            authorization: `Bearer ${actor.sessionToken}`,
          },
        });
        const pendingItem = pendingActions.data.items.find(
          (item) => item.status === "pending",
        );

        if (!pendingItem) {
          throw new Error(`Fixture ${fixture.id} expected a pending action before ${step.action}.`);
        }

        const response = await injectJson<WorkspacePendingActionRespondResponse>(app, {
          method: "POST",
          url: `/workspace/conversations/${conversationId}/pending-actions/${pendingItem.id}/respond`,
          headers: {
            authorization: `Bearer ${actor.sessionToken}`,
            "content-type": "application/json",
          },
          payload: toPendingActionRequest(step),
        });
        runId = response.data.runId;
      }

      currentConversation = (
        await fetchConversation(app, actor.sessionToken, conversationId)
      ).data;
    }

    if (!runId) {
      runId = currentConversation.run.id;
    }
    if (!traceId) {
      traceId = currentConversation.run.traceId;
    }

    const run = (await fetchRun(app, actorSessions[launchActor].sessionToken, runId)).data;
    const snapshot = normalizeSnapshot(fixture, prompt, currentConversation, run);
    const goldenPath = resolveGoldenPath(fixture.id);
    const golden = readJsonFile<EvalSnapshot>(goldenPath);
    const diffs = golden ? diffValues(snapshot, golden) : [];

    return {
      fixture,
      snapshot,
      diffs,
      status: golden ? (diffs.length === 0 ? "matched" : "changed") : "missing_golden",
      references: {
        conversationId,
        runId,
        traceId,
      },
    };
  } finally {
    await app.close();
  }
}

function renderEvalMarkdownReport(collection: EvalRunCollection) {
  const lines = [
    "# Eval Comparison Report",
    "",
    `Generated at: ${collection.generatedAt}`,
    `Pack: ${collection.pack}`,
    `Git commit: ${collection.gitCommit ?? "unknown"}`,
    "",
    "| Fixture | App | Workstream | Runtime version | Prompt version | Status | Diff count |",
    "| --- | --- | --- | --- | --- | --- | ---: |",
    ...collection.results.map((result) => {
      const diffCount = result.diffs.length;

      return `| ${result.fixture.id} | ${result.fixture.appId} | ${result.fixture.workstream} | ${result.snapshot.run.versions.runtimeVersion} | ${result.snapshot.run.versions.promptVersion} | ${result.status} | ${diffCount} |`;
    }),
    "",
  ];

  for (const result of collection.results.filter((entry) => entry.diffs.length > 0)) {
    lines.push(`## ${result.fixture.id}`);
    lines.push("");

    for (const diff of result.diffs.slice(0, 20)) {
      lines.push(`- \`${diff.path}\``);
      lines.push(`  - expected: \`${JSON.stringify(diff.expected)}\``);
      lines.push(`  - actual: \`${JSON.stringify(diff.actual)}\``);
    }

    if (result.diffs.length > 20) {
      lines.push(`- ... ${result.diffs.length - 20} more diff(s)`);
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function writeEvalOutputs(outputDir: string, collection: EvalRunCollection) {
  ensureDirectory(outputDir);
  writeJsonFile(join(outputDir, "results.json"), collection);
  writeFileSync(
    join(outputDir, "comparison-report.md"),
    renderEvalMarkdownReport(collection),
    "utf8",
  );
}

export async function runEvalFixtures(
  options: EvalRunOptions,
): Promise<EvalRunCollection> {
  const fixtures = selectFixtures(options);

  if (fixtures.length === 0) {
    throw new Error("No eval fixtures matched the requested filters.");
  }

  const results: EvalFixtureResult[] = [];

  for (const fixture of fixtures) {
    const result = await runEvalFixture(fixture);

    if (options.updateSnapshots) {
      writeJsonFile(resolveGoldenPath(fixture.id), result.snapshot);
      results.push({
        ...result,
        status: "matched",
        diffs: [],
      });
      continue;
    }

    results.push(result);
  }

  const collection: EvalRunCollection = {
    generatedAt: new Date().toISOString(),
    gitCommit: getGitCommit(),
    pack: options.pack,
    results,
  };

  if (options.outputDir) {
    writeEvalOutputs(options.outputDir, collection);
  }

  if (options.failOnDiff) {
    const failures = collection.results.filter((entry) => entry.status !== "matched");

    if (failures.length > 0) {
      throw new Error(
        `Eval comparison failed for ${failures.map((entry) => entry.fixture.id).join(", ")}.`,
      );
    }
  }

  return collection;
}

async function runReleaseAuthSmoke(app: FastifyInstance): Promise<ReleaseSmokeCheck> {
  const identity = {
    email: "user.release-auth@example.net",
    displayName: "Release Auth Smoke",
  };

  await injectJson(app, {
    method: "POST",
    url: "/auth/register",
    payload: {
      email: identity.email,
      password: DEFAULT_PASSWORD,
      displayName: identity.displayName,
    },
  });
  await injectJson(app, {
    method: "POST",
    url: "/auth/login",
    payload: {
      email: identity.email,
      password: DEFAULT_PASSWORD,
    },
  });

  return {
    name: "auth",
    ok: true,
    notes: "register + login succeeded",
  };
}

async function runReleaseAdminSmoke(app: FastifyInstance): Promise<ReleaseSmokeCheck> {
  const admin = await registerAndLoginActor(
    app,
    EVAL_FIXTURES.find((fixture) => fixture.id === "tenant-control-approval")!,
    "admin",
  );

  await injectJson(app, {
    method: "GET",
    url: "/admin/users",
    headers: {
      authorization: `Bearer ${admin.sessionToken}`,
    },
  });
  await injectJson(app, {
    method: "GET",
    url: "/admin/apps",
    headers: {
      authorization: `Bearer ${admin.sessionToken}`,
    },
  });

  return {
    name: "admin",
    ok: true,
    notes: "admin users/apps routes succeeded",
  };
}

async function runReleaseChatSmoke(app: FastifyInstance): Promise<ReleaseSmokeCheck> {
  const fixture = EVAL_FIXTURES.find((entry) => entry.id === "policy-watch-basic");

  if (!fixture) {
    throw new Error("policy-watch-basic fixture is required for chat smoke.");
  }

  const user = await registerAndLoginActor(app, fixture, "user");
  const launch = await launchConversation(app, user.sessionToken, fixture);
  const completion = await injectJson<ChatCompletionResponse>(app, {
    method: "POST",
    url: "/v1/chat/completions",
    headers: {
      authorization: `Bearer ${user.sessionToken}`,
      "content-type": "application/json",
      "x-active-group-id": fixture.activeGroupId,
    },
    payload: {
      app_id: fixture.appId,
      conversation_id: launch.data.conversationId,
      messages: [
        {
          role: "user",
          content: "Return one short sentence proving the release smoke chat path is live.",
        },
      ],
      inputs: buildEvalInputs(fixture, 0, {
        smoke: "release-gate",
      }),
    },
  });

  if (!completion.conversation_id || !completion.metadata?.run_id) {
    throw new Error("chat smoke did not return conversation/run metadata.");
  }

  return {
    name: "chat",
    ok: true,
    notes: "workspace launch + chat completion succeeded",
  };
}

function renderReleaseGateMarkdown(report: ReleaseGateReport) {
  const lines = [
    "# Release Gate Report",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Smoke checks",
    "",
    "| Check | Status | Notes |",
    "| --- | --- | --- |",
    ...report.releaseSmoke.map((check) => `| ${check.name} | ${check.ok ? "passed" : "failed"} | ${check.notes} |`),
    "",
    "## Eval comparison",
    "",
    renderEvalMarkdownReport(report.evals),
  ];

  return `${lines.join("\n")}\n`;
}

export async function runReleaseGate(
  options: EvalRunOptions & {
    ci?: boolean;
  },
): Promise<ReleaseGateReport> {
  const evals = await runEvalFixtures({
    ...options,
    failOnDiff: true,
  });
  const app = await buildApp(EVAL_ENV, { logger: false });

  try {
    const releaseSmoke = [
      await runReleaseAuthSmoke(app),
      await runReleaseAdminSmoke(app),
      await runReleaseChatSmoke(app),
    ];

    const report: ReleaseGateReport = {
      generatedAt: new Date().toISOString(),
      evals,
      releaseSmoke,
    };

    if (options.outputDir) {
      ensureDirectory(options.outputDir);
      writeJsonFile(join(options.outputDir, "release-gate.json"), report);
      writeFileSync(
        join(options.outputDir, "release-gate.md"),
        renderReleaseGateMarkdown(report),
        "utf8",
      );
    }

    if (releaseSmoke.some((check) => !check.ok)) {
      throw new Error("Release smoke checks failed.");
    }

    return report;
  } finally {
    await app.close();
  }
}

export async function replayIncidentFixture(input: {
  fixtureId: string;
  outputDir?: string | null;
}) {
  const fixture = EVAL_FIXTURES.find((entry) => entry.id === input.fixtureId);

  if (!fixture) {
    throw new Error(`Unknown incident fixture: ${input.fixtureId}`);
  }

  const result = await runEvalFixture(fixture);
  const incidentRecord = {
    fixtureId: fixture.id,
    generatedAt: new Date().toISOString(),
    references: result.references,
    snapshot: result.snapshot,
  };

  if (input.outputDir) {
    ensureDirectory(input.outputDir);
    writeJsonFile(join(input.outputDir, `${fixture.id}.json`), incidentRecord);
  } else {
    writeJsonFile(resolveIncidentPath(fixture.id), incidentRecord);
  }

  return incidentRecord;
}

export function loadSavedIncident(fixtureId: string) {
  return readJsonFile<{
    fixtureId: string;
    generatedAt: string;
    references: EvalFixtureResult["references"];
    snapshot: EvalSnapshot;
  }>(resolveIncidentPath(fixtureId));
}

export function printEvalSummary(collection: EvalRunCollection) {
  for (const result of collection.results) {
    const summary = [
      `${result.fixture.id}`,
      result.status,
      `diffs=${result.diffs.length}`,
      `runtime=${result.snapshot.run.runtime?.id ?? "none"}`,
    ].join(" ");

    console.log(summary);
  }
}

export { renderEvalMarkdownReport, renderReleaseGateMarkdown, selectFixtures };
