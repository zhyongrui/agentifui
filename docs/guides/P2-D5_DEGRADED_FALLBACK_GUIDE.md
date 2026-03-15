# P2-D5 Degraded Fallback Guide

This guide records the runtime-degraded read-only fallback that was added in `P2-D5`.

## What Degraded Mode Means

- gateway `/health` now exposes runtime degradation through `runtime.overallStatus`
- workspace read surfaces stay available:
  - `/chat`
  - `/chat/[conversationId]`
  - run replay
  - artifact preview
  - pending-action cards
- runtime-dependent writes are blocked while degraded:
  - `POST /v1/chat/completions`
  - `POST /workspace/conversations/:conversationId/uploads`
  - `POST /workspace/conversations/:conversationId/pending-actions/:stepId/respond`

## Operator Toggle

For isolated QA or maintenance windows, start the gateway with:

```bash
GATEWAY_DEGRADED_RUNTIMES='placeholder,placeholder_structured'
```

This marks the placeholder adapters as degraded and drives both:

- `/health` runtime status
- chat read-only banners
- blocked upload / pending-action writes

## Browser QA Recipe

Preferred isolated stack on this host:

```bash
npm run build
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui \
GATEWAY_PORT=4119 \
BETTER_AUTH_SECRET=agentifui-e2e-super-secret-1234567890 \
GATEWAY_SSO_DOMAINS='iflabx.com=iflabx-sso' \
GATEWAY_DEGRADED_RUNTIMES='placeholder,placeholder_structured' \
npm run start --workspace @agentifui/gateway
```

```bash
PORT=3119 \
GATEWAY_INTERNAL_URL=http://127.0.0.1:4119 \
npm run start --workspace @agentifui/web
```

```bash
LD_LIBRARY_PATH=/home/bistu/zyr/pros/agentifui/.cache/playwright-runtime-libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3119 \
PLAYWRIGHT_EXPECT_DEGRADED_RUNTIME=1 \
npx playwright test tests/e2e/phase1-flows.spec.ts --grep "degraded runtime keeps history readable and the composer disabled"
```

Expected browser result:

- `/chat` shows the degraded banner
- launching `Runbook Mentor` still opens a conversation
- conversation banner is visible
- `Message`, `Attachments`, and `Send message` are disabled
- run replay and other read-only panels still render

## Recovery Procedure

1. Remove `GATEWAY_DEGRADED_RUNTIMES`
2. Restart the gateway
3. Refresh `/health` and confirm `runtime.overallStatus = available`
4. Re-open `/chat/[conversationId]`
5. Verify composer, uploads, and pending-action responses are enabled again

## Host-Specific Notes

- avoid reusing the long-running default `3111` web process without checking its target gateway first
- on this host, the safest browser verification flow is still an isolated `build + start` pair on fresh ports
- `node scripts/prepare-playwright-runtime.mjs` prints the required `LD_LIBRARY_PATH` for raw Playwright runs
