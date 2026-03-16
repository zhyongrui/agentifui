# P3-B Tool Onboarding And End-To-End Test Guide

## Goal

This guide is the minimum safe path for adding a new workspace tool and verifying it end to end without regressing the existing tool replay, approval, audit, and persistence boundaries.

Use it when you:

- add a new tool to the built-in registry
- add a new tool policy override on the admin surface
- add a new approval-gated tool
- change tool result shape, retry behavior, or failure handling

## Current Tool Stack

The current tool flow is split across four layers:

1. shared contracts
   - `packages/shared/src/tools/contracts.ts`
   - `packages/shared/src/chat/contracts.ts`
   - `packages/shared/src/apps/contracts.ts`
2. registry and runtime
   - `apps/gateway/src/services/tool-registry-service.ts`
   - `apps/gateway/src/services/persistent-tool-registry-service.ts`
   - `apps/gateway/src/services/workspace-runtime.ts`
3. persistence and replay
   - `apps/gateway/src/routes/chat.ts`
   - `apps/gateway/src/services/workspace-service.ts`
   - `apps/gateway/src/services/persistent-workspace-service.ts`
4. operator surfaces
   - `apps/web/src/app/admin/apps/page.tsx`
   - `apps/web/src/app/(main)/chat/[conversationId]/page.tsx`
   - `apps/web/src/components/workspace-tool-summary.tsx`

## Safe Add Checklist

- define a typed descriptor in shared contracts before touching runtime code
- keep auth scope explicit
- keep input schema explicit and narrow
- decide whether the tool is approval-gated before wiring the runtime path
- define execution policy defaults:
  - `timeoutMs`
  - `maxAttempts`
  - `idempotencyScope`
- decide what a failed attempt means:
  - retryable execution failure
  - timeout
  - approval rejection
  - approval cancellation
  - approval expiry
- make sure the tool can round-trip through:
  - transcript tool call summary
  - run replay tool execution summary
  - audit payload
  - persistence restart coverage

## Implementation Order

### 1. Shared contracts

Update:

- `packages/shared/src/tools/contracts.ts`
- `packages/shared/src/chat/contracts.ts` if request/response shape changes
- `packages/shared/src/apps/contracts.ts` if replay metadata changes

Keep these rules:

- prefer explicit object schemas over loose records
- keep `strict: true` where the runtime depends on exact keys
- if the tool can fail in a new way, extend `WorkspaceRunFailureCode` and derive a structured tool execution failure

### 2. Built-in registry

Update:

- `apps/gateway/src/services/tool-registry-service.ts`

For each tool define:

- descriptor
- default enablement
- auth scope
- execution policy
- tags

If the tool should be tenant-configurable, verify the admin override path still works after restart:

- `apps/gateway/src/services/persistent-tool-registry-service.ts`
- `apps/gateway/src/routes/tool-registry-persistence.test.ts`

### 3. Runtime path

Update:

- `apps/gateway/src/services/workspace-runtime.ts`

The runtime must emit deterministic placeholder behavior for:

- success
- provider failure
- timeout
- approval-required pending path if applicable

Current reminder:

- approval-gated tools should reuse `WorkspaceHitlStep.metadata`
- tool retry/idempotency metadata must be preserved on every attempt

### 4. Chat route and persistence

Verify:

- `apps/gateway/src/routes/chat.ts`
- `apps/gateway/src/services/workspace-service.ts`
- `apps/gateway/src/services/persistent-workspace-service.ts`

Required end state:

- `toolCalls` persist into transcript/replay
- `toolExecutions` persist into run outputs
- failed attempts carry structured `toolExecutions[*].failure`
- legacy `metadata.failureReason` stays present for compatibility
- audit events include the final structured failure when available

### 5. Admin surface

If the tool is tenant-configurable, update:

- `apps/web/src/app/admin/apps/page.tsx`
- `apps/web/src/lib/admin-client.test.ts`

Verify:

- enable/disable state round-trips
- timeout/retry/idempotency overrides round-trip
- restart does not lose the override

### 6. Replay surface

Verify:

- `apps/web/src/app/(main)/chat/[conversationId]/page.tsx`
- `apps/web/src/app/(main)/chat/shared/[shareId]/page.tsx`
- `apps/web/src/components/workspace-tool-summary.tsx`

The replay surface should show:

- tool name
- arguments
- attempt
- latency
- failure taxonomy if failed
- idempotency key if relevant
- result preview

## Minimum Test Matrix

### Route tests

Use:

- `apps/gateway/src/routes/chat.test.ts`
- `apps/gateway/src/routes/workspace.test.ts`

Minimum route coverage:

- successful tool execution
- failed tool execution
- timeout/retry path
- approval-required tool pending path
- approved approval-required tool path
- cancelled approval-required tool path if the tool uses approval

### Persistence tests

Use:

- `apps/gateway/src/routes/auth-persistence.test.ts`

Minimum persistence coverage:

- tool execution survives restart
- idempotency metadata survives restart
- approval outcome survives restart
- cancelled approval-gated tool run survives restart

### UI/unit tests

Use:

- `apps/web/src/components/workspace-tool-summary.test.tsx`
- `apps/web/src/lib/admin-client.test.ts`

Add or update tests when:

- replay copy changes
- admin tool policy payload changes
- new structured failure codes appear

## Recommended Commands

### Focused type and route verification

```bash
npm run type-check
npx vitest run apps/gateway/src/routes/chat.test.ts apps/gateway/src/routes/workspace.test.ts
```

### Restart/persistence verification

```bash
npx vitest run apps/gateway/src/routes/auth-persistence.test.ts -t "tool|approval|required|cancelled"
```

### Replay/UI verification

```bash
npx vitest run apps/web/src/components/workspace-tool-summary.test.tsx apps/web/src/lib/admin-client.test.ts
```

### Final build

```bash
npm run build
```

## Manual Browser Check

When the tool affects user-visible replay or admin settings, manually check:

1. `/admin/apps`
2. launch the app that uses the tool
3. trigger a tool run
4. inspect:
   - transcript
   - run replay
   - pending-action response flow if approval is required
5. refresh the page and verify the same run state is still visible

## Known Gotchas

- route tests for approval-gated tools must use explicit:
  - `tool_choice.type = function`
  - `tool_choice.function.name = tenant.access.review`
  - otherwise the test can fall back to generic placeholder output and never create the approval-gated tool path
- do not infer tool failure from assistant text
  - replay should read `toolExecutions[*].failure`
- keep writing legacy `metadata.failureReason`
  - old readers and fallback parsers still depend on it
- if a tool can fail in a new way, update:
  - `WorkspaceRunFailureCode`
  - `buildWorkspaceToolExecutionFailure(...)`
  - replay summary copy
  - audit assertions
