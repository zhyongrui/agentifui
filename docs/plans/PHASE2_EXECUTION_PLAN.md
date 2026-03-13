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

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| P2-A1 | Assistant 消息反馈 | 用户可对 assistant 回复标记 helpful / needs-work | feedback 持久化 + 浏览器验证 |
| P2-A2 | 消息动作补齐 | copy / retry / quote / regenerate 等常用动作成型 | chat 操作区可用 |
| P2-A3 | Markdown/公式渲染 | assistant 内容支持 markdown 与 LaTeX 基础展示 | 前端渲染测试通过 |
| P2-A4 | 推荐下一问 | assistant 输出可附带 suggested prompts | shared 合同与 UI 落地 |
| P2-A5 | 会话整理能力 | archive / pin / rename / delete 闭环 | history 与 detail 同步 |
| P2-A6 | 对话搜索增强 | 按 tag、attachment、feedback、status 过滤历史 | `/chat` 检索增强 |

### P2-B Artifacts And Structured Outputs

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| P2-B1 | Artifact 合同 | 统一 artifact DTO、类型和来源 | shared 合同冻结 |
| P2-B2 | Artifact 持久化 | run 输出与 artifact 记录关联 | DB + service 完成 |
| P2-B3 | Artifact 预览页 | 文本/JSON/表格/链接等基础预览 | web 页面可用 |
| P2-B4 | Artifact 下载与分享边界 | 仅授权用户可访问 artifact | route + auth 完成 |
| P2-B5 | Artifact 审计 | 生成、查看、下载进入 audit | admin/audit 可查 |

### P2-C Human-In-The-Loop

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| P2-C1 | HITL step 合同 | approval / input-request step 统一建模 | shared 合同冻结 |
| P2-C2 | pending-action route | 前端可读取当前待处理动作 | gateway route 完成 |
| P2-C3 | step 响应提交 | 用户可 approve / reject / fill form | route + persistence 完成 |
| P2-C4 | 对话内 HITL 展示 | chat 页面显示待处理卡片 | 浏览器验证通过 |
| P2-C5 | 审计与超时 | HITL 响应、超时、放弃可追踪 | audit + tests 完成 |

### P2-D Runtime, Citations And Safety

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| P2-D1 | run failure taxonomy | 失败原因结构化呈现 | run detail 丰富化 |
| P2-D2 | 引用结果展示 | assistant 回复可附 citation/source block | UI + contract 完成 |
| P2-D3 | prompt injection 标记 | run 输出可带安全告警元数据 | route + UI 完成 |
| P2-D4 | app runtime abstraction | placeholder protocol 向真实 runtime adapter 演进 | gateway adapter 初版可用 |
| P2-D5 | degraded fallback | runtime 不可用时保留只读/历史能力 | browser 验证通过 |

### P2-E Ops And Multi-Session Scale

| 编号 | 任务 | 目标 | 完成定义 |
|------|------|------|----------|
| P2-E1 | session/archive cleanup job | 历史会话清理和归档策略明确 | job + doc |
| P2-E2 | load/perf smoke | 对关键 auth/chat/admin 路径做轻量压测 | 脚本可运行 |
| P2-E3 | tenant usage analytics | 平台可看租户 usage 汇总 | admin UI 可用 |
| P2-E4 | backup/export drill | 关键数据导出与恢复演练文档 | 文档 + smoke |

## 4. Current Active Queue

Default execution order after Phase 1 closeout:

1. `P2-A3` Markdown / 公式渲染
2. `P2-B1` Artifact 合同
3. `P2-B2` Artifact 持久化
4. `P2-C1` HITL step 合同

Execution status:

| 状态 | 任务 | 说明 |
|------|------|------|
| completed | `P2-A1` | assistant feedback 已持久化，含 audit、route、browser 回归 |
| completed | `P2-A2` | transcript 已补齐 copy / quote / retry / regenerate 基础动作 |
| active | `P2-A3` | 下一项，先做 markdown/code/math 渲染能力 |
| queued | `P2-B1` | 在 transcript 渲染稳定后冻结 artifact 合同 |
| queued | `P2-B2` | 依赖 artifact 合同和 run 输出边界 |

## 5. First Batch Definition

### Batch P2-A

This batch should stay focused on the existing conversation transcript model before opening bigger runtime/artifact work:

- `P2-A1` Assistant 消息反馈
- `P2-A2` 消息动作补齐
- `P2-A3` Markdown / 公式渲染

Completion bar for the batch:

- shared contracts updated
- gateway persistent + in-memory services updated
- web chat page updated
- unit + persistence + browser verification completed
- dev log updated with any new operational gotchas

Current batch status:

- `P2-A1` complete
- `P2-A2` complete
- `P2-A3` active

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

### Operational Continuity

- browser tests that assert root-admin navigation should wait for `/api/gateway/admin/context`
  - the `Tenants` nav item is capability-driven and arrives asynchronously
- the new workspace feedback audit types extend shared auth unions
  - `AuthAuditAction` now includes `workspace.message.feedback.updated`
  - `AuthAuditEntityType` now includes `conversation_message`

## 7. References

- [PHASE1_DEVELOPMENT_PLAN](./PHASE1_DEVELOPMENT_PLAN.md)
- [/home/bistu/zyr/pros/agentifui-docs/roadmap/ROADMAP_V1_0.md](/home/bistu/zyr/pros/agentifui-docs/roadmap/ROADMAP_V1_0.md)
- [/home/bistu/zyr/pros/agentifui-docs/roadmap/PHASE1_BACKLOG.md](/home/bistu/zyr/pros/agentifui-docs/roadmap/PHASE1_BACKLOG.md)
