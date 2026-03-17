# P4-D Workflow Authoring Operations

`P4-D-01` through `P4-D-12` add stored workflow definitions, versioning, dry-run validation, authoring UI, import/export, and rollout controls.

## Definition Model

Workflow definitions are stored across:

- `workflow_definitions`
- `workflow_definition_versions`
- `workflow_definition_permissions`

The shared contract lives in `packages/shared/src/workflows/contracts.ts`.

Current document sections:

- `nodes`
- `edges`
- `variables`
- `approvals`

Current node types:

- `prompt`
- `retrieval`
- `tool_call`
- `approval`
- `transform`
- `export`

## Versioning Rules

Version statuses:

- `draft`
- `published`
- `archived`
- `rolled_back`

Operational rules:

- create starts at version `1` in `draft`
- update creates a new draft version
- publish points `workflow_definitions.current_version_id` at the chosen version
- rollback creates a new `rolled_back` version that copies the target version document

## Validation And Dry Run

Validation runs before publish and dry-run.

Current checks include:

- duplicate node ids
- duplicate edge ids
- duplicate variable names
- duplicate approval ids
- edges that point to unknown nodes
- missing node titles

Current warnings include:

- no clear entry node
- approval node without an approval policy

Dry run is exposed at:

- `POST /admin/workflows/:workflowId/dry-run`

Dry run validates and returns a plan preview without creating a real workspace run.

## Permission Model

Workflow permissions are per-user-email and support:

- `author`
- `reviewer`
- `publisher`
- `runner`

Default creation behavior grants all four roles to the creator email.

## Import And Export

Export route:

- `GET /admin/workflows/:workflowId/export`

Import route:

- `POST /admin/workflows/import`

Import behavior:

- version ids are remapped
- `rolledBackFromVersionId` references are remapped with the new ids
- slug collisions are resolved by appending `-imported-xxxx`

## Replay Provenance

Structured runtime runs now surface workflow provenance on the run boundary:

- `workflow.definitionId`
- `workflow.versionId`
- `workflow.versionNumber`
- `workflow.name`
- `workflow.runnerRoles`

Conversation replay panels should show this metadata instead of inferring it from transcript text.

## Authoring UI

The admin authoring surface is:

- `/admin/workflows`

Current supported operations:

- create
- edit latest draft JSON
- dry run
- publish latest version
- rollback to a chosen published version
- export into import payload form
- import from raw JSON
- edit permission lines in `email:role` form

This is intentionally a JSON-first authoring surface, not a graphical node editor.

## Safe Rollout Steps

Recommended rollout order:

1. Create or update the draft definition.
2. Run dry-run validation against representative fixtures.
3. Review validation errors and warnings.
4. Publish the target version.
5. Confirm audit entries for publish or rollback.
6. Verify replay surfaces show the expected workflow provenance.

If a publish is wrong:

1. export the current workflow for record keeping
2. rollback to the known good version
3. verify the new rolled-back version becomes current
4. record the reason in the dev log
