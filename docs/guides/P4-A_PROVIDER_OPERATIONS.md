# P4-A Provider Operations

## Goal

Keep provider onboarding, benchmarking, fallback policy, and disablement consistent across future sessions.

## What Exists

- Provider-agnostic request/response contracts live under `packages/shared/src/providers`.
- Gateway routing lives in `apps/gateway/src/services/workspace-provider-routing.ts`.
- Runtime execution metadata is persisted on each run and exposed through run detail and `/health`.
- Admin runtime health cards now show provider adapter, circuit state, and retry budget.

## Onboard A Provider

1. Add the provider descriptor, model list, pricing, retry policy, and circuit-breaker defaults to `workspace-provider-routing.ts`.
2. Map the provider to an adapter id that `workspace-runtime.ts` can execute.
3. Decide which apps get the provider by default and which request types should prefer it.
4. Add at least one route or persistence test proving the provider metadata survives run replay.

## Benchmark Checklist

- Compare token pricing metadata against the existing providers.
- Run `npm run eval:run -- --pack release --fail-on-diff` after introducing the provider.
- Run `npm run eval:staging-drill -- --pack release` before promotion.
- Capture provider-specific latency, retry, and fallback notes in the dev log.

## Safe Disablement

- Prefer opening the provider circuit or marking it degraded before removing it from routing.
- Confirm the fallback provider still satisfies the app and request type.
- Re-run the provider route/persistence coverage after disablement.
- Record the exact env override or code change used to disable it in the dev log.

## Continuity Notes

- Provider prompt overrides currently use `@structured` and `@fast`.
- Tenant runtime modes currently use `standard`, `strict`, and `degraded`.
- When a provider is unavailable, fallback behavior is recorded in `run.runtime.selection`.
