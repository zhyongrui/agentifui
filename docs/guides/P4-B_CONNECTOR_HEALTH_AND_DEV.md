# P4-B Connector Health And Local Dev

`P4-B-07` through `P4-B-12` close the connector rollout loop around health, user-visible warnings, audit, browser QA, and safe local setup.

## Surfaces

- Admin health summary: `GET /admin/connectors/health`
- Admin mutation routes:
  - `PUT /admin/connectors/:connectorId/status`
  - `PUT /admin/connectors/:connectorId/credentials`
  - `DELETE /admin/connectors/:connectorId`
  - `POST /admin/connectors/:connectorId/sync-jobs`
- User source warning surface: `GET /workspace/source-status`
- Browser coverage: `tests/e2e/connectors-workflows.spec.ts`

## Health Model

Connector health is derived in `apps/gateway/src/services/connector-health.ts`.

Current issue codes:

- `paused`
- `revoked`
- `sync_failed`
- `sync_partial_failure`
- `stale_sync`

Severity is computed from the worst active issue:

- `critical` if any critical issue exists
- `warning` if no critical issue exists but at least one warning exists
- `healthy` otherwise

The stale window is currently `max(60 minutes, cadenceMinutes * 3)`.

## User-Facing Status Rules

`/workspace/source-status` only returns sources that currently have connector health issues.

Important behavior:

- source titles prefer the persisted knowledge-source title
- when no source title is available, the UI falls back to `${connectorTitle} source`
- paused connectors surface warning items
- revoked connectors surface critical items
- failed and partial sync jobs surface the latest failure summary

## Audit Actions

The connector governance flow records:

- `knowledge.connector.created`
- `knowledge.connector.status_updated`
- `knowledge.connector.rotated`
- `knowledge.connector.deleted`
- `knowledge.connector.sync_queued`

When debugging an operator complaint, check `/admin/audit` first before inspecting raw connector rows.

## Local Dev And Mocking

Safe local setup rules:

- use token-based mock credentials only
- never reuse production connector secrets in `.env.local` or ad-hoc scripts
- prefer fixture titles that include the scope, for example `Research Drive` or `Tenant Notion`
- when testing stale warnings, reduce cadence on the test connector instead of editing timestamps by hand

Recommended local workflow:

1. Create a connector from `/admin/connectors`.
2. Queue a sync to create the first provenance row and placeholder source.
3. Use the status route to force `paused` or `revoked`.
4. Verify both:
   - `/admin/connectors/health`
   - `/workspace/source-status`

## Browser QA Notes

`tests/e2e/connectors-workflows.spec.ts` is the focused browser lane for connector health plus workflow authoring.

Host-specific continuity:

- auth redirects on this server class can take tens of seconds under cold startup
- the spec therefore uses `60s` waits for register/login transitions
- generic text locators are not stable on `/apps`; prefer scoped headings such as `${connectorTitle} source`
