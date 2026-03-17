# Environment Status

## Baseline
- Repository root: `/home/bistu/zyr/pros/agentifui`
- Default branch: `main`
- Default remote: `origin`
- Default tenant seed: `dev-tenant`

## Common Ports
- Web dev/public QA fallback: `3111`
- Gateway dev/public QA fallback: `4111`
- Isolated browser smoke ports are preferred when `3111/4111` are already occupied.

## Public Access
- Stable ingress target is same-origin `80/443` reverse proxy.
- Temporary browser QA fallback remains `cloudflared`.
- Public QA links are temporary and must be written into the dev log for every session that creates one.

## Host Caveats
- Large `apply_patch` operations can time out and truncate files to zero bytes.
- Recovery pattern: `git show HEAD:path > path`, then reapply in very small hunks.
- Persistence specs are more reliable when run serially on this host class.
- Older long-lived web processes may still point at stale gateway ports; isolate browser runs when debugging.

## Required Verification Before Claiming Readiness
- `npm run type-check`
- affected Vitest suites
- `npm run build`
- targeted browser or public QA when UI behavior changed
