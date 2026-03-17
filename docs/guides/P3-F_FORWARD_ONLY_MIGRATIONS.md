# P3-F Forward-only Migrations

This is the safety note for `P3-F-10`.

## Rules

- schema migrations are applied in lexical order from `packages/db/migrations`
- production deploys should assume forward-only movement
- rollback should normally mean:
  1. stop traffic
  2. restore the last known-good backup
  3. redeploy the prior application build

## Why

The workspace schema now spans:

- auth
- workspace conversations/runs
- knowledge ingestion
- artifacts/shares/comments
- enterprise identity governance

That makes handwritten rollback SQL higher risk than restore-based rollback.

## Deployment Checklist

Before applying migrations:

1. run `npm run backup:export`
2. capture the current app SHA
3. run a staging or local `npm run db:migrate`
4. run `npm run type-check`
5. run focused tests for touched routes
6. run `SMOKE_BASE_URL=... npm run smoke:deploy`

## Restore Rule

Use the backup drill from [P2-E4_BACKUP_RESTORE_DRILL.md](/home/bistu/zyr/pros/agentifui/docs/guides/P2-E4_BACKUP_RESTORE_DRILL.md) when rollback is required.
