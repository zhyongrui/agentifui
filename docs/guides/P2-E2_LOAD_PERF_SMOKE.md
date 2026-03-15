# P2-E2 Load And Perf Smoke

## Purpose

`P2-E2` adds a lightweight, repeatable perf lane for the main same-origin product paths:

- auth login
- workspace catalog
- workspace launch
- fresh chat completion
- chat completion on an artifact-rich persisted conversation
- long conversation history reads
- run replay reads
- shared transcript reads
- admin audit export

The scripts live at:

- `scripts/perf-seed.mjs`
- `scripts/perf-smoke.mjs`

## Local Isolated Stack

Use an isolated production pair instead of stale long-running dev processes.

Gateway:

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
GATEWAY_PORT=4120 \
BETTER_AUTH_SECRET=agentifui-e2e-super-secret-1234567890 \
GATEWAY_SSO_DOMAINS='iflabx.com=iflabx-sso' \
npm run start --workspace @agentifui/gateway
```

Web:

```bash
PORT=3120 \
GATEWAY_INTERNAL_URL=http://127.0.0.1:4120 \
npm run start --workspace @agentifui/web
```

Reset the DB before a clean perf run:

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
npm run db:reset
```

## Seed

Create deterministic perf data and write a seed artifact:

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
PERF_BASE_URL=http://127.0.0.1:3120 \
npm run perf:seed
```

The seed output includes:

- seeded account emails
- app/group selection
- long conversation id
- latest replayable run id
- shared transcript id

## Smoke

Run the perf smoke against an existing seed:

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
PERF_BASE_URL=http://127.0.0.1:3120 \
PERF_SEED_INPUT=/abs/path/to/perf-seed.json \
npm run perf:smoke
```

Useful options:

- `PERF_ITERATIONS`
  - default `4`
- `PERF_CONCURRENCY`
  - default `2`
- `PERF_ENFORCE_BUDGETS=1`
  - fail the command if any scenario breaches the configured budget
- `PERF_OUTPUT`
  - custom JSON artifact path
- `PERF_SEED_OUTPUT`
  - custom seed artifact path when smoke seeds for itself

## Budgets

The current built-in p95 targets are:

- auth login: `4000ms`
- workspace catalog: `2500ms`
- workspace launch: `3500ms`
- fresh chat completion: `6000ms`
- persisted-artifact completion: `7000ms`
- long history read: `2500ms`
- run replay read: `2500ms`
- shared transcript read: `2500ms`
- admin audit export JSON: `8000ms`

## Host Notes

Useful continuity notes for this host:

- the perf scripts should run against a persistent gateway, not the in-memory fallback
  - if `DATABASE_URL` was omitted when booting the gateway, quota relaxation for perf runs will not take effect
- `perf:seed` can relax workspace quota limits for the isolated local DB, but only when `DATABASE_URL` or `PERF_DATABASE_URL` is present
- the first `P2-E2` smoke run revealed a measurement bug
  - `chat.completion.fresh` was incorrectly timing `launch + completion`
  - the script was corrected to time only the completion request itself
- perf artifacts should stay summary-sized
  - sample metadata keeps ids/counts/status only, not full response payloads

## Release Gate

For pre-release verification, add this after the normal HTTP/browser smoke:

```bash
PERF_BASE_URL=http://127.0.0.1:3120 \
PERF_ENFORCE_BUDGETS=1 \
npm run perf:smoke
```
