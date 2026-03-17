# P3-H Dev Log Context Checklist

Every substantial development session should copy the following operational context into the daily dev log so a new AI conversation can resume work safely.

## Environment And Access

- Public ingress mode in use:
  - stable `80/443` reverse proxy
  - temporary `cloudflared` tunnel
  - isolated localhost ports for browser smoke
- Active web/gateway ports used for manual QA or Playwright
- Whether same-origin `/api/gateway/*` proxying is healthy

## Host Caveats

- Any Playwright runtime preparation required on this server class
- Known browser resource failures or flaky suites
- Whether `npm run test:e2e` was fully green or replaced by targeted browser smoke

## Editing Hazards

- Whether large `apply_patch` hunks are currently truncating files on this host
- Recovery commands used for any truncated file, especially `git show HEAD:path > path`
- Any large files that should only be patched with tiny hunks

## Data And Test Context

- Current DB reset / migration assumptions
- Whether `npm test` and `npm run test:e2e` still need strict sequential execution
- Latest successful backup/export/restore drill output path
- Fixture or seed version currently expected by browser and persistence tests

## Runtime And Routing Overrides

- Any temporary degraded runtime/provider flags
- Active tenant runtime mode overrides
- Any special tool registry or approval policy seed data needed for QA

## Manual QA Context

- Test accounts created for browser QA
- Group/app combinations that must be selected before launching a flow
- Any SSO domain claim or MFA edge case that changes the login path

## What To Link

At minimum, link the updated:

- dev log entry for the day
- execution plan section that changed status
- runbook or guide added during the session
- commit hashes pushed to `origin/main`
