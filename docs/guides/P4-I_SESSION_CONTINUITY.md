# P4-I Session Continuity

## Known Flaky Host Behaviors
- Large `apply_patch` writes can truncate files.
- Some long-running browser wrappers keep background processes alive after failures.
- Persistence suites are safest when run serially on this server class.

## Onboarding Checklists
- Local dev: verify node/npm, `npm ci`, type-check, and build.
- Browser QA: confirm ingress path, active ports, seeded credentials, and locale.
- Staging/public QA: record domain or tunnel URL in the dev log.
- Production diagnostics: capture trace id, run id, tenant id, and recent audit events first.

## Naming And Versioning
- Plans use stable phase-prefixed filenames.
- Migrations stay forward-only and numerically ordered.
- Seeded app IDs, tenant IDs, and fixture names should remain stable once referenced by tests.
- Dev-log filenames use the UTC date plus optional focused suffixes.

## Archival Rules
- Keep current execution plan and current release-state documents live.
- Older guides may be superseded but should not be deleted until a replacement is linked.
- Public QA notes belong in dev logs, not only chat transcripts.

## Push-Before-Stop Rule
- No long-running implementation round is complete until commits are pushed and the dev log records the resulting hashes.
- CI now runs `npm run release:round-check` so code-bearing rounds also need matching plan, guide, and dev-log updates before merge.
