# P2-E3 Tenant Usage Analytics

`P2-E3` adds tenant-scoped usage analytics on the admin boundary.

## Surfaces

- `GET /admin/usage`
  - returns visible tenant summaries plus aggregate totals
- `GET /admin/usage/export?format=json|csv`
  - exports the visible usage snapshot
  - supports optional `search` and `tenantId`
- `/admin/tenants`
  - renders tenant usage cards
  - shows per-app breakdown and quota watch rows
  - supports client-side filtering and usage export

## Metrics Included

- launches
- runs
- succeeded / failed / stopped run counts
- transcript message counts
- artifact counts and bytes
- uploaded file counts and bytes
- total storage bytes
- total tokens
- last activity timestamp
- per-app breakdown:
  - launches
  - runs
  - messages
  - artifacts
  - uploads
  - storage
  - tokens
- quota comparison rows:
  - current limit
  - actual used
  - remaining
  - utilization percent
  - over-limit flag

## Aggregation Model

- usage is aggregated on read from the persistent tables
- there is no background materialized view yet
- quota comparison uses:
  - `workspace_quota_limits.base_used`
  - launch cost from `workspace_app_launches + workspace_apps.launch_cost`
  - completion cost from `runs.total_tokens` via `calculateCompletionQuotaCost`

## Current Caveats

- message counts come from the latest persisted `conversations.inputs.messageHistory`
  - this is a snapshot metric, not an append-only event ledger
- per-app artifact bytes come from persisted artifact/upload rows
  - inline JSON fallback artifacts are not counted unless they have been persisted
- export routes emit the current read-time snapshot
  - there is no historical rollup or scheduled cadence yet
- repeated browser runs on the shared Postgres host must use unique tenant slugs
  - fixed slugs will hit `ADMIN_CONFLICT`

## Browser QA Notes

- rebuild before running Playwright against changed admin pages:
  - `npm run build`
- isolated local production pair used during this round:
  - gateway: `4121`
  - web: `3121`
- example targeted run:
  - `LD_LIBRARY_PATH=/home/bistu/zyr/pros/agentifui/.cache/playwright-runtime-libs/usr/lib/x86_64-linux-gnu PLAYWRIGHT_BASE_URL=http://127.0.0.1:3121 npx playwright test tests/e2e/phase1-flows.spec.ts --grep "root admins can open the platform tenant inventory page"`

