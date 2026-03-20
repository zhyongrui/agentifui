# P4-H QA Matrix

## Purpose
- define the minimum QA matrix a fresh AI session must rerun before claiming a surface is ready
- keep the matrix aligned with the current host caveats and shipped automation scripts

## Fast Path

Run this path when the change is local to docs, UI copy, or isolated route logic:

1. `git status --short`
2. targeted unit or route tests for the changed files
3. affected workspace or app type-check
4. if the touched surface is user-visible, run the smallest matching browser or script smoke
5. update the plan, dev log, and any affected guide before push

## Required Matrix By Surface

### Docs-Only

1. `npm run docs:coverage`
2. confirm the changed guide or plan is linked from the current continuity docs when appropriate

### Gateway Route Or Service

1. targeted `vitest` for the touched route or service
2. `npm run type-check --workspace @agentifui/gateway`
3. if contracts changed, also run `npm run build --workspace @agentifui/shared`

### Web Route Or Component

1. targeted `vitest` for the touched client, route, or component
2. `npm run type-check --workspace @agentifui/web`
3. if proxying, auth, or admin wiring changed, prefer `npm run build`

### Shared Contract Or Persistence Boundary

1. `npm run build --workspace @agentifui/shared`
2. `npm run build --workspace @agentifui/db`
3. targeted persistence or contract tests
4. if migrations or reset paths are touched, run `npm run db:migrate` or `npm run db:reset`

### Browser-Critical User Flow

1. targeted Playwright spec through `node scripts/run-e2e.mjs <spec>`
2. if host behavior is unstable, isolate ports and use the direct `next start` pattern recorded in the dev log
3. record any public URL, tunnel, or port override in the dev log
4. use `PLAYWRIGHT_STRICT_HOST_CHECK=1` only when browser-host dependency gaps must fail hard instead of skipping safely

### Release-Oriented Round

1. `npm run build`
2. `npm run test:unit`
3. the smallest matching smoke command:
   - `npm run smoke:deploy`
   - `npm run smoke:browser`
   - `npm run perf:smoke`
4. if the round changes release expectations, update `docs/RELEASE_STATE.md`

## Minimum Claim Standard

Do not claim a round is ready unless:

1. the validation list matches the changed surface
2. failures or skipped checks are stated explicitly
3. the plan and dev log were updated in the same round
4. commits were pushed before ending the session

## Host Notes

1. browser runs on this host can hang if detached; prefer direct long-lived sessions when debugging
2. large `apply_patch` edits can truncate files; recover with `git show HEAD:path > path` before retrying
3. `baseline-browser-mapping` freshness warnings are currently non-blocking unless they coincide with an actual typegen/build failure
4. browser entry scripts now skip with a clear reason when host runtime dependencies are unavailable, unless `PLAYWRIGHT_STRICT_HOST_CHECK=1`
