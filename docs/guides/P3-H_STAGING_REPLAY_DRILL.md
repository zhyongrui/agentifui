# P3-H Staging Replay Drill

## Goal

Replay production-like eval fixtures against a staging-grade gateway build and record a comparable report that includes both deterministic eval diffs and release smoke checks.

## Command

```bash
npm run eval:staging-drill -- --pack release --write-output artifacts/evals/staging-drill
```

Optional flags:

- `--pack full|minimal|release|incident`
- `--app <appId>`
- `--workstream <workstream>`
- `--fixture <fixtureId>`

## Expected Outputs

The output directory contains:

- `release-gate.json`
- `release-gate.md`
- `staging-drill.md`
- the per-fixture eval output emitted by the shared harness

## Operator Checklist

1. Run the drill against the same-origin staging entrypoint, not a direct cross-origin gateway URL.
2. Confirm the DB snapshot or seeded staging state is compatible with the current fixture version before trusting diffs.
3. Copy the output directory path and notable failures into the dev log immediately after the run.
4. If browser QA is needed on this host class, use the documented Playwright runtime preparation and isolated ports from the deployment/runtime caveat docs.

## Failure Handling

- Eval diff failures mean prompt/runtime behavior changed and must be reviewed before promotion.
- Smoke check failures mean staging is not release-ready even if eval snapshots still match.
- If the drill fails because of host browser/runtime caveats, record the exact command, ports, and fallback validation path in the dev log.
