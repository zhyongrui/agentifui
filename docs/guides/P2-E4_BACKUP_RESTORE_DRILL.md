# P2-E4 Backup And Restore Drill

`P2-E4` defines the minimum backup set and a repeatable local restore rehearsal for the persistent AgentifUI stack.
The current implementation now includes:

- `npm run backup:export`
- `npm run backup:restore`
- `manifest.json` with row counts, checksum, and representative sanity samples
- `restore-report.json` with row-count verification plus replay/artifact/share/audit/quota sanity checks

## Minimum Backup Set

The current minimum logical backup includes these data surfaces:

- auth and tenant identity:
  - `tenants`
  - `users`
  - `group_members`
  - `auth_identities`
  - `auth_sessions`
  - `auth_challenges`
  - `mfa_factors`
  - `invitations`
  - `better_auth_accounts`
  - `better_auth_sessions`
  - `better_auth_verifications`
- RBAC and workspace catalog:
  - `groups`
  - `rbac_roles`
  - `rbac_user_roles`
  - `workspace_apps`
  - `workspace_app_access_grants`
  - `workspace_group_app_grants`
  - `workspace_user_preferences`
  - `workspace_quota_limits`
- workspace execution state:
  - `conversations`
  - `runs`
  - `run_timeline_events`
  - `workspace_app_launches`
  - `workspace_conversation_shares`
  - `workspace_uploaded_files`
  - `workspace_artifacts`
- admin/audit:
  - `audit_events`

If `GATEWAY_UPLOADS_DIR` is configured, back up the uploads directory together with the SQL snapshot.

## Representative Local Seed

The drill is only meaningful when the DB contains representative persisted data. The current recommended local seed path is:

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui npm run db:reset
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui GATEWAY_PORT=4122 BETTER_AUTH_URL=http://127.0.0.1:4122 npm run start --workspace @agentifui/gateway
PORT=3122 GATEWAY_INTERNAL_URL=http://127.0.0.1:4122 npm run start --workspace @agentifui/web
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui PERF_BASE_URL=http://127.0.0.1:3122 npm run perf:seed
```

The perf seed creates:

- member/admin/viewer accounts
- persisted conversations and runs
- run timeline rows
- artifacts
- one active share link
- quota usage and admin audit reads

## Export

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
GATEWAY_UPLOADS_DIR=/path/to/agentifui-uploads \
npm run backup:export
```

Artifacts written under `artifacts/backups/backup-<timestamp>/`:

- `backup.sql`
- `manifest.json`
- optional `uploads/`

Important:

- run export and restore sequentially
- do not launch `backup:restore` before `backup:export` has fully written `manifest.json`
- on this host, parallel export/restore can fail with `ENOENT ... manifest.json`

## Restore

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
BACKUP_INPUT_DIR=/abs/path/to/artifacts/backups/backup-<timestamp> \
GATEWAY_UPLOADS_DIR=/path/to/agentifui-uploads \
npm run backup:restore
```

Restore flow:

1. `npm run db:reset`
2. replay `backup.sql` through `psql`
3. restore the uploads directory if present
4. compare live row counts with `manifest.json`
5. verify representative sanity samples:
   - conversation replay counts
   - latest run linkage
   - artifact linkage
   - active share linkage
   - audit row lookup
   - quota snapshot values
6. write `restore-report.json`

## Recommended Local Drill

1. Seed representative data with the perf flow above.
2. Export:

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
BACKUP_OUTPUT_DIR=/abs/path/to/artifacts/backups/p2-e4-drill \
npm run backup:export
```

3. Verify the checksum:

```bash
jq -r '.sql.sha256' /abs/path/to/artifacts/backups/p2-e4-drill/manifest.json
sha256sum /abs/path/to/artifacts/backups/p2-e4-drill/backup.sql
```

4. Restore:

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
BACKUP_INPUT_DIR=/abs/path/to/artifacts/backups/p2-e4-drill \
npm run backup:restore
```

5. Inspect `restore-report.json`.

## Sanity Checks

- `manifest.json.sql.sha256` must match the exported SQL blob
- `restore-report.json.mismatchedTables` must be empty
- `restore-report.json.sanityFailures` must be empty
- the manifest should contain representative samples under `manifest.json.sanity`:
  - `conversation`
  - `latestRun`
  - `artifact`
  - `share`
  - `latestAudit`
  - `quota`

## Post-Restore HTTP Smoke

After restore, verify the live routes against the sample ids in `manifest.json.sanity`.
The local smoke used in this round hit:

- `POST /api/gateway/auth/login`
- `GET /api/gateway/workspace/apps`
- `GET /api/gateway/workspace/conversations/:conversationId`
- `GET /api/gateway/workspace/conversations/:conversationId/runs`
- `GET /api/gateway/workspace/runs/:runId`
- `GET /api/gateway/workspace/artifacts/:artifactId`
- `GET /api/gateway/workspace/shares/:shareId`
- `GET /api/gateway/admin/audit?limit=20`
- `GET /api/gateway/admin/usage`

Expected summary from the last successful local drill:

- one restored shared conversation:
  - `conv_fae311a2-1c42-4800-82a1-4a07793f136d`
- one restored latest run:
  - `run_b8c76f82-5ace-43e0-80b5-4925baa2198f`
- one restored artifact:
  - `artifact_3fa8ec8b-17dd-42c9-884f-39bf5f200945`
- one restored share:
  - `share_c4189b40-a9c5-45ec-91af-81ffbf7f124b`
- `quotaScopeMatched = true`

## Public-Access And Browser QA Notes

Restored preview links only work when the public ingress points at the restored web instance.
Current continuity guidance:

- temporary public QA can still use `cloudflared tunnel --url http://127.0.0.1:<web-port>`
- formal public QA should prefer the existing `80/443` reverse-proxy entry rather than raw high ports
- restored `/chat/shared/:shareId` and `/chat/artifacts/:artifactId` checks should reuse a non-MFA account such as `perf-viewer@example.net`
- if you rebuild web/gateway and use `next start` / `dist/main.js`, rebuild first with `npm run build` or the public tunnel may serve stale code

## Periodic Smoke Checklist

- seed representative data if the local DB is empty
- run `backup:export`
- verify the SQL checksum
- run `backup:restore`
- confirm both `mismatchedTables` and `sanityFailures` are empty
- run the post-restore HTTP smoke against conversation/run/artifact/share/admin routes
- if public ingress is part of the release path, verify one shared transcript URL and one artifact preview URL through the real public entry

## Disaster-Recovery Runbook

1. Stop writes or take the affected environment out of rotation.
2. Identify the latest usable backup directory and verify `manifest.json.sql.sha256`.
3. Point `DATABASE_URL` and optional `GATEWAY_UPLOADS_DIR` at the target recovery environment.
4. Run `npm run backup:restore`.
5. Inspect `restore-report.json` and confirm:
   - `mismatchedTables = []`
   - `sanityFailures = []`
6. Bring up a web/gateway pair against the restored environment.
7. Run the post-restore HTTP smoke.
8. If public ingress matters for the incident, repoint `cloudflared` or the reverse proxy and verify one shared transcript + one artifact preview from outside the box.
9. Record the backup directory, checksum, restored environment, and smoke results in the dev log.

## Current Caveats

- this is a logical data export, not a physical Postgres base backup
- route-level restore verification is still manual shell smoke rather than a dedicated scripted command
- repeated local browser QA on a shared DB should use unique tenant slugs to avoid `ADMIN_CONFLICT`
- if you test against changed web/gateway code with `next start` / `dist/main.js`, rebuild first with `npm run build`
- the current drill does not seed `workspace_uploaded_files`
  - uploads are still backed up when `GATEWAY_UPLOADS_DIR` is configured
  - if upload recovery matters for a change, add a local upload sample before running the drill
