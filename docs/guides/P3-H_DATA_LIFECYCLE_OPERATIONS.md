# `P3-H` Data Lifecycle, Migration, And Recovery Operations

## `P3-H-01` JSON Field Audit

- Run `npm run ops:json-audit`.
- Output lands at `artifacts/data-lifecycle/json-field-audit.json`.
- The audit classifies persisted JSON fields into:
  - `candidate_child_table`
  - `candidate_normalized_join`
  - `structured_contract_or_child_table`
  - `retain_json_with_contract`

## `P3-H-02` Large-Table Migration Notes

High-risk tables:

- `conversations`
- `runs`
- `run_timeline_events`
- `workspace_artifacts`
- `audit_events`
- `knowledge_source_chunks`

Rules:

- prefer additive columns and backfills over in-place reshapes
- deploy code that can read old and new shapes before cleanup migrations
- for large backfills, use id-ranged batches and record progress markers
- ship verification SQL with every migration touching replay, audit, or artifact linkage

## `P3-H-03` Fixture And Seed Versioning

- Fixture version source of truth: `config/test-fixture-version.json`
- Inspect with `npm run ops:fixture-version`
- Bump the version when:
  - seeded groups/apps change
  - browser flow expectations change
  - persistence assumptions about baseline rows change

## `P3-H-04` Downgrade Expectations

- Treat schema migrations as forward-only unless a specific reversible rollback is documented.
- Rollback means:
  - switch traffic back to the previous compatible app build
  - restore from backup if data shape is no longer readable
- Do not rely on ad hoc hand-written down migrations for replay/audit tables.

## `P3-H-05` Integrity Checks

- Run `npm run ops:integrity`
- Current checks cover:
  - run -> conversation tenant/app/user linkage
  - artifact -> run/conversation linkage
  - timeline -> run/conversation linkage
  - launch -> run/trace linkage
  - share -> group/conversation tenant linkage
  - comment targets for runs and artifacts
  - notification -> comment target linkage
  - knowledge chunk -> source tenant linkage

## `P3-H-06` Restore Route Verification

- Run `npm run ops:restore-routes` with:
  - `DATABASE_URL`
  - `BACKUP_INPUT_DIR`
- Optional HTTP verification:
  - `APP_BASE_URL`
  - `AUTH_BEARER_TOKEN`
- Output lands at `<backup>/verification/route-verification.json`
- The report preserves:
  - owner conversation route
  - artifact preview route
  - shared conversation route
  - shared artifact preview route

## `P3-H-07` Storage Growth Reporting

- Run `npm run ops:storage-report`
- Output lands at `artifacts/data-lifecycle/storage-growth-report.json`
- Categories:
  - `history`
  - `uploads`
  - `audit`
  - `knowledge`
  - `collaboration`

## `P3-H-08` Recovery Checklist

For corrupted JSON rows:

1. export a fresh backup snapshot before making row-level edits
2. isolate the affected table and primary keys
3. compare the row against the JSON field audit and the current shared contract
4. patch only the minimal invalid fields
5. rerun `npm run ops:integrity`
6. rerun any affected browser/persistence smoke

For partially applied migrations:

1. stop traffic or switch back to the previous color
2. inspect migration table state and DB logs
3. confirm whether the app can still read the current shape
4. if not, restore from the latest validated backup
5. rerun:
   - `npm run db:migrate`
   - `npm run ops:integrity`
   - `npm run ops:restore-routes`
   - `npm run smoke:deploy`

## Required Dev-Log Context

Every session that changes lifecycle or recovery behavior must record:

- backup/export directory used
- restore verification result
- integrity check result
- fixture version in effect
- any temporary public QA URL or port mapping used during validation
