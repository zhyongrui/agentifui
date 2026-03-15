# Phase 2 Execution Plan

## 1. Goal

Phase 2 starts from the persisted workspace/run boundary completed in Phase 1 and focuses on richer conversation UX, structured execution outputs, human-in-the-loop controls, and production-grade runtime behavior.

This file is the rolling task board for continuous development after Phase 1 feature completion. New work should activate from the current queue here instead of reopening the Phase 1 plan.

## 2. Baseline Carry-Over

The following capabilities are already stable and should be treated as invariants while building Phase 2:

- auth, MFA, SSO pending, invitation activation and better-auth session persistence
- workspace catalog, group-scoped launch, quota, preferences and app visibility controls
- persisted conversations, runs, run timeline, attachments and share links
- platform admin, tenant lifecycle and platform-scoped audit boundaries
- same-origin `/api/gateway/*` proxy, release smoke, metrics and CI baseline

Useful continuity constraints:

- `npm test` and `npm run test:e2e` must run sequentially on the shared Postgres DB
- `packages/db/src/scripts/reset.ts` intentionally reopens a fresh DB connection after schema reset
- browser flows should continue using same-origin `/api/gateway/*`, not direct cross-origin gateway calls

## 3. Workstreams

### P2-A Conversation Quality And Feedback

| 编号  | 任务               | 目标                                             | 完成定义                     |
| ----- | ------------------ | ------------------------------------------------ | ---------------------------- |
| P2-A1 | Assistant 消息反馈 | 用户可对 assistant 回复标记 helpful / needs-work | feedback 持久化 + 浏览器验证 |
| P2-A2 | 消息动作补齐       | copy / retry / quote / regenerate 等常用动作成型 | chat 操作区可用              |
| P2-A3 | Markdown/公式渲染  | assistant 内容支持 markdown 与 LaTeX 基础展示    | 前端渲染测试通过             |
| P2-A4 | 推荐下一问         | assistant 输出可附带 suggested prompts           | shared 合同与 UI 落地        |
| P2-A5 | 会话整理能力       | archive / pin / rename / delete 闭环             | history 与 detail 同步       |
| P2-A6 | 对话搜索增强       | 按 tag、attachment、feedback、status 过滤历史    | `/chat` 检索增强             |

### P2-B Artifacts And Structured Outputs

| 编号  | 任务                    | 目标                          | 完成定义          |
| ----- | ----------------------- | ----------------------------- | ----------------- |
| P2-B1 | Artifact 合同           | 统一 artifact DTO、类型和来源 | shared 合同冻结   |
| P2-B2 | Artifact 持久化         | run 输出与 artifact 记录关联  | DB + service 完成 |
| P2-B3 | Artifact 预览页         | 文本/JSON/表格/链接等基础预览 | web 页面可用      |
| P2-B4 | Artifact 下载与分享边界 | 仅授权用户可访问 artifact     | route + auth 完成 |
| P2-B5 | Artifact 审计           | 生成、查看、下载进入 audit    | admin/audit 可查  |

### P2-C Human-In-The-Loop

| 编号  | 任务                 | 目标                                   | 完成定义                 |
| ----- | -------------------- | -------------------------------------- | ------------------------ |
| P2-C1 | HITL step 合同       | approval / input-request step 统一建模 | shared 合同冻结          |
| P2-C2 | pending-action route | 前端可读取当前待处理动作               | gateway route 完成       |
| P2-C3 | step 响应提交        | 用户可 approve / reject / fill form    | route + persistence 完成 |
| P2-C4 | 对话内 HITL 展示     | chat 页面显示待处理卡片                | 浏览器验证通过           |
| P2-C5 | 审计与超时           | HITL 响应、超时、放弃可追踪            | audit + tests 完成       |

### P2-D Runtime, Citations And Safety

| 编号  | 任务                    | 目标                                             | 完成定义                 |
| ----- | ----------------------- | ------------------------------------------------ | ------------------------ |
| P2-D1 | run failure taxonomy    | 失败原因结构化呈现                               | run detail 丰富化        |
| P2-D2 | 引用结果展示            | assistant 回复可附 citation/source block         | UI + contract 完成       |
| P2-D3 | prompt injection 标记   | run 输出可带安全告警元数据                       | route + UI 完成          |
| P2-D4 | app runtime abstraction | placeholder protocol 向真实 runtime adapter 演进 | gateway adapter 初版可用 |
| P2-D5 | degraded fallback       | runtime 不可用时保留只读/历史能力                | browser 验证通过         |

### P2-E Ops And Multi-Session Scale

| 编号  | 任务                        | 目标                                  | 完成定义      |
| ----- | --------------------------- | ------------------------------------- | ------------- |
| P2-E1 | session/archive cleanup job | 历史会话清理和归档策略明确            | job + doc     |
| P2-E2 | load/perf smoke             | 对关键 auth/chat/admin 路径做轻量压测 | 脚本可运行    |
| P2-E3 | tenant usage analytics      | 平台可看租户 usage 汇总               | admin UI 可用 |
| P2-E4 | backup/export drill         | 关键数据导出与恢复演练文档            | 文档 + smoke  |

## 4. Current Active Queue

Default execution order after Phase 1 closeout:

1. `P2-A6` 对话搜索增强
2. `P2-B3` Artifact 预览页
3. `P2-B4` Artifact 下载与分享边界
4. `P2-B5` Artifact 审计
5. `P2-C1` HITL step 合同
6. `P2-C2` pending-action route
7. `P2-C3` step 响应提交
8. `P2-C4` 对话内 HITL 展示
9. `P2-C5` 审计与超时
10. `P2-D1` run failure taxonomy
11. `P2-D2` 引用结果展示
12. `P2-D3` prompt injection 标记
13. `P2-D4` app runtime abstraction
14. `P2-D5` degraded fallback
15. `P2-E1` session/archive cleanup job
16. `P2-E2` load/perf smoke
17. `P2-E3` tenant usage analytics
18. `P2-E4` backup/export drill

Execution status:

| 状态      | 任务    | 说明                                                                  |
| --------- | ------- | --------------------------------------------------------------------- |
| completed | `P2-A1` | assistant feedback 已持久化，含 audit、route、browser 回归            |
| completed | `P2-A2` | transcript 已补齐 copy / quote / retry / regenerate 基础动作          |
| completed | `P2-A3` | markdown/code/math 渲染已落到 transcript、replay 和 shared transcript |
| completed | `P2-A4` | assistant suggested prompts 已进入 contract、stream 尾块和 chat UI    |
| completed | `P2-A5` | 会话支持 rename / pin / archive / delete，history 与 detail 已同步     |
| completed | `P2-A6` | `/chat` 已支持按 tag / attachment / feedback / status 检索历史        |
| completed | `P2-B1` | artifact DTO、来源和消息/run/chat 绑定已冻结                          |
| completed | `P2-B2` | artifact 已写入独立表，并可通过 workspace route 回读                  |
| completed | `P2-B3` | `/chat/artifacts/[artifactId]` 已上线，消息与 run 入口已接入          |
| completed | `P2-B4` | owner/shared artifact preview + download 路由已补齐，shared transcript 已接入 |
| completed | `P2-B5` | artifact generated / viewed / downloaded 已进入 audit                 |
| completed | `P2-C1` | approval / input-request / response payload 合同已冻结                |
| completed | `P2-C2` | `/workspace/conversations/:conversationId/pending-actions` 已可读     |
| completed | `P2-C3` | `respond` 路由、状态更新和响应持久化已打通                           |
| completed | `P2-C4` | `/chat/[conversationId]` 已显示 pending-action 卡片，提交与刷新都已验证 |
| completed | `P2-C5` | HITL responded/cancelled/expired 已进入 audit，超时与放弃状态可持久化 |
| completed | `P2-D1` | failed run 已带结构化 failure taxonomy，run detail 和 UI 已可读      |
| completed | `P2-D2` | citation/source block 已接到 blocking/streaming、transcript、replay 和 shared transcript |
| completed | `P2-D3` | safety signal 已接到 blocking/streaming、run replay、shared transcript 和 audit |
| completed | `P2-D4` | placeholder protocol 已抽成 formal runtime adapter boundary，runtime metadata/health/browser smoke 已闭环 |
| completed | `P2-D5` | degraded fallback、只读恢复、admin health 和 browser 验证已闭环 |
| completed | `P2-E1` | cleanup policy、dry-run/execute job、admin preview、audit 和 runbook 已闭环 |
| completed | `P2-E2` | perf seed/smoke、JSON artifact、预算门槛和 release gate 已闭环 |
| completed | `P2-E3` | tenant usage analytics、per-app/quota/export、tests 和 browser QA 已闭环 |
| active    | `P2-E4` | 下一项，开始 backup/export drill 和恢复演练 |

## 5. First Batch Definition

### Batch P2-A

This batch should stay focused on the existing conversation transcript model before opening bigger runtime/artifact work:

- `P2-A1` Assistant 消息反馈
- `P2-A2` 消息动作补齐
- `P2-A3` Markdown / 公式渲染
- `P2-A4` 推荐下一问

Completion bar for the batch:

- shared contracts updated
- gateway persistent + in-memory services updated
- web chat page updated
- unit + persistence + browser verification completed
- dev log updated with any new operational gotchas

Current batch status:

- `P2-A1` complete
- `P2-A2` complete
- `P2-A3` complete
- `P2-A4` complete
- `P2-A5` complete
- `P2-A6` complete
- `P2-B1` complete
- `P2-B2` complete
- `P2-B3` complete
- `P2-B4` complete
- `P2-B5` complete
- `P2-C1` complete
- `P2-C2` complete
- `P2-C3` complete
- `P2-C4` complete
- `P2-C5` complete
- `P2-D1` complete
- `P2-D2` complete
- `P2-D3` complete
- `P2-D4` complete
- `P2-E3` complete
- the active follow-on item is `P2-E4`

## 6. Detailed Execution Notes

### P2-A1 Assistant 消息反馈

- backend contract:
  - `WorkspaceConversationMessage.feedback`
  - `PUT /workspace/conversations/:conversationId/messages/:messageId/feedback`
- persistence:
  - feedback 存在 `conversations.inputs.messageHistory`
  - audit action is `workspace.message.feedback.updated`
- browser closeout:
  - feedback uses `Helpful` / `Needs work`
  - the pressed state must survive reload

### P2-A2 消息动作补齐

- current semantics:
  - `Copy`: copies the rendered message body
  - `Quote`: appends quoted content into the composer
  - `Retry`: restores a prior user turn into the composer, including saved attachments
  - `Regenerate`: only supports the latest completed assistant reply and replays the prior user turn
- guardrails:
  - regenerate is intentionally limited to the latest completed assistant reply
  - this avoids branching transcript semantics before artifact/runtime work lands

### P2-A3 Markdown / 公式渲染

- renderer shape:
  - `apps/web/src/components/chat-markdown.tsx` is the shared transcript renderer
  - markdown support uses `react-markdown + remark-gfm + remark-math + rehype-katex`
  - transcript, replay output and shared transcript should all go through this renderer instead of raw `<p>`
- browser-testing guardrail:
  - `Conversation` and `Run history` both reuse `.chat-bubble.user/.assistant`
  - browser tests must scope transcript assertions to the `section.chat-panel` that has heading `Conversation`
  - otherwise `.last()` can accidentally select replay bubbles under `Run history`

### P2-A4 推荐下一问

- current semantics:
  - assistant outputs now expose `suggestedPrompts` on persisted transcript messages
  - blocking chat responses expose `suggested_prompts`
  - the final SSE chunk also exposes `suggested_prompts`, so streaming UIs can bind chips before the conversation refresh lands
- current UI:
  - `/chat/[conversationId]` renders clickable follow-up chips that seed the composer
  - `/chat/shared/[shareId]` renders the same prompts as read-only chips
- browser-testing guardrail:
  - `Policy Watch` still requires switching to `Research Lab` before launch
  - suggestion-chip browser tests should perform the same group switch as the markdown test before opening the app

### P2-A5 会话整理能力

- backend contract:
  - `WorkspaceConversation.pinned`
  - `PUT /workspace/conversations/:conversationId`
  - audit actions `workspace.conversation.updated` and `workspace.conversation.deleted`
- current semantics:
  - `archive` keeps the transcript readable but disables new prompts, regenerate, retry and uploads
  - `pin` only affects ordering on `/chat`; pinned records sort ahead of non-pinned by `updatedAt desc`
  - `delete` is a soft-hide at the workspace boundary
    - the conversation and runs remain persisted
    - normal workspace reads (`conversation`, `history`, `run detail`) filter deleted records out
- browser-testing guardrails:
  - for history-management coverage, seed the conversation directly in Postgres instead of launching through `/workspace/apps/launch`
    - this avoids quota/recent-state coupling when the test only needs a persisted conversation shell
  - do not assert `Send message` becomes enabled immediately after `Restore`
    - the button stays disabled when the composer is empty
    - assert the `Message` textarea and `Attachments` input are enabled instead
  - the history-card heading is mutable after rename
    - avoid locators permanently filtered by the original title once the test renames the conversation

### P2-A6 对话搜索增强

- backend contract:
  - `WorkspaceConversationListResponse.data.filters` now preserves `tag`, `attachment`, `feedback`, and `status`
  - `WorkspaceConversationListItem` now exposes `attachmentCount` and `feedbackSummary`
- current semantics:
  - `tag` filters by app tag, not free-form conversation metadata
  - `attachment=with_attachments` matches any persisted message attachment on the thread
  - `feedback=any|positive|negative` is derived from persisted assistant message feedback state
  - `status` only accepts user-visible history states (`active`, `archived`)
- persistence/read-path guardrail:
  - persistent history now applies `tag`, `attachment`, `feedback`, and text query after the DB read
  - SQL still prefilters by `user_id`, `appId`, `groupId`, and `status`
  - final `limit` is applied after structured filtering so the returned page is dense with matches
- browser-testing guardrails:
  - the `/chat` filter test should seed an `app_policy_watch` conversation when asserting `Tag = policy`
    - tag options come from the catalog app list, not from conversation payloads
  - assert both the filter chip summary (`4 active filters`) and the card metadata (`1 attachments`, `Feedback +1 / -0`)
    - this proves the UI is bound to the enriched list-item payload, not only the URL state

### P2-B1 Artifact 合同

- shared contract:
  - `WorkspaceArtifact` now freezes artifact `kind`, `source`, `status`, summary fields, and payload shapes
  - chat responses, SSE final chunks, workspace messages, and workspace run detail all share the same artifact DTO family
- current semantics:
  - the Phase 2 bootstrap artifact is a draft markdown artifact generated from the assistant response body
  - `source = assistant_response`
  - `status = draft`
  - assistant transcript messages only keep `WorkspaceArtifactSummary[]`
  - run detail and chat gateway responses carry the full artifact payload
- implementation guardrail:
  - artifact payloads still travel inside existing `runs.outputs` and `conversations.inputs.messageHistory`
  - this is intentional for `P2-B1`; `P2-B2` is where dedicated artifact persistence and lookup tables should land
- testing closeout:
  - blocking responses should expose `choices[0].message.artifacts`
  - streaming responses should expose `artifacts` on the final SSE chunk
  - persistence tests should prove artifact summaries survive restart on the conversation view and full artifacts survive restart on the run view

### P2-B2 Artifact 持久化

- schema:
  - `workspace_artifacts` now stores artifact metadata plus a kind-specific `payload` JSON blob
  - rows are keyed by `id` and linked to `tenant_id`, `user_id`, `conversation_id`, and `run_id`
- current service semantics:
  - any run update carrying `outputs.artifacts` fully resyncs the run's artifact rows
  - transcript messages still read summaries from `messageHistory`
  - run detail now prefers `workspace_artifacts` rows and only falls back to `runs.outputs.artifacts` for pre-table data
- current route surface:
  - `GET /workspace/artifacts/:artifactId`
  - ownership is user-scoped at the workspace boundary
- testing closeout:
  - route tests should resolve the artifact id from a completion and round-trip it through `/workspace/artifacts/:artifactId`
  - persistence tests should assert both the `workspace_artifacts` row and the route response after restart

### P2-B3 Artifact 预览页

- current UI surface:
  - `/chat/[conversationId]` now renders artifact summary cards on completed assistant messages
  - selected run replay now renders the same artifact entry cards from `run.artifacts`
  - `/chat/artifacts/[artifactId]` renders the persisted artifact payload with support for `markdown`, `text`, `json`, `table`, and `link`
- current route/client contract:
  - the preview page reads `GET /workspace/artifacts/:artifactId` through `fetchWorkspaceArtifact()`
  - preview deep links carry `conversationId` and optional `runId` as query params so the user can return to the thread context
  - the preview page can now also carry `shareId`
    - `P2-B4` reuses the same preview route for shared/read-only viewers instead of creating a second artifact page
- browser-testing guardrails:
  - the artifact preview browser flow should seed a persisted conversation plus `workspace_artifacts` row directly in Postgres
    - launching through `/workspace/apps/launch` can exhaust quota before the preview assertions even start
    - the helper is `seedWorkspaceArtifactConversation(email, ...)` in `tests/e2e/phase1-flows.spec.ts`
  - `expectAppsWorkspace()` now uses a `60s` URL timeout instead of Playwright's default `5s`
    - on this host, auth redirects can lag behind the successful `/auth/login` response under heavy DB or memory pressure
  - this host's Playwright runs are sensitive to system pressure
    - repeated failures can drift between `browser.newContext()` timeouts and slow post-login redirects on unrelated tests
    - rerun the wrapper before assuming a regression in artifact preview itself

### P2-B4 Artifact 下载与分享边界

- route surface:
  - owner scope now exposes:
    - `GET /workspace/artifacts/:artifactId`
    - `GET /workspace/artifacts/:artifactId/download`
  - shared/read-only scope now exposes:
    - `GET /workspace/shares/:shareId/artifacts/:artifactId`
    - `GET /workspace/shares/:shareId/artifacts/:artifactId/download`
- current semantics:
  - owner routes still require `artifact.user_id = current user`
  - shared routes validate both:
    - an active conversation share
    - membership in the shared group
  - read-only members cannot bypass the share boundary by calling owner artifact routes directly
  - downloads serialize persisted payloads as:
    - `markdown -> .md`
    - `text -> .txt`
    - `json -> .json`
    - `table -> .csv`
    - `link -> .txt`
- current UI:
  - `/chat/shared/[shareId]` now renders artifact cards on shared assistant messages
  - shared artifact cards deep-link into `/chat/artifacts/[artifactId]?shareId=...`
  - the preview page reuses the same renderer and exposes a session-backed `Download artifact` action
- testing closeout:
  - route tests prove owner/shared preview and download routes return the persisted artifact payload
  - persistence coverage proves shared artifact access survives the DB-backed runtime path
  - browser coverage proves a shared transcript can open the artifact preview in read-only mode

### P2-B5 Artifact 审计

- shared auth audit contract:
  - `AuthAuditAction` now includes:
    - `workspace.artifact.generated`
    - `workspace.artifact.viewed`
    - `workspace.artifact.downloaded`
  - `AuthAuditEntityType` now includes `artifact`
- current semantics:
  - chat completion persistence records one `generated` event per persisted artifact
  - artifact preview/download routes record `viewed` and `downloaded`
  - route payloads carry:
    - `accessScope = owner | shared_read_only`
    - `shareId` when the artifact is opened through a conversation share
- admin continuity:
  - `/admin/audit` and export do not need artifact-specific endpoints
  - filter by the new action names instead of adding a dedicated artifact admin surface

### P2-C1 / P2-C2 / P2-C3 HITL 合同、读取与响应边界

- backend contract:
  - `WorkspaceHitlStep` now models both `approval` and `input_request`
  - `WorkspaceHitlStep.response` stores:
    - `action`
    - `respondedAt`
    - `actorUserId`
    - `actorDisplayName`
    - optional `note`
    - optional submitted `values`
  - route surface now includes:
    - `GET /workspace/conversations/:conversationId/pending-actions`
    - `POST /workspace/conversations/:conversationId/pending-actions/:stepId/respond`
- current semantics:
  - `pending-actions` reads from the latest run on the conversation
  - the route intentionally returns the full current HITL state for that run, including already-responded items
  - approval steps accept `approve` / `reject`
  - input-request steps accept `submit`
  - required field validation and select-option validation happen before persistence
  - replaying a non-pending step returns `WORKSPACE_ACTION_CONFLICT`
- persistence/read-path guardrails:
  - HITL state currently lives in `runs.outputs.pendingActions`
  - `messageHistory` is still not the source of truth for HITL cards
    - the conversation UI work belongs to `P2-C4`
  - the `runs` table does not have `updated_at`
    - only `conversations.updated_at` should be bumped when persisting a HITL response
- testing closeout:
  - route tests now prove:
    - approval placeholder steps can be read and approved
    - duplicate approval attempts conflict
    - input-request placeholder steps surface on the chat completion contract
  - persistence tests now prove:
    - pending actions survive app restart
    - submitted HITL responses survive app restart
    - persisted run outputs retain the response payload
- future-session continuity:
  - `app_tenant_control` is the deterministic placeholder app for HITL route/persistence coverage
  - on this host, very large `apply_patch` operations against `workspace.ts` and `/chat/[conversationId]/page.tsx` can time out and truncate the file
    - if that happens, restore from `git show HEAD:...` before reapplying smaller patches
  - `npm run type-check` is a good immediate sanity check after any restore on this host because the truncated-file failure mode is syntactically obvious

### P2-C4 对话内 HITL 展示

- web surface:
  - `/chat/[conversationId]` now renders pending-action cards above the transcript
  - `approval` steps expose approve/reject buttons
  - `input_request` steps expose field-bound drafts, submit actions, and persisted response summaries
- current semantics:
  - the chat page reads `GET /workspace/conversations/:conversationId/pending-actions` on initial load
  - successful responses update both the pending-action card state and the selected-run replay snapshot in place
  - refresh must preserve the submitted/approved state through the persisted run boundary
- browser/persistence guardrails:
  - raw `postgres` template usage must pass objects directly as `::jsonb`
    - `JSON.stringify(... )::jsonb` writes a JSON string scalar, not a JSON object
    - this broke the initial Playwright seed helpers until they were switched to `${object}::jsonb`
  - if a raw Playwright rerun is using `next start` / `node dist/main.js`, rebuild and restart the local stack after source changes
    - otherwise new workspace routes can appear to be missing because the browser is hitting stale dist output
  - `workspace_quota_limits` seed ids must remain tenant-scoped
    - group ids such as `grp_product` are reused across tenants
    - non-tenant-scoped ids cause cross-tenant `workspace/apps` reads to fail with primary-key collisions

### P2-C5 审计与超时

- backend/audit surface:
  - `POST /workspace/conversations/:conversationId/pending-actions/:stepId/respond` now accepts `cancel`
  - audit actions now include:
    - `workspace.pending_action.responded`
    - `workspace.pending_action.cancelled`
    - `workspace.pending_action.expired`
  - audit entity type now includes `pending_action`
- timeout semantics:
  - pending steps are expired on the workspace read boundary when `expiresAt <= now`
  - the expired status is written back into `runs.outputs.pendingActions`
  - `conversations.updated_at` is bumped so the timeout is visible after refresh/restart
- implementation guardrails:
  - do not add a second HITL mutation route for abandon
    - `cancel` deliberately reuses the existing `respond` route so audit, auth, and client wiring stay single-path
  - persistent HITL writes must tolerate older JSONB rows that were accidentally stored as JSON strings
    - the current DB mutation path normalizes `outputs` when `jsonb_typeof(outputs) = 'string'`
    - this avoids `jsonb_set(...): cannot set path in scalar` on older local test data
  - expired-item audit should only fire once per step
    - expire on read, persist immediately, and later reads will no longer return that step in `expiredItems`

### P2-D1 Run Failure Taxonomy

- shared/runtime contract:
  - `WorkspaceRun.failure` now exposes a structured payload instead of only the legacy `error` string
  - the current taxonomy includes:
    - `code`
    - `stage`
    - `message`
    - `retryable`
    - `detail`
    - `recordedAt`
- current coverage:
  - the first concrete structured failure path is the persisted stream fallback:
    - `code = stream_interrupted`
    - `stage = streaming`
  - older rows that only have `runs.error` still surface a fallback failure object:
    - `code = unknown`
    - `stage = execution`
- UI/runtime guardrails:
  - `/chat/[conversationId]` run detail now surfaces a dedicated failure card when `selectedRun.failure` exists
  - keep writing the legacy `runs.error` string for backward compatibility
    - admin/export/read paths still rely on it in some places
  - failure taxonomy currently describes persisted run failures only
    - pre-run gateway validation errors (`invalid_messages`, `app_not_authorized`, etc.) still belong to the chat error response path, not workspace run detail

### P2-D2 Citation And Source Blocks

- shared/runtime contract:
  - `WorkspaceConversationMessage.citations` now carries persisted transcript-level citation summaries
  - `WorkspaceRun.citations` and `WorkspaceRun.sourceBlocks` now expose replayable source metadata
  - blocking chat responses now expose `message.citations` and `message.source_blocks`
  - terminal SSE chunks now expose `citations` and `source_blocks`
- current semantics:
  - the placeholder runtime now emits:
    - one `workspace_context` source block for group/trace context
    - one `app_reference` source block for the current app summary
    - one `attachment` source block per uploaded file on the latest user turn
  - transcript messages only persist citations
    - full source block payloads live on `runs.outputs.sourceBlocks`
  - citation chips can already open links when `href` is present
    - current placeholder payloads are internal-only and keep `href = null`
- browser/host continuity:
  - `npm run test:e2e` does not forward extra CLI args on this host
    - `scripts/run-e2e.mjs` always executes `npx playwright test` without passing through `--grep`
    - use raw Playwright for targeted browser verification when you only need one scenario
  - for raw Playwright on this host:
    - first run `node scripts/prepare-playwright-runtime.mjs`
    - then export `LD_LIBRARY_PATH` with the printed runtime-lib path
    - then run `PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port> npx playwright test ... --grep ...`
  - if `3111/4111` are already occupied, start an isolated test stack on alternate ports
    - this round used gateway `4000` and web `3116`
  - the run replay panel now renders the same source title twice:
    - once in the citation chip list
    - once in the source block card title
    - Playwright locators must use exact text or scoped containers to avoid strict-mode collisions

### Operational Continuity

- browser tests that assert root-admin navigation should wait for `/api/gateway/admin/context`
  - the `Tenants` nav item is capability-driven and arrives asynchronously
- the new workspace feedback audit types extend shared auth unions
  - `AuthAuditAction` now includes `workspace.message.feedback.updated`
  - `AuthAuditEntityType` now includes `conversation_message`
- the persistence stage in `npm test` can stay silent for about two minutes
  - `apps/gateway/src/routes/auth-persistence.test.ts` is long-running and may look hung while still progressing
- shared DB load can occasionally push auth responses past one minute in Playwright
  - `tests/e2e/phase1-flows.spec.ts` now uses a `120_000ms` response wait window for `/api/gateway/*` POST/PUT helpers
- use `npm run test:e2e` instead of raw `npx playwright test` on this host
  - the wrapper brings the project up in the expected environment
  - direct Playwright launches can fail on this machine with missing browser runtime libs such as `libatk-1.0.so.0`
- if persistence or targeted vitest runs seem hung with no output
  - check for orphaned `node (vitest*)` workers with `pgrep -af vitest`
  - stale workers can survive interrupted sessions on this host and block later persistence reruns until they are killed
- if you need more visibility than the silent `npm test` wrapper gives during persistence
  - run `npm run test:unit` and `npm run test:persistence` sequentially
  - do not overlap persistence and Playwright on the shared Postgres DB
- do not add a dedicated artifact DB table during `P2-B1`
  - the contract is now frozen, but storage normalization belongs to `P2-B2`
  - until then, artifact summaries come from `messageHistory` and full payloads come from `runs.outputs`
- `P2-B2` now owns the dedicated artifact table
  - keep `runs.outputs.artifacts` populated for backward compatibility and graceful fallback
  - the new table is the preferred source for route reads and future preview/download flows

## 7. Detailed Long-Range Checkbox Board

Use this section as the canonical long-range execution board. Every line item should stay as a checkbox so future sessions can continue from the same backlog without reconstructing context from chat history.

Legend:

- `[x]` completed
- `[ ]` not started or still open

### 7.1 Completed Baseline Checklist

- [x] `P2-A1` Persist assistant feedback and expose `Helpful / Needs work`
- [x] `P2-A1` Record feedback updates in audit and survive reload/restart
- [x] `P2-A2` Add transcript message actions for copy / quote / retry / regenerate
- [x] `P2-A2` Limit regenerate to the latest completed assistant reply
- [x] `P2-A3` Introduce shared markdown renderer for transcript, replay, and shared transcript
- [x] `P2-A3` Support fenced code, tables, inline math, and block math rendering
- [x] `P2-A4` Add suggested prompt payloads to blocking and streaming chat responses
- [x] `P2-A4` Render follow-up prompt chips in chat and shared transcript
- [x] `P2-A5` Support rename / pin / archive / restore / delete for conversations
- [x] `P2-A5` Keep archived conversations readable while disabling write actions
- [x] `P2-A6` Add structured `/chat` filters for tag / attachment / feedback / status
- [x] `P2-A6` Enrich history list items with attachment count and feedback summary
- [x] `P2-B1` Freeze the shared artifact DTO family across chat/run/workspace surfaces
- [x] `P2-B1` Emit draft artifacts from assistant completions in blocking and streaming paths
- [x] `P2-B2` Persist artifacts in `workspace_artifacts` and keep JSON fallback compatibility
- [x] `P2-B2` Add owner-scoped `GET /workspace/artifacts/:artifactId`
- [x] `P2-B3` Add artifact cards to transcript and run replay surfaces
- [x] `P2-B3` Ship `/chat/artifacts/[artifactId]` with markdown/text/json/table/link preview
- [x] `P2-B4` Add owner/shared preview + download routes for artifacts
- [x] `P2-B4` Reuse artifact preview route for shared read-only viewers
- [x] `P2-B5` Record artifact generated / viewed / downloaded audit events
- [x] `P2-C1` Freeze HITL step contract for approval and input-request flows
- [x] `P2-C2` Add `GET /workspace/conversations/:conversationId/pending-actions`
- [x] `P2-C3` Add `respond` route with approval, reject, submit, and validation handling
- [x] `P2-C3` Persist HITL responses into the run boundary across restarts
- [x] `P2-C4` Render pending-action cards in `/chat/[conversationId]`
- [x] `P2-C4` Keep pending-action and selected-run detail in sync after response submission
- [x] `P2-C5` Add cancel / expired state handling and audit coverage for HITL lifecycle
- [x] `P2-C5` Expire pending actions on read and persist the new state immediately
- [x] `P2-D1` Add structured failure taxonomy on persisted runs
- [x] `P2-D1` Show failure stage / code / retryable / detail on conversation run detail

### 7.2 Completed Delivery Queue: `P2-D2` Citation And Source Blocks

- [x] `P2-D2-01` Define `WorkspaceCitation`, `WorkspaceSourceBlock`, and related shared DTOs
- [x] `P2-D2-02` Extend blocking chat responses to include citations and grouped source blocks
- [x] `P2-D2-03` Extend terminal SSE chunks to expose citations for streaming UIs
- [x] `P2-D2-04` Persist citation summaries on assistant transcript messages
- [x] `P2-D2-05` Persist full source blocks on run outputs for replay fidelity
- [x] `P2-D2-06` Backfill in-memory workspace service so tests and local fallback match persistence semantics
- [x] `P2-D2-07` Render inline citation chips in the conversation transcript
- [x] `P2-D2-08` Render expandable source cards in selected run replay
- [x] `P2-D2-09` Render read-only citations on shared transcript pages
- [x] `P2-D2-10` Add copy/open affordances for sources where the payload includes URLs
- [x] `P2-D2-11` Cover citation persistence across restart in route and persistence tests
- [x] `P2-D2-12` Add browser coverage for citation rendering, refresh, and shared transcript replay
- [x] `P2-D2-13` Record any browser-selector gotchas in the dev log after landing the feature

### 7.3 Safety Queue: `P2-D3` Prompt Injection And Safety Signals

- [x] `P2-D3-01` Define a shared `WorkspaceSafetySignal` contract with severity, category, and summary
- [x] `P2-D3-02` Introduce run-level `safety` metadata on chat responses and persisted runs
- [x] `P2-D3-03` Distinguish prompt-injection, data-exfiltration, and policy-violation categories
- [x] `P2-D3-04` Add adapter hooks so a runtime can attach safety findings without breaking current placeholder responses
- [x] `P2-D3-05` Persist safety findings into run outputs and selected conversation snapshots
- [x] `P2-D3-06` Render a warning banner on the conversation page when the latest run is flagged
- [x] `P2-D3-07` Render a structured safety panel in run replay with severity and recommended action
- [x] `P2-D3-08` Add read-only safety signals to shared transcripts without exposing privileged internal detail
- [x] `P2-D3-09` Add audit events for severe blocked or flagged runs
- [x] `P2-D3-10` Add admin audit filtering for safety-related actions
- [x] `P2-D3-11` Add unit coverage for safety contract parsing and fallback behavior on older rows
- [x] `P2-D3-12` Add persistence coverage proving safety metadata survives restart and replay
- [x] `P2-D3-13` Add browser verification for flagged-run banners and replay panels
- [x] `P2-D3-14` Document how safety metadata should be masked in exports and public QA captures

### 7.4 Runtime Queue: `P2-D4` App Runtime Abstraction

- [x] `P2-D4-01` Extract a formal runtime adapter interface from the current placeholder protocol path
- [x] `P2-D4-02` Keep the existing placeholder adapter as the default compatibility backend
- [x] `P2-D4-03` Define adapter capabilities for streaming, citations, artifacts, safety, and HITL emission
- [x] `P2-D4-04` Normalize blocking and streaming completion entrypoints through the same adapter boundary
- [x] `P2-D4-05` Thread `conversationId`, `runId`, and `traceId` through every adapter invocation
- [x] `P2-D4-06` Normalize adapter failure shapes into the structured run failure taxonomy
- [x] `P2-D4-07` Add app-level runtime selection config so different apps can choose different adapters
- [x] `P2-D4-08` Add runtime health/readiness probes surfaced to the gateway service layer
- [x] `P2-D4-09` Add adapter test doubles for unit and route coverage
- [x] `P2-D4-10` Add persistence coverage proving runtime-specific metadata survives restarts
- [x] `P2-D4-11` Add browser smoke coverage that exercises the non-placeholder adapter path once available
- [x] `P2-D4-12` Write a developer guide for adding a new runtime adapter safely

### 7.5 Resilience Queue: `P2-D5` Degraded Fallback

- [x] `P2-D5-01` Detect runtime-unavailable states at the gateway boundary
- [x] `P2-D5-02` Keep conversation history, run replay, and artifact preview readable in degraded mode
- [x] `P2-D5-03` Disable send/regenerate/upload controls while degraded mode is active
- [x] `P2-D5-04` Show a clear degraded banner with recovery guidance on `/chat` and `/chat/[conversationId]`
- [x] `P2-D5-05` Preserve pending HITL cards as read-only while runtime execution is unavailable
- [x] `P2-D5-06` Expose degraded status to admin health surfaces
- [x] `P2-D5-07` Add route coverage for degraded reads vs blocked writes
- [x] `P2-D5-08` Add persistence coverage for degraded-mode recovery after restart
- [x] `P2-D5-09` Add browser verification covering banner display and disabled composer behavior
- [x] `P2-D5-10` Document degraded-mode QA expectations and recovery procedures

### 7.6 Operations Queue: `P2-E1` Session And Archive Cleanup

- [x] `P2-E1-01` Define retention policy for archived conversations, runs, shares, and artifacts
- [x] `P2-E1-02` Add a scheduled cleanup job entrypoint under the DB/scripts or gateway worker surface
- [x] `P2-E1-03` Add dry-run reporting for cleanup candidates before destructive actions
- [x] `P2-E1-04` Prune expired share links and record cleanup audit entries
- [x] `P2-E1-05` Prune orphaned artifacts whose parent run/conversation is no longer accessible
- [x] `P2-E1-06` Collapse or archive cold run timeline rows beyond the active replay window
- [x] `P2-E1-07` Add admin visibility into upcoming cleanup counts and last cleanup execution
- [x] `P2-E1-08` Add unit coverage for cleanup selection logic and retention windows
- [x] `P2-E1-09` Add persistence coverage for cleanup effects across archived conversation history
- [x] `P2-E1-10` Write an operations runbook for cleanup scheduling, dry runs, and rollback expectations

### 7.7 Operations Queue: `P2-E2` Load And Performance Smoke

- [x] `P2-E2-01` Define representative load scenarios for auth, workspace launch, chat, admin, and share reads
- [x] `P2-E2-02` Add deterministic seed scripts for performance test data
- [x] `P2-E2-03` Add a CLI or `npm` entrypoint for lightweight load smoke execution
- [x] `P2-E2-04` Capture p50/p95 latency and basic failure-rate budgets for the main endpoints
- [x] `P2-E2-05` Measure chat completion latency with and without persisted artifacts
- [x] `P2-E2-06` Measure history and replay latency on long conversations
- [x] `P2-E2-07` Measure admin audit export performance on realistic event volume
- [x] `P2-E2-08` Add perf summary artifact output so CI or manual runs can retain results
- [x] `P2-E2-09` Fix the slowest clear regression found by the first smoke run
- [x] `P2-E2-10` Document host-specific caveats for shared Postgres and local browser runtime limits
- [x] `P2-E2-11` Add a lightweight regression gate to release or pre-release verification docs

### 7.8 Operations Queue: `P2-E3` Tenant Usage Analytics

- [x] `P2-E3-01` Define tenant usage metrics for launches, runs, messages, artifacts, and storage footprint
- [x] `P2-E3-02` Add persistent aggregation queries or materialized read models for analytics
- [x] `P2-E3-03` Expose tenant usage summary routes on the admin boundary
- [x] `P2-E3-04` Render tenant usage cards and trend summaries on admin pages
- [x] `P2-E3-05` Add per-app usage breakdown within each tenant
- [x] `P2-E3-06` Add quota-vs-actual comparisons so overuse is visible in admin surfaces
- [x] `P2-E3-07` Add export support for tenant usage summaries
- [x] `P2-E3-08` Add tests for aggregation correctness across multiple tenants and groups
- [x] `P2-E3-09` Add browser coverage for admin analytics filters and table rendering
- [x] `P2-E3-10` Document data freshness, aggregation cadence, and known caveats

### 7.9 Operations Queue: `P2-E4` Backup And Export Drill

- [ ] `P2-E4-01` Define the minimum backup set for auth, workspace, artifacts, shares, and admin audit data
- [ ] `P2-E4-02` Add an export script or documented command set for the critical data surfaces
- [ ] `P2-E4-03` Add import/restore drill steps for a clean local environment
- [ ] `P2-E4-04` Verify that restored conversations preserve run replay and artifact links
- [ ] `P2-E4-05` Verify that restored audit rows remain queryable through admin surfaces
- [ ] `P2-E4-06` Verify that restored quota and usage data remain consistent
- [ ] `P2-E4-07` Add a documented checksum or sanity-check step after export and restore
- [ ] `P2-E4-08` Record public-access/browser QA implications for restored preview links
- [ ] `P2-E4-09` Add a smoke checklist for periodic backup/restore rehearsals
- [ ] `P2-E4-10` Publish a concise disaster-recovery runbook for future sessions

### 7.10 Future Delivery Queue: `P3-A` Retrieval, Search, And Knowledge Context

- [ ] `P3-A-01` Define a document/source ingestion contract at the shared boundary
- [ ] `P3-A-02` Add ingestion status tracking for queued, processing, succeeded, and failed states
- [ ] `P3-A-03` Choose and implement a chunking strategy for text-heavy sources
- [ ] `P3-A-04` Add metadata normalization for title, URL, owner, labels, and updated timestamp
- [ ] `P3-A-05` Add a retrieval query abstraction usable by runtime adapters
- [ ] `P3-A-06` Connect retrieval results to the citation/source block model
- [ ] `P3-A-07` Add admin visibility into indexing progress and failure reasons
- [ ] `P3-A-08` Add tenant/group access controls for indexed knowledge sources
- [ ] `P3-A-09` Add unit and persistence coverage for ingestion state transitions
- [ ] `P3-A-10` Add browser coverage for source management and retrieval-backed chat results
- [ ] `P3-A-11` Add retention/cleanup rules for stale indexed documents
- [ ] `P3-A-12` Document the ingestion pipeline and local development setup

### 7.11 Future Delivery Queue: `P3-B` Tool Invocation And Structured Actions

- [ ] `P3-B-01` Define a shared tool descriptor contract including auth scope and input schema
- [ ] `P3-B-02` Build a registry surface for enabled tools per app and tenant
- [ ] `P3-B-03` Add runtime support for tool call requests and tool result messages
- [ ] `P3-B-04` Persist tool call attempts, results, and latency into the run boundary
- [ ] `P3-B-05` Add approval-required tool execution paths that reuse HITL contracts where needed
- [ ] `P3-B-06` Add audit coverage for tool execution and operator approval decisions
- [ ] `P3-B-07` Add timeout, retry, and idempotency handling for tool calls
- [ ] `P3-B-08` Add tool policy controls on admin surfaces
- [ ] `P3-B-09` Render tool-call summaries in transcript and replay panels
- [ ] `P3-B-10` Add failure taxonomy extensions for tool-stage errors
- [ ] `P3-B-11` Add tests for successful, failed, cancelled, and approval-gated tool runs
- [ ] `P3-B-12` Document how to add a new tool safely and how to test it end to end

### 7.12 Future Delivery Queue: `P3-C` Collaboration, Presence, And Shared Work

- [ ] `P3-C-01` Define a presence/session model for multiple viewers on the same conversation
- [ ] `P3-C-02` Add live refresh or polling for new messages and run status changes
- [ ] `P3-C-03` Add collaborator identity chips or cursors on shared conversation surfaces
- [ ] `P3-C-04` Add comment or note threads attached to runs, artifacts, or messages
- [ ] `P3-C-05` Add mention/notification primitives for shared work review
- [ ] `P3-C-06` Add fine-grained permission modes for commenter vs editor vs owner
- [ ] `P3-C-07` Add conflict handling for concurrent conversation metadata edits
- [ ] `P3-C-08` Add audit coverage for collaborative edits and comment actions
- [ ] `P3-C-09` Add browser coverage for multi-user collaboration behavior
- [ ] `P3-C-10` Document collaboration semantics, consistency model, and known limits

### 7.13 Future Delivery Queue: `P3-D` Evaluation, Replay QA, And Release Quality

- [ ] `P3-D-01` Define golden transcript fixtures for core apps and core workflows
- [ ] `P3-D-02` Build a replay harness that can re-run deterministic placeholder/runtime sessions
- [ ] `P3-D-03` Add snapshot comparison for transcript body, artifacts, citations, and safety signals
- [ ] `P3-D-04` Version prompt/runtime config used by each replayable run
- [ ] `P3-D-05` Add a model/runtime comparison report surface for release candidates
- [ ] `P3-D-06` Add release gates for critical regressions in auth/chat/admin smoke paths
- [ ] `P3-D-07` Add incident replay tooling for failed production-like traces
- [ ] `P3-D-08` Add developer commands to run focused evals for a single app or workstream
- [ ] `P3-D-09` Add CI integration for a minimal regression pack
- [ ] `P3-D-10` Document how eval outputs should be stored, reviewed, and promoted

### 7.14 Future Delivery Queue: `P3-E` Governance, Enterprise Controls, And Identity

- [ ] `P3-E-01` Add domain-claim review workflow for enterprise SSO detection and activation
- [ ] `P3-E-02` Add admin review queues for pending SSO and tenant-access requests
- [ ] `P3-E-03` Add richer MFA administration and recovery controls
- [ ] `P3-E-04` Add break-glass session review and emergency access audit drill
- [ ] `P3-E-05` Add SCIM or bulk provisioning planning hooks even if implementation lands later
- [ ] `P3-E-06` Add legal-hold or retention override controls for selected tenants
- [ ] `P3-E-07` Add audit export filtering by tenant, actor, entity, severity, and date range presets
- [ ] `P3-E-08` Add policy-pack surfaces for runtime, sharing, and artifact download constraints
- [ ] `P3-E-09` Add tests for identity edge cases across SSO, MFA, pending review, and tenant transfer
- [ ] `P3-E-10` Document enterprise onboarding, approval flow, and emergency recovery procedures

### 7.15 Future Delivery Queue: `P3-F` Deployment, Ingress, And Operational Hardening

- [ ] `P3-F-01` Replace ad hoc public QA access with a documented stable `80/443` reverse-proxy setup
- [ ] `P3-F-02` Keep the temporary `cloudflared` public-access workflow documented for emergency browser QA
- [ ] `P3-F-03` Add production-grade `nginx` or equivalent config for same-origin web + gateway routing
- [ ] `P3-F-04` Add HTTPS/TLS issuance and renewal runbooks for the chosen public domain entrypoint
- [ ] `P3-F-05` Add systemd/service supervision or container orchestration baselines for web and gateway
- [ ] `P3-F-06` Add secrets management and rotation procedures for auth, DB, and runtime credentials
- [ ] `P3-F-07` Add structured metrics dashboards for auth, chat, admin, and cleanup jobs
- [ ] `P3-F-08` Add alerting thresholds for gateway errors, degraded mode, and queue backlogs
- [ ] `P3-F-09` Add deployment smoke scripts that verify auth, workspace launch, chat, and admin health
- [ ] `P3-F-10` Add migration rollback and forward-only safety guidelines
- [ ] `P3-F-11` Add blue/green or canary deployment strategy notes for public releases
- [ ] `P3-F-12` Document host-specific browser runtime and Playwright caveats for this server class

### 7.16 Future Delivery Queue: `P3-G` UX Polish, Accessibility, And Device Coverage

- [ ] `P3-G-01` Audit chat, admin, and auth surfaces for keyboard accessibility gaps
- [ ] `P3-G-02` Add screen-reader labels and semantics for transcript actions, artifacts, and HITL cards
- [ ] `P3-G-03` Improve mobile/tablet layout for `/chat`, `/chat/[conversationId]`, and admin tables
- [ ] `P3-G-04` Add loading/skeleton states for artifact preview, run replay, and admin analytics
- [ ] `P3-G-05` Add empty-state guidance for first-run conversations, no-artifact runs, and no-audit tenants
- [ ] `P3-G-06` Improve long-message rendering, wrapping, and code/table overflow behavior
- [ ] `P3-G-07` Add upload progress and cancellation UX once richer file workflows exist
- [ ] `P3-G-08` Add localization planning hooks for Chinese/English UI copy
- [ ] `P3-G-09` Add browser/device coverage for narrow viewports and tablet landscape layouts
- [ ] `P3-G-10` Document UX conventions so future sessions preserve visual and behavioral consistency

### 7.17 Future Delivery Queue: `P3-H` Data Lifecycle, Migrations, And Disaster Recovery

- [ ] `P3-H-01` Audit every persisted JSON field for long-term normalization candidates
- [ ] `P3-H-02` Add migration design notes for high-risk large-table changes
- [ ] `P3-H-03` Add fixture/seed versioning so browser and persistence tests can evolve safely
- [ ] `P3-H-04` Add explicit downgrade/rollback expectations for non-reversible migrations
- [ ] `P3-H-05` Add data integrity checks for cross-table links between conversations, runs, artifacts, and audits
- [ ] `P3-H-06` Add periodic verification that share links and artifact routes still resolve after backup restore
- [ ] `P3-H-07` Add storage-growth reporting for conversation history, artifacts, and audit payloads
- [ ] `P3-H-08` Add a formal recovery checklist for corrupted JSON rows or partially applied migrations
- [ ] `P3-H-09` Add tests or scripted drills for replaying production-like data into a staging environment
- [ ] `P3-H-10` Document what operational context must always be copied into the dev log for new sessions

### 7.18 Future Platform Queue: `P4-A` Multi-Provider Runtime And Model Routing

- [ ] `P4-A-01` Define provider-agnostic request and response envelopes for chat, tools, files, and safety
- [ ] `P4-A-02` Add provider capability discovery so adapters can advertise supported features at startup
- [ ] `P4-A-03` Add provider selection policy per app, tenant, and request type
- [ ] `P4-A-04` Add weighted fallback routing when the primary provider is degraded or unavailable
- [ ] `P4-A-05` Persist provider metadata on each run for replay, analytics, and incident review
- [ ] `P4-A-06` Add pricing metadata per provider/model for cost analysis and quota policy work
- [ ] `P4-A-07` Add provider-specific retry backoff and idempotency strategies
- [ ] `P4-A-08` Add provider circuit-breaker state and expose it through health/admin views
- [ ] `P4-A-09` Add route coverage proving the same conversation can replay runs from mixed providers
- [ ] `P4-A-10` Add persistence coverage for provider metadata, retry state, and fallback outcomes
- [ ] `P4-A-11` Add browser smoke coverage for provider-switched runs in the same transcript
- [ ] `P4-A-12` Document how to onboard, benchmark, and safely disable a provider

### 7.19 Future Platform Queue: `P4-B` Connectors, Sync, And External Knowledge Sources

- [ ] `P4-B-01` Define a connector contract for source auth, sync cadence, and incremental checkpoints
- [ ] `P4-B-02` Add connector records for web, Google Drive, Notion, Confluence, and generic file-drop inputs
- [ ] `P4-B-03` Add OAuth or token storage abstractions for connector credentials
- [ ] `P4-B-04` Add sync-job tables for queued, running, succeeded, partially failed, and cancelled states
- [ ] `P4-B-05` Add per-document sync provenance linking runs, artifacts, and retrieval hits back to source records
- [ ] `P4-B-06` Add incremental re-sync support based on updated timestamp or cursor checkpoints
- [ ] `P4-B-07` Add connector health surfaces and failure summaries to admin views
- [ ] `P4-B-08` Add user-facing source status surfaces for stale, revoked, or paused connectors
- [ ] `P4-B-09` Add audit coverage for connector create, rotate, revoke, pause, and delete actions
- [ ] `P4-B-10` Add tests for sync resume, revoked auth, duplicate documents, and partial failure recovery
- [ ] `P4-B-11` Add browser coverage for connector setup, first sync, and stale-source warnings
- [ ] `P4-B-12` Document local dev setup for connector mocks and safe credential handling

### 7.20 Future Platform Queue: `P4-C` Agent Planning, Branching, And Workflow Memory

- [ ] `P4-C-01` Define a plan-step contract for runtime-generated task plans inside a run
- [ ] `P4-C-02` Add branchable run state so an operator can fork a conversation from an earlier run
- [ ] `P4-C-03` Add plan progress tracking with pending, in-progress, blocked, and completed states
- [ ] `P4-C-04` Persist intermediate agent thoughts or summaries in a redacted/internal-only channel
- [ ] `P4-C-05` Add step-level artifacts and citations so each plan step can emit its own outputs
- [ ] `P4-C-06` Add resumable workflow state for long-running tasks spanning multiple sessions
- [ ] `P4-C-07` Add operator controls to pause, resume, skip, or restart individual plan steps
- [ ] `P4-C-08` Add run replay views for branch lineage, parent-child runs, and resumed workflow state
- [ ] `P4-C-09` Add audit coverage for branch creation, step override, and workflow resumption
- [ ] `P4-C-10` Add tests for branch correctness, plan mutation safety, and resumed execution after restart
- [ ] `P4-C-11` Add browser coverage for branch navigation and workflow step control surfaces
- [ ] `P4-C-12` Document plan-state retention rules and which internal fields stay hidden from shared views

### 7.21 Future Platform Queue: `P4-D` Workflow Builder And Operator Authoring

- [ ] `P4-D-01` Define a stored workflow definition format with nodes, edges, variables, and approvals
- [ ] `P4-D-02` Add workflow versioning with draft, published, archived, and rolled-back states
- [ ] `P4-D-03` Add node types for prompt, retrieval, tool call, approval, transform, and export
- [ ] `P4-D-04` Add schema validation for workflow definitions before publish
- [ ] `P4-D-05` Add dry-run validation mode that executes a workflow against fixtures without persisting a real run
- [ ] `P4-D-06` Add workflow-level permissions for author, reviewer, publisher, and runner roles
- [ ] `P4-D-07` Add import/export for workflow definitions across environments
- [ ] `P4-D-08` Add tests for workflow migration between definition versions
- [ ] `P4-D-09` Add browser authoring UX for node editing, edge linking, validation, and publish
- [ ] `P4-D-10` Add replay support showing which workflow version generated a given run
- [ ] `P4-D-11` Add audit coverage for workflow publish, rollback, and permission changes
- [ ] `P4-D-12` Document workflow-authoring conventions and safe rollout steps

### 7.22 Future Platform Queue: `P4-E` Cost Control, Billing, And Commercial Boundaries

- [ ] `P4-E-01` Define billable usage records for launch, completion, retrieval, storage, and export actions
- [ ] `P4-E-02` Add tenant billing plans with feature flags, quotas, soft limits, and hard-stop behavior
- [ ] `P4-E-03` Add metering reconciliation jobs that compare provider-side usage with local run records
- [ ] `P4-E-04` Add invoice/export-ready cost summaries by tenant, app, group, and provider
- [ ] `P4-E-05` Add admin override controls for grace periods, credit grants, and temporary limit raises
- [ ] `P4-E-06` Add end-user warning banners for approaching cost thresholds
- [ ] `P4-E-07` Add audit coverage for billing-plan changes, overrides, and meter adjustments
- [ ] `P4-E-08` Add tests for overage behavior, grace windows, and corrected billing entries
- [ ] `P4-E-09` Add browser coverage for quota/cost warning states and admin override flows
- [ ] `P4-E-10` Add retention and masking rules for billing payloads that contain user or run references
- [ ] `P4-E-11` Add data export surfaces for finance/ops review without leaking raw prompts
- [ ] `P4-E-12` Document the pricing model, reconciliation workflow, and incident playbook for bad metering

### 7.23 Future Platform Queue: `P4-F` Enterprise Security, Compliance, And Policy Packs

- [ ] `P4-F-01` Define tenant-scoped policy packs for runtime, retrieval, sharing, export, and retention controls
- [ ] `P4-F-02` Add per-policy evaluation traces so operators can see why a request was blocked or flagged
- [ ] `P4-F-03` Add DLP-style detectors for secrets, PII, regulated terms, and exfiltration patterns
- [ ] `P4-F-04` Add allowlist and exception workflows with review history and expiry timestamps
- [ ] `P4-F-05` Add admin policy simulation mode to test a policy against historical runs before rollout
- [ ] `P4-F-06` Add evidence export bundles for audit/compliance review
- [ ] `P4-F-07` Add legal-hold interaction rules for conversation deletion, artifact pruning, and backup restore
- [ ] `P4-F-08` Add tests for policy precedence across tenant, group, app, and runtime scopes
- [ ] `P4-F-09` Add browser coverage for blocked-run explanation surfaces and policy simulation summaries
- [ ] `P4-F-10` Add admin filters for safety/policy audit events, including severity and detector type
- [ ] `P4-F-11` Add masking standards for screenshots, shared links, and export payloads
- [ ] `P4-F-12` Document compliance operating procedures and exception-review governance

### 7.24 Future Platform Queue: `P4-G` Observability, Incident Response, And SLO Management

- [ ] `P4-G-01` Define service-level indicators for auth latency, launch latency, chat latency, and run completion success
- [ ] `P4-G-02` Add request tracing that links web requests, gateway work, provider calls, and DB writes
- [ ] `P4-G-03` Add structured logs for every run lifecycle transition with trace and tenant context
- [ ] `P4-G-04` Add dashboards for queue depth, degraded mode frequency, and stop-request rates
- [ ] `P4-G-05` Add incident timelines that stitch together audit events, run events, and provider failures
- [ ] `P4-G-06` Add alert routing for on-call, admin owners, and tenant-specific escalation
- [ ] `P4-G-07` Add operator annotations so incidents can be correlated with deploys and config changes
- [ ] `P4-G-08` Add error budget reporting and monthly SLO review summaries
- [ ] `P4-G-09` Add tests for observability payload completeness on core request paths
- [ ] `P4-G-10` Add synthetic smoke probes for login, launch, completion, artifact preview, and admin audit
- [ ] `P4-G-11` Add runbook links directly into alert payloads and admin health surfaces
- [ ] `P4-G-12` Document incident command flow, trace collection, and postmortem expectations

### 7.25 Future Platform Queue: `P4-H` Automated QA, Test Infrastructure, And Release Certification

- [ ] `P4-H-01` Split browser suites into smoke, regression, long-run, and production-like certification lanes
- [ ] `P4-H-02` Add deterministic seeded runtime fixtures for chat, retrieval, safety, and HITL scenarios
- [ ] `P4-H-03` Add snapshot baselines for admin tables, transcript panels, and artifact previews
- [ ] `P4-H-04` Add flaky-test detection and quarantine flow with owner tracking
- [ ] `P4-H-05` Add host-capability checks so browser suites can skip safely when runtime libs are missing
- [ ] `P4-H-06` Add ephemeral environment provisioning for branch-based QA
- [ ] `P4-H-07` Add scripted public-access QA fallback using `cloudflared` when stable ingress is unavailable
- [ ] `P4-H-08` Add scripted `80/443` smoke checks for same-origin proxy correctness and export headers
- [ ] `P4-H-09` Add pre-release certification scripts that run auth, workspace, admin, safety, and backup drills
- [ ] `P4-H-10` Add release checklists that force plan/doc/dev-log updates before merge
- [ ] `P4-H-11` Add artifact retention and pruning for CI logs, traces, screenshots, and replay fixtures
- [ ] `P4-H-12` Document the exact QA matrix that a fresh AI session should rerun before claiming readiness

### 7.26 Future Platform Queue: `P4-I` Documentation, Onboarding, And AI-Session Continuity

- [ ] `P4-I-01` Define a required dev-log template for code, test, infra, and browser-validation continuity
- [ ] `P4-I-02` Add a rolling environment-status document with active ports, ingress rules, and known host caveats
- [ ] `P4-I-03` Add architecture diagrams for auth, chat runtime, persistence, and admin governance flows
- [ ] `P4-I-04` Add a “new AI session bootstrap” guide that explains where to read first and what to verify
- [ ] `P4-I-05` Add a release-state document mapping completed plan items to shipped user-facing behavior
- [ ] `P4-I-06` Add a “known flaky host behaviors” appendix with mitigation commands and recovery steps
- [ ] `P4-I-07` Add onboarding checklists for local dev, browser QA, staging deploy, and production diagnostics
- [ ] `P4-I-08` Add naming/versioning rules for plans, migrations, fixtures, and seeded app data
- [ ] `P4-I-09` Add ownership fields to long-range plan items so future sessions can group work coherently
- [ ] `P4-I-10` Add archival rules for old dev logs, stale plans, and superseded deployment guides
- [ ] `P4-I-11` Add documentation coverage checks into CI so critical guides cannot silently drift
- [ ] `P4-I-12` Document what must be pushed to git before ending any long-running implementation round

## 8. References

- [PHASE1_DEVELOPMENT_PLAN](./PHASE1_DEVELOPMENT_PLAN.md)
- [/home/bistu/zyr/pros/agentifui-docs/roadmap/ROADMAP_V1_0.md](/home/bistu/zyr/pros/agentifui-docs/roadmap/ROADMAP_V1_0.md)
- [/home/bistu/zyr/pros/agentifui-docs/roadmap/PHASE1_BACKLOG.md](/home/bistu/zyr/pros/agentifui-docs/roadmap/PHASE1_BACKLOG.md)
