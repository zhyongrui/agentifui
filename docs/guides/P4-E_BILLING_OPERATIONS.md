# P4-E Billing Operations

## Scope

This guide covers the current billing boundary for:

- tenant billing plans
- credit adjustments
- workspace-side warning / hard-stop behavior
- finance / ops exports
- reconciliation checks

## Pricing Model

Current derived billable actions:

- `launch`: `1` credit per launch
- `completion`: `ceil(total_tokens / 25)` credits
- `retrieval`: `1` credit per retrieval-backed run
- `storage`: `ceil(total_bytes / 25 MiB)` credits
- `export`: `1` credit per admin billing export or artifact download

Current UI/API surfaces:

- admin summary: `GET /admin/billing`
- tenant plan update: `PUT /admin/billing/tenants/:tenantId/plan`
- tenant adjustment: `POST /admin/billing/tenants/:tenantId/adjustments`
- finance export: `GET /admin/billing/export`
- workspace warning summary: `GET /workspace/billing`

## Masking Rules

Billing summaries and exports must not leak raw prompts.

Current rule set:

- exported billing records only expose `maskedContext`
- export payloads summarize tenant-level usage, warnings, and adjustments
- prompt bodies, transcript text, and raw run inputs are intentionally excluded from billing export payloads

Related audit actions:

- `admin.billing.plan_updated`
- `admin.billing.adjustment_created`
- `admin.billing.exported`
- `workspace.billing.launch_blocked`

## Reconciliation

Run:

```bash
npm run ops:billing-reconcile -- --tenant=dev-tenant
```

What it does:

- derives billing usage from launches, runs, storage, and export audits
- reports effective limits and remaining credits
- emits a reconciliation section comparing provider-reported token counts with local run token totals

Current limitation:

- the placeholder/provider runtime path currently uses the same token source for both sides, so `tokenDelta` is expected to stay `0`
- when a real external provider meter is introduced, extend this script before claiming provider-side reconciliation coverage

## Browser QA

Stable browser path for billing:

1. Register/login with an `admin-*` email so the seeded tenant-admin role is present.
2. Open `/admin/billing`.
3. Lower monthly credits to `1`.
4. Save the plan.
5. Launch one workspace app from `/apps`.
6. Return to `/apps` and confirm the billing hard-stop notice is visible.

Focused command:

```bash
node scripts/run-e2e.mjs tests/e2e/billing-flows.spec.ts
```

## Incident Playbook

If billing looks wrong:

1. Export current tenant summaries from `/admin/billing/export`.
2. Run `npm run ops:billing-reconcile`.
3. Compare launch/run/storage/export counts against the export snapshot.
4. If the bill is too high, create a `meter_correction` adjustment.
5. If launches are blocked and the tenant must resume immediately, temporarily raise limits or grant credits.
6. Record the correction reason in the adjustment form and keep the matching audit trail.

Useful continuity notes:

- workspace hard-stop is evaluated before a new launch is created, so a tenant normally sees the hard-stop banner after the launch that pushed them over the line
- the workspace warning banner is fed by `GET /workspace/billing`, not by quota state
- the admin export route must keep `content-disposition`, `x-agentifui-export-format`, `x-agentifui-export-filename`, `x-agentifui-exported-at`, and `x-agentifui-export-count`
