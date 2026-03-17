# P4-C Plan Retention And Branching Model

`P4-C-01` through `P4-C-12` establish the persisted plan/branch/workflow-memory boundary for long-running agent work.

## Run Boundary

The run contract now carries four planning surfaces:

- `plan`
- `branch`
- `workflow`
- `internalNotes`

These are all returned from `GET /workspace/runs/:runId` and replayed in `/chat/[conversationId]`.

## Visibility Rules

Visible to the owner conversation view:

- `plan`
- `branch`
- `workflow`
- plan-step artifacts
- plan-step citations

Hidden from shared/read-only surfaces:

- `internalNotes`
- raw operator control reasons unless already reflected into visible workflow state

`internalNotes` are intentionally limited to `channel = internal_redacted`.

## Branch Semantics

Branch creation happens through `POST /workspace/runs/:runId/branch`.

Current lineage fields:

- `parentConversationId`
- `parentRunId`
- `rootConversationId`
- `depth`
- `label`
- `createdByAction`

Current `createdByAction` values:

- `launch`
- `branch`
- `resume`

Branching creates a new conversation and a new launch run, then copies lineage metadata forward.

## Plan-Step Semantics

Supported step statuses:

- `pending`
- `in_progress`
- `blocked`
- `completed`
- `skipped`
- `paused`

Supported operator actions:

- `pause`
- `resume`
- `skip`
- `restart`

These mutations write both:

- run timeline events
- updated plan/workflow state on the run outputs boundary

## Workflow Memory Semantics

Workflow memory is not raw chain-of-thought.

What is persisted:

- short redacted summaries
- operational reasons for pause/resume/skip/restart
- enough context to explain branch lineage and resumed workflow state

What is intentionally not persisted:

- free-form hidden reasoning
- provider-specific prompt internals
- private reviewer notes meant for audit-only storage

## Timeline And Replay

Planning transitions are represented in run timeline events:

- `branch_created`
- `plan_step_updated`
- `workflow_paused`
- `workflow_resumed`

Replay panels should rely on the run boundary instead of reconstructing plan state from transcript text.

## Testing Notes

Primary coverage lives in:

- `apps/gateway/src/routes/workspace.test.ts`
- `apps/web/src/lib/apps-client.test.ts`
- `tests/e2e/connectors-workflows.spec.ts`

On this host:

- plan/branch browser flows are more stable when run through `node scripts/run-e2e.mjs tests/e2e/connectors-workflows.spec.ts`
- generic `paused` text assertions are too broad in the replay panel; scope to `Workflow paused`
