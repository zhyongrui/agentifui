# P2-E1 Workspace Cleanup Runbook

## Purpose

`P2-E1` adds a tenant-scoped cleanup surface for old archived conversations, expired shares, orphaned artifacts, and cold run timeline rows.

The cleanup code lives in:

- `apps/gateway/src/services/workspace-cleanup.ts`
- `apps/gateway/src/scripts/workspace-cleanup.ts`

## Default Policy

The built-in retention policy is currently:

- archived/deleted conversations older than `30` days are eligible for deletion
- active share links older than `14` days are revoked
- run timeline rows older than `14` days are pruned once the parent run has finished and the conversation is still active
- orphaned artifacts are deleted whenever their parent conversation/run is missing or the parent conversation is already deleted

The gateway admin preview route exposes the same policy and candidate counts:

- `GET /admin/cleanup`

## Dry Run

Run a non-destructive preview from the repo root:

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
npm run cleanup:workspace --workspace @agentifui/gateway
```

Optional tenant override:

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
npm run cleanup:workspace --workspace @agentifui/gateway -- --tenant=tenant-dev
```

Dry-run output is JSON and includes:

- `archivedConversations`
- `expiredShares`
- `orphanedArtifacts`
- `coldTimelineEvents`
- `totalCandidates`
- `cutoffs`

## Execute

Execute the cleanup job explicitly:

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
npm run cleanup:workspace --workspace @agentifui/gateway -- --execute
```

Optional tenant override:

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
npm run cleanup:workspace --workspace @agentifui/gateway -- --execute --tenant=tenant-dev
```

Execution writes audit records for:

- `workspace.conversation_share.expired`
- `workspace.cleanup.executed`

## Admin Visibility

Tenant admins can inspect current cleanup status through:

- `GET /admin/cleanup`

The response includes:

- the active cleanup policy
- current preview counts
- the latest cleanup execution summary and actor

The web admin surface exposes the same information on:

- `/admin/apps`

## Rollback Expectations

Cleanup execution is destructive for archived conversations, orphaned artifacts, and cold timeline rows.

Operational expectations:

- run a dry run first and record the returned JSON
- if `archivedConversationsDeleted` would affect an unexpected tenant, stop and verify the tenant filter before execution
- revoked share links are not auto-restored; recreating a share issues a new link
- deleted archived conversations are expected to be restored only from DB backup, not from app-level undo

## Host Notes

Useful continuity notes for this shared host:

- the targeted persistence test for cleanup is valid but slow
  - `npx vitest run apps/gateway/src/routes/auth-persistence.test.ts -t "executes workspace cleanup for aged archived conversations and exposes the result through admin cleanup status"`
  - on this host it took roughly `50-95s`
- if a large `apply_patch` hunk times out and truncates a file, restore it with:

```bash
git show HEAD:path/to/file > path/to/file
```

- if `vitest` appears stalled, check for orphaned workers first:

```bash
pgrep -af vitest
```
