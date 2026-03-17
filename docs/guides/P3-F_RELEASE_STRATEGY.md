# `P3-F-11/12` Public Release Strategy And Host Runtime Caveats

## Blue/Green And Canary Notes

- Default public release mode is `blue/green`.
- Keep two service sets on the same host class:
  - `agentifui-web-blue` / `agentifui-gateway-blue`
  - `agentifui-web-green` / `agentifui-gateway-green`
- `nginx` or the edge proxy owns the active upstream label.
- Promotion sequence:
  1. Deploy schema-safe migrations first.
  2. Build and boot the inactive color.
  3. Run `npm run smoke:deploy`.
  4. Run a browser smoke against `/login`, `/apps`, one chat launch, and one admin read route.
  5. Shift 5-10% internal QA traffic if canary is enabled.
  6. Promote the full edge upstream.
  7. Keep the previous color warm until audit, error, and runtime health stay stable.
- Use `canary` only for:
  - runtime adapter changes
  - auth/session changes
  - shared transcript or artifact routing changes
  - browser-heavy releases where layout regressions are likely

## Rollback Envelope

- Only ship app versions that are compatible with the current forward-only DB schema.
- Roll back by switching proxy traffic to the previous color, not by reverting migrations.
- Keep the previous build artifact and systemd unit files intact until:
  - deploy smoke passes
  - audit writes succeed
  - one browser chat flow and one admin flow succeed

## Host-Class Browser And Playwright Caveats

- This server class can show browser instability when too many headless Chromium contexts stay open.
- Prefer isolated ports for browser validation:
  - web: `31xx`
  - gateway: `41xx`
- Do not reuse stale long-running dev processes for release verification.
- When raw Playwright is required, prepare runtime libs first:

```bash
node scripts/prepare-playwright-runtime.mjs
LD_LIBRARY_PATH="<returned path>" npx playwright test
```

- Known failure patterns on this host class:
  - `net::ERR_INSUFFICIENT_RESOURCES`
  - `browserContext.newContext` timeout
  - client exceptions caused by a stale web process still pointing at an old gateway port
- Mitigations:
  - prefer one suite at a time
  - avoid parallel local browser runs during active dev servers
  - verify `web -> gateway` port pairing before opening a public tunnel
  - record temporary tunnel URLs in the dev log and expire them after QA

## Public QA Notes

- Primary public entrypoint should remain the documented `80/443` reverse proxy.
- Temporary `cloudflared` tunnels are still allowed for emergency QA, but they are fallback-only and must be recorded in the dev log with:
  - exact URL
  - backing web/gateway ports
  - test account used
  - reason a stable public entrypoint was not used
