# P3-D Eval, Replay, And Release QA

This guide is the operational entrypoint for the `P3-D` evaluation toolchain.

## Scope

The eval stack covers:

- golden transcript fixtures for core apps and workflows
- deterministic replay through the in-memory gateway/runtime boundary
- snapshot comparison for transcript body, artifacts, citations, source blocks, safety signals, and tool executions
- release gating for auth, admin, and chat smoke paths
- incident replay for failed or degraded fixture traces
- focused developer commands for a single app or workstream

## Prerequisites

The eval scripts import gateway source through `tsx`, and gateway source depends on built workspace packages.

Run these once after a fresh checkout:

```bash
npm run build --workspace @agentifui/shared
npm run build --workspace @agentifui/db
```

`npm run eval:ci` and the GitHub Actions `eval` job already do this for you.

## Fixture Layout

- golden fixtures live in `tests/evals/golden/*.json`
- incident replay snapshots live in `tests/evals/incidents/*.json`
- fixture definitions live in `scripts/evals/fixtures.ts`

Each replayed completion writes version metadata into `run.inputs.variables.eval`, including:

- `fixtureId`
- `fixtureVersion`
- `promptVersion`
- `runtimeVersion`
- `harnessVersion`
- `workstream`

This is the version boundary used for replayable runs in `P3-D-04`.

## Core Commands

Run the full pack and compare against committed goldens:

```bash
npm run eval:run -- --pack full
```

Run only the minimal release pack:

```bash
npm run eval:run -- --pack minimal
```

Run a focused app pack:

```bash
npm run eval:app -- --app app_policy_watch
```

Run a focused workstream:

```bash
npm run eval:workstream -- --workstream safety
```

Run a single fixture:

```bash
npm run eval:run -- --fixture tenant-control-approval
```

Refresh committed golden baselines after an intentional behavior change:

```bash
npm run eval:run -- --pack full --update-snapshots --write-output artifacts/evals/bootstrap
```

Run the release gate with markdown/json output:

```bash
npm run eval:release -- --pack minimal --write-output artifacts/evals/release
```

Replay an incident-oriented fixture and write a point-in-time artifact:

```bash
npm run eval:incident -- --fixture tenant-control-timeout-incident --write-output artifacts/evals/incidents
```

## Output Artifacts

When `--write-output <dir>` is provided, the harness writes:

- `results.json`
- `comparison-report.md`

The release gate also writes:

- `release-gate.json`
- `release-gate.md`

CI uploads `artifacts/evals/ci` as the `eval-ci-report` workflow artifact.

## Comparison Semantics

The harness intentionally scrubs dynamic values before comparing snapshots:

- `traceId`
- generated tool call ids
- generated idempotency hashes

This keeps snapshot diffs focused on real regressions rather than run-specific entropy.

## Release Gate Semantics

`npm run eval:release` fails when either of these is true:

1. any selected eval fixture differs from its committed golden snapshot
2. any inject-based smoke path fails

Current smoke coverage:

- auth: register + login
- admin: `/admin/users` + `/admin/apps`
- chat: workspace launch + blocking chat completion

## Promotion Workflow

Use this sequence when behavior changes are intentional:

1. Make the code change.
2. Run `npm run eval:run -- --pack full`.
3. Inspect `comparison-report.md` and confirm the diffs are intentional.
4. Re-run with `--update-snapshots`.
5. Re-run `npm run eval:release -- --pack minimal`.
6. Commit the code and the updated `tests/evals/golden/*.json` baselines together.

Do not refresh goldens in isolation. The code change, the report, and the new golden outputs must move in the same change set.

## Review Guidance

Reviewers should inspect:

- transcript wording changes
- added/removed citations
- artifact content changes
- new or missing safety signals
- tool execution latency, timeout, and failure taxonomy changes
- `versions.*` drift for prompt/runtime profiles

If the diff only reflects dynamic ids, the sanitizer is incomplete and should be fixed before updating goldens.

## Host-Specific Notes

- The eval scripts do not need Postgres; they run against the in-memory gateway services.
- Browser/public QA remains separate from this stack. Continue using the documented `cloudflared` fallback or the stable `80/443` ingress path for manual browser checks.
- On this server class, keep heavy browser suites and eval runs separate to avoid resource contention.
