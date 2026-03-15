# P2-D4 Runtime Adapter Guide

This guide documents the current adapter boundary added in `P2-D4`.

## Files

- gateway runtime service:
  - `apps/gateway/src/services/workspace-runtime.ts`
- app runtime selection seed:
  - `apps/gateway/src/services/workspace-catalog-fixtures.ts`
- chat gateway entrypoint:
  - `apps/gateway/src/routes/chat.ts`
- run persistence readers:
  - `apps/gateway/src/services/workspace-service.ts`
  - `apps/gateway/src/services/persistent-workspace-service.ts`

## Adapter Contract

Every adapter needs to provide:

- `getHealth()`
  - returns adapter id, label, `available|degraded`, and capability flags
- `invoke(input)`
  - receives:
    - `appId`
    - `conversation`
    - `messages`
    - `attachments`
    - `latestPrompt`
    - `requestedModel`
    - `runtimeInput`
  - returns either:
    - `ok: true`
      - `assistantText`
      - optional `model`
      - optional `artifacts`
      - optional `citations`
      - optional `sourceBlocks`
      - optional `pendingActions`
      - optional `safetySignals`
      - optional `suggestedPrompts`
      - required `runtime`
    - `ok: false`
      - `code`
      - `message`
      - `detail`
      - `retryable`
      - optional `runtime`

## Safe Add Flow

1. Add the adapter implementation in `workspace-runtime.ts`, or split it into a new helper module if the logic is large.
2. Give it a stable adapter id and register it in `createWorkspaceRuntimeService()`.
3. Add or update app-to-runtime selection in `resolveWorkspaceAppRuntimeId()`.
4. Keep `WorkspaceRun.runtime` serializable.
   - only store plain JSON-safe metadata
   - never store provider clients, tokens, or raw request headers
5. If the adapter emits custom artifacts or citations, make sure stop/failure behavior still leaves replayable data behind.
6. If the adapter can fail, normalize to:
   - `runtime_unavailable` for health/readiness issues
   - `provider_error` for execution failures
7. Add three tests before merging:
   - unit coverage for adapter health/invoke behavior
   - route coverage using an injected adapter double
   - persistence coverage proving `outputs.runtime` survives restart
8. Add one browser smoke if the adapter changes visible UX.

## Persistence Rules

- blocking and streaming completion paths must both persist `outputs.runtime`
- `ChatCompletionResponse.metadata.runtime_id` should match the persisted runtime id
- `/workspace/runs/:runId` is the canonical replay surface for runtime metadata

## Health Rules

- `/health` now exposes runtime readiness
- adapters should report `degraded` instead of throwing during startup probes
- if an adapter is degraded, the gateway should fail the run with structured failure metadata instead of silently falling back

## Host Caveat

On this host, Playwright may accidentally hit a stale long-running web process.

- inspect `/proc/<next-pid>/environ` for `GATEWAY_INTERNAL_URL`
- do not trust the default `3111` if it points to a dead gateway port
- start an isolated pair when needed, for example:
  - gateway: `GATEWAY_PORT=4118 npm run start --workspace @agentifui/gateway`
  - web: `PORT=3118 GATEWAY_INTERNAL_URL=http://127.0.0.1:4118 npm run start --workspace @agentifui/web`
  - browser: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3118 npx playwright test ...`
