# New AI Session Bootstrap

## Read First
1. `docs/status/ENVIRONMENT_STATUS.md`
2. `docs/plans/PHASE2_EXECUTION_PLAN.md`
3. latest entry in `docs/dev-log/`
4. `docs/RELEASE_STATE.md`

## Verify Before Editing
1. `git status --short`
2. confirm whether the current round already has uncommitted work
3. identify the active plan item, its `owner:` workstream, and the next blocked dependency

## Host Safety Rules
- Prefer very small `apply_patch` hunks.
- If a file becomes empty after a timeout, recover with `git show HEAD:path > path`.
- Avoid assuming `3111/4111` point at fresh processes; isolate browser runs when in doubt.

## Minimum Close-Out
- update the plan
- update the dev log
- record any public QA address or host-specific caveat
- run validation that matches the changed surface
- push commits before ending the round
