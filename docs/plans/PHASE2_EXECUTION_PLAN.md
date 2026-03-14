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
4. `P2-C1` HITL step 合同
5. `P2-C2` pending-action route

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
| active    | `P2-B3` | 下一项，做 artifact 基础预览页和 run/message 入口                     |

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
- the active follow-on item is `P2-B3`

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
- if you need more visibility than the silent `npm test` wrapper gives during persistence
  - run `npm run test:unit` and `npm run test:persistence` sequentially
  - do not overlap persistence and Playwright on the shared Postgres DB
- do not add a dedicated artifact DB table during `P2-B1`
  - the contract is now frozen, but storage normalization belongs to `P2-B2`
  - until then, artifact summaries come from `messageHistory` and full payloads come from `runs.outputs`
- `P2-B2` now owns the dedicated artifact table
  - keep `runs.outputs.artifacts` populated for backward compatibility and graceful fallback
  - the new table is the preferred source for route reads and future preview/download flows

## 7. References

- [PHASE1_DEVELOPMENT_PLAN](./PHASE1_DEVELOPMENT_PLAN.md)
- [/home/bistu/zyr/pros/agentifui-docs/roadmap/ROADMAP_V1_0.md](/home/bistu/zyr/pros/agentifui-docs/roadmap/ROADMAP_V1_0.md)
- [/home/bistu/zyr/pros/agentifui-docs/roadmap/PHASE1_BACKLOG.md](/home/bistu/zyr/pros/agentifui-docs/roadmap/PHASE1_BACKLOG.md)
