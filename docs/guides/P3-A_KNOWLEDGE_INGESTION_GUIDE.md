# P3-A Knowledge Ingestion Guide

## Scope

This guide documents the current Phase 3A knowledge-ingestion path:

- admin source creation and status transitions
- chunking and persisted chunk storage
- retrieval query construction and ranking
- retrieval backfeed into runtime citations/source blocks
- stale-source cleanup rules
- local development and verification workflow

## Data Flow

1. A tenant admin creates a source from `/admin/sources`.
2. Gateway validates and normalizes:
   - title
   - URL
   - labels
   - scope/group targeting
   - optional source content
3. Source content is chunked before persistence.
4. Source metadata is stored in `knowledge_sources`.
5. Chunk rows are stored in `knowledge_source_chunks`.
6. Status transitions move the source through:
   - `queued`
   - `processing`
   - `succeeded`
   - `failed`
7. During chat completion, Gateway builds a `KnowledgeRetrievalQuery`.
8. Retrieval ranks matching chunk rows for the active tenant and group boundary.
9. Runtime adapters receive `retrieval` in their invocation input.
10. Retrieval matches are backfilled into:
    - `citations`
    - `source_blocks`
    - persisted run inputs

## Chunking Profiles

Current chunking is heuristic and deterministic:

- `markdown` sources use `markdown_sections`
- `url` and `file` sources default to `paragraph_windows`
- non-markdown content that visibly contains markdown headings is promoted to `markdown_sections`

Current defaults:

- `markdown_sections`
  - target chars: `1200`
  - overlap chars: `160`
- `paragraph_windows`
  - target chars: `1000`
  - overlap chars: `120`

Chunks store:

- `headingPath`
- `preview`
- `content`
- `charCount`
- `tokenEstimate`

## Retrieval Rules

Retrieval currently uses lexical scoring only.

Signals:

- full-query containment
- token overlap
- label overlap
- heading-path emphasis

Access control:

- tenant-scoped sources are always eligible inside the tenant
- group-scoped sources are eligible only when `source.groupId === activeGroupId`

Current retrieval does not use:

- embeddings
- semantic reranking
- postgres full-text indexes

## Persistence Tables

Primary tables:

- `knowledge_sources`
- `knowledge_source_chunks`

Relevant fields on `knowledge_sources`:

- `status`
- `source_content`
- `chunking_strategy`
- `chunk_target_chars`
- `chunk_overlap_chars`
- `chunk_count`
- `last_chunked_at`
- `updated_source_at`
- `last_error`

Chunks are deleted automatically when a source is deleted because `knowledge_source_chunks.source_id` cascades on delete.

## Cleanup Rules

Workspace cleanup now includes stale knowledge-source retention.

Policy:

- `staleKnowledgeSourceRetentionDays = 30`

Cleanup candidates:

- sources older than the stale-source cutoff where:
  - status is `queued`, `processing`, or `failed`
  - or status is `succeeded` but the source is effectively empty:
    - `chunk_count = 0`
    - or `source_content is null`

Cleanup is conservative:

- successful, contentful sources are retained
- stale-source deletion cascades chunk deletion through FK constraints

Admin visibility:

- `/admin/cleanup`
- `/admin/apps` cleanup summary cards

## Local Development

### Reset and start

```bash
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui npm run db:reset
DATABASE_URL=postgresql://agentifui:agentifui@localhost:5432/agentifui GATEWAY_PORT=4127 BETTER_AUTH_SECRET=agentifui-e2e-super-secret-1234567890 GATEWAY_SSO_DOMAINS='iflabx.com=iflabx-sso' npm run start --workspace @agentifui/gateway
PORT=3127 GATEWAY_INTERNAL_URL=http://127.0.0.1:4127 npm run start --workspace @agentifui/web
```

### Useful targeted verification

```bash
npm run type-check
npx vitest run apps/gateway/src/services/knowledge-chunking.test.ts
npx vitest run apps/gateway/src/services/knowledge-retrieval.test.ts
npx vitest run apps/gateway/src/services/knowledge-service.test.ts
npx vitest run apps/gateway/src/routes/knowledge-persistence.test.ts
npx vitest run apps/gateway/src/routes/admin-sources.test.ts
```

### Browser verification

Prepare Playwright runtime:

```bash
node scripts/prepare-playwright-runtime.mjs
```

Then run:

```bash
LD_LIBRARY_PATH=/home/bistu/zyr/pros/agentifui/.cache/playwright-runtime-libs/usr/lib/x86_64-linux-gnu PLAYWRIGHT_BASE_URL=http://127.0.0.1:3127 npx playwright test tests/e2e/knowledge-flows.spec.ts
```

## Host-Specific Notes

- On this host, large `apply_patch` operations can time out and truncate files.
  - Recovery pattern:
    - `git show HEAD:path/to/file > path/to/file`
- For browser verification, prefer isolated ports instead of the long-running default stack.
- `baseline-browser-mapping` emits an old-data warning during web build/type-check.
  - It is currently informational only.
- When DB scripts fail with `DATABASE_URL is required`, rerun with the explicit env var.

## Next Step

After `P3-A`, the next queue starts at `P3-B-01` for tool invocation contracts and structured actions.
